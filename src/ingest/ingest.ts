/**
 * Writing a scored dual into the match tables.
 *
 * One dual becomes one `wrestling_teammatch` row, plus a `wrestling_match` and
 * a matching `wrestling_regularseason` row for every bout worth recording. It
 * all happens in a single transaction: a dual that landed a team match and half
 * its bouts would be harder to notice, and harder to undo, than one that failed
 * outright.
 *
 * Nothing here derives anything. The numbers come from the scoring engine, and
 * this module's only job is to put them somewhere.
 */

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { DerivedBout, totalPoints } from '../scoring/scoring';
import { LiveDualResult, LiveSheet } from '../scoring/liveBout';

export class IngestError extends Error {
    readonly status: number;

    constructor(message: string, status = 422) {
        super(message);
        this.status = status;
    }
}

export interface CommitResult {
    teamMatchId: number;
    matchIds: number[];
    ourScore: number;
    opponentScore: number;
    recorded: number;
    skipped: number;
}

/** Fall times are not tracked, and the column will not take a null. */
const NO_MATCH_TIME = '00:00:00';

/**
 * Resolve the opponent school, creating it only when it is genuinely new.
 *
 * The id from the picklist is trusted when present. A typed name is matched
 * case-insensitively before anything is inserted, so a school does not end up
 * in the directory twice under different capitalisation.
 */
async function resolveSchool(conn: PoolConnection, sheet: LiveSheet): Promise<number | null> {
    if (sheet.opponentSchoolId) {
        const [rows] = await conn.query<RowDataPacket[]>(
            'SELECT school_id FROM wrestling_school WHERE school_id = ?',
            [sheet.opponentSchoolId],
        );
        if (rows.length) return rows[0].school_id;
    }

    const name = String(sheet.opponentSchool || '').trim();
    if (!name) return null;

    const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT school_id FROM wrestling_school WHERE LOWER(school_name) = LOWER(?) LIMIT 1',
        [name],
    );
    if (rows.length) return rows[0].school_id;

    const [result] = await conn.query<ResultSetHeader>(
        'INSERT INTO wrestling_school (school_name, city, state) VALUES (?, ?, ?)',
        [name, '', ''],
    );
    return result.insertId;
}

/**
 * Resolve one of our wrestlers to a roster id.
 *
 * The id bound by the picklist is preferred. A bare name is matched against the
 * roster, and a name that matches nothing is refused rather than inserted --
 * inventing a wrestler to make an import succeed is how a roster fills up with
 * misspellings.
 */
async function resolveWrestler(conn: PoolConnection, bout: DerivedBout): Promise<number> {
    if (bout.wrestlerId) {
        const [rows] = await conn.query<RowDataPacket[]>(
            'SELECT wrestler_id FROM wrestling_wrestler WHERE wrestler_id = ?',
            [bout.wrestlerId],
        );
        if (rows.length) return rows[0].wrestler_id;
    }

    const name = String(bout.wrestler || '').trim();
    if (!name) {
        throw new IngestError(`${bout.weight}: no wrestler to record this bout against`);
    }

    const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT wrestler_id FROM wrestling_wrestler WHERE LOWER(wrestler_name) = LOWER(?) LIMIT 1',
        [name],
    );
    if (rows.length) return rows[0].wrestler_id;

    throw new IngestError(
        `${bout.weight}: '${name}' is not on the roster. Add them first, or pick an existing wrestler.`,
    );
}

/**
 * Refuse a dual that is already recorded.
 *
 * Team matches are keyed in practice by who and when, so a second submission of
 * the same dual would silently double every wrestler's record. Better to stop
 * and let a human decide than to write it twice.
 */
async function assertNotAlreadyRecorded(conn: PoolConnection, sheet: LiveSheet): Promise<void> {
    const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT team_match_id FROM wrestling_teammatch WHERE LOWER(opponent_school) = LOWER(?) AND match_date = ?',
        [sheet.opponentSchool, sheet.matchDate],
    );
    if (rows.length) {
        throw new IngestError(
            `a dual against ${sheet.opponentSchool} on ${sheet.matchDate} is already recorded ` +
                `(team match ${rows[0].team_match_id}). Delete it first if you meant to replace it.`,
            409,
        );
    }
}

async function insertTeamMatch(
    conn: PoolConnection,
    sheet: LiveSheet,
    derived: LiveDualResult,
): Promise<number> {
    const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO wrestling_teammatch
            (opponent_school, match_date, team_score, opponent_score, team_result)
         VALUES (?, ?, ?, ?, ?)`,
        [
            sheet.opponentSchool,
            sheet.matchDate,
            derived.ourScore,
            derived.opponentScore,
            derived.ourScore >= derived.opponentScore ? 'Win' : 'Loss',
        ],
    );
    return result.insertId;
}

async function insertBout(
    conn: PoolConnection,
    bout: DerivedBout,
    sheet: LiveSheet,
    teamMatchId: number,
    schoolId: number | null,
): Promise<number> {
    const wrestlerId = await resolveWrestler(conn, bout);

    const [matchResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO wrestling_match
            (opponent_name, match_date, match_result, team_match_id, school_id, wrestler_id, weight_class)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            bout.opponent || '',
            sheet.matchDate,
            bout.result,
            teamMatchId,
            schoolId,
            wrestlerId,
            bout.weight,
        ],
    );

    const matchId = matchResult.insertId;
    const { ours, theirs } = bout;

    await conn.query(
        `INSERT INTO wrestling_regularseason (
            match_id, team_match_id,
            takedowns_for, takedowns_against,
            reversals_for, reversals_against,
            escapes_for, escapes_against,
            nearfall_for, nearfall_against,
            takedown_points_for, takedown_points_against,
            reversal_points_for, reversal_points_against,
            escape_points_for, escape_points_against,
            nearfall_points_for, nearfall_points_against,
            penalties_for, penalty_points_for,
            penalties_against, penalty_points_against,
            total_points_for, total_points_against,
            point_margin, method_of_result, period, match_time, team_points_earned
        ) VALUES (${new Array(29).fill('?').join(', ')})`,
        [
            matchId,
            teamMatchId,
            ours.takedowns,
            theirs.takedowns,
            ours.reversals,
            theirs.reversals,
            ours.escapes,
            theirs.escapes,
            ours.nearfall,
            theirs.nearfall,
            ours.takedownPoints,
            theirs.takedownPoints,
            ours.reversalPoints,
            theirs.reversalPoints,
            ours.escapePoints,
            theirs.escapePoints,
            ours.nearfallPoints,
            theirs.nearfallPoints,
            ours.penalties,
            ours.penaltyPoints,
            theirs.penalties,
            theirs.penaltyPoints,
            totalPoints(ours),
            totalPoints(theirs),
            bout.pointMargin,
            bout.method,
            bout.period,
            NO_MATCH_TIME,
            bout.teamPointsFor,
        ],
    );

    return matchId;
}

/**
 * Write a derived dual into the match tables.
 *
 * Must be called inside a transaction. The caller decides what happens on
 * failure; this only throws.
 */
export async function commitDual(
    conn: PoolConnection,
    sheet: LiveSheet,
    derived: LiveDualResult,
): Promise<CommitResult> {
    if (derived.errors.length) {
        throw new IngestError(`this sheet does not add up: ${derived.errors.join('; ')}`);
    }
    if (!derived.insertable.length) {
        throw new IngestError('there is nothing to record: no bout on this sheet was scored');
    }

    await assertNotAlreadyRecorded(conn, sheet);

    const schoolId = await resolveSchool(conn, sheet);
    const teamMatchId = await insertTeamMatch(conn, sheet, derived);

    const matchIds: number[] = [];
    for (const bout of derived.insertable) {
        matchIds.push(await insertBout(conn, bout, sheet, teamMatchId, schoolId));
    }

    return {
        teamMatchId,
        matchIds,
        ourScore: derived.ourScore,
        opponentScore: derived.opponentScore,
        recorded: matchIds.length,
        skipped: derived.bouts.length - matchIds.length,
    };
}
