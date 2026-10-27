/**
 * Writing a tournament bout into the match tables.
 *
 * One bout becomes one `wrestling_match` row under the individual team match,
 * plus the `wrestling_postseason` row beside it. Both land in one transaction,
 * for the same reason a dual does: a match with no postseason row would count
 * on a wrestler's record while showing no method, period or tournament.
 *
 * As with duals, nothing here derives anything. The numbers come from
 * `deriveTournamentBout`, and this module only puts them somewhere.
 */

import { PoolConnection } from 'mysql2/promise';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
    INDIVIDUAL_TEAM_MATCH_ID,
    TournamentResult,
    TournamentSheet,
} from '../scoring/tournamentBout';
import { IngestError, resolveSchool, resolveWrestler } from './ingest';

export interface TournamentCommitResult {
    /** Null when nothing was written, which is what a bout we forfeited writes. */
    matchId: number | null;
    recorded: boolean;
    result: string | null;
    method: string | null;
}

/**
 * Refuse a bout that is already on the wrestler's record.
 *
 * Tournament bouts have no team match of their own to key on, so who, when and
 * against whom is the closest thing to an identity they have. That catches a
 * bout entered once here and once through the admin.
 */
async function assertBoutNotRecorded(
    conn: PoolConnection,
    wrestlerId: number,
    sheet: TournamentSheet,
): Promise<void> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT match_id FROM wrestling_match
         WHERE team_match_id = ? AND wrestler_id = ? AND match_date = ?
           AND LOWER(opponent_name) = LOWER(?)`,
        [INDIVIDUAL_TEAM_MATCH_ID, wrestlerId, sheet.matchDate, sheet.bout.opponent],
    );
    if (rows.length) {
        throw new IngestError(
            `${sheet.bout.wrestler} against ${sheet.bout.opponent} on ${sheet.matchDate} is already ` +
                `recorded (match ${rows[0].match_id}). Delete it first if you meant to replace it.`,
            409,
        );
    }
}

/**
 * The breakdown columns and their values, in one list.
 *
 * The table's CHECK constraint makes the breakdown all or nothing, so a bout
 * without one writes a NULL into every column rather than a zero into any.
 */
function breakdownColumns(derived: TournamentResult): [string, number | null][] {
    const b = derived.breakdown;
    const pick = (value: (side: NonNullable<typeof b>['ours']) => number, side: 'ours' | 'theirs') =>
        b ? value(b[side]) : null;

    return [
        ['takedowns_for', pick((s) => s.takedowns, 'ours')],
        ['takedowns_against', pick((s) => s.takedowns, 'theirs')],
        ['reversals_for', pick((s) => s.reversals, 'ours')],
        ['reversals_against', pick((s) => s.reversals, 'theirs')],
        ['escapes_for', pick((s) => s.escapes, 'ours')],
        ['escapes_against', pick((s) => s.escapes, 'theirs')],
        ['nearfall_for', pick((s) => s.nearfall, 'ours')],
        ['nearfall_against', pick((s) => s.nearfall, 'theirs')],
        ['takedown_points_for', pick((s) => s.takedownPoints, 'ours')],
        ['takedown_points_against', pick((s) => s.takedownPoints, 'theirs')],
        ['reversal_points_for', pick((s) => s.reversalPoints, 'ours')],
        ['reversal_points_against', pick((s) => s.reversalPoints, 'theirs')],
        ['escape_points_for', pick((s) => s.escapePoints, 'ours')],
        ['escape_points_against', pick((s) => s.escapePoints, 'theirs')],
        ['nearfall_points_for', pick((s) => s.nearfallPoints, 'ours')],
        ['nearfall_points_against', pick((s) => s.nearfallPoints, 'theirs')],
        ['penalties_for', pick((s) => s.penalties, 'ours')],
        ['penalties_against', pick((s) => s.penalties, 'theirs')],
        ['penalty_points_for', pick((s) => s.penaltyPoints, 'ours')],
        ['penalty_points_against', pick((s) => s.penaltyPoints, 'theirs')],
    ];
}

/**
 * Write a derived tournament bout into the match tables.
 *
 * Must be called inside a transaction. The caller decides what happens on
 * failure; this only throws.
 */
export async function commitTournamentBout(
    conn: PoolConnection,
    sheet: TournamentSheet,
    derived: TournamentResult,
): Promise<TournamentCommitResult> {
    if (derived.errors.length) {
        throw new IngestError(`this bout cannot be recorded: ${derived.errors.join('; ')}`);
    }

    // A bout we forfeited is kept on the sheet, but nothing about it belongs
    // on our wrestler's record -- the same rule duals follow.
    if (!derived.record) {
        return { matchId: null, recorded: false, result: null, method: derived.method };
    }

    const bout = sheet.bout;
    const wrestlerId = await resolveWrestler(conn, {
        weight: bout.weight,
        wrestler: bout.wrestler ?? null,
        wrestlerId: bout.wrestlerId ?? null,
    });

    await assertBoutNotRecorded(conn, wrestlerId, sheet);

    const schoolId = await resolveSchool(conn, sheet);

    const [matchResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO wrestling_match
            (opponent_name, match_date, match_result, team_match_id, school_id, wrestler_id, weight_class)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            bout.opponent || '',
            sheet.matchDate,
            derived.result,
            INDIVIDUAL_TEAM_MATCH_ID,
            schoolId,
            wrestlerId,
            bout.weight,
        ],
    );
    const matchId = matchResult.insertId;

    const breakdown = breakdownColumns(derived);
    const columns = [
        'match_id',
        'tournament',
        'match_time',
        'points_for',
        'points_against',
        'method_of_result',
        'period',
        ...breakdown.map(([column]) => column),
    ];
    // The columns will not take a NULL, so a bout with no score -- a forfeit,
    // or a pin entered from the bracket without one -- is stored as 0-0.
    const values = [
        matchId,
        sheet.tournament,
        derived.matchTime,
        derived.pointsFor ?? 0,
        derived.pointsAgainst ?? 0,
        derived.method,
        derived.period,
        ...breakdown.map(([, value]) => value),
    ];

    await conn.query(
        `INSERT INTO wrestling_postseason (${columns.join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
        values,
    );

    return { matchId, recorded: true, result: derived.result, method: derived.method };
}
