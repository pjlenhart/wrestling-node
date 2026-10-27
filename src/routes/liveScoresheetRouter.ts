/**
 * The scoresheet API.
 *
 * Reading is public; submitting and deleting go through `requireStaff`.
 *
 * Two kinds of sheet share the table. A dual is fourteen bouts against one
 * school. A tournament sheet is a single bout, and is told apart by carrying
 * the individual team match id from the moment it is stored -- which is also
 * simply true, since that is the team match its bout is recorded under.
 *
 * A submitted sheet is stored before anything is written to the match tables,
 * and it is stored whether or not that write succeeds. Somebody scored a whole
 * dual to produce it -- losing it because a wrestler was missing from the
 * roster would be the worst possible outcome.
 */

import { Request, Response } from 'express';
import { PoolConnection } from 'mysql2/promise';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool, withTransaction } from '../database/pool';
import { LiveSheet, deriveLiveSheet } from '../scoring/liveBout';
import { commitDual, IngestError } from '../ingest/ingest';
import {
    INDIVIDUAL_TEAM_MATCH_ID,
    TournamentBout,
    TournamentResult,
    TournamentSheet,
    deriveTournamentBout,
} from '../scoring/tournamentBout';
import { commitTournamentBout } from '../ingest/tournamentIngest';
import requireStaff from '../middleware/requireStaff';

const express = require('express');

const liveScoresheetRouter = express.Router();

const STATUS_SUBMITTED = 'Submitted';
const STATUS_COMMITTED = 'Committed';

/** Reject a body that cannot be scored, with a message worth reading. */
function validate(body: any): string[] {
    const problems: string[] = [];

    if (!body || typeof body !== 'object') {
        return ['no scoresheet was sent'];
    }
    if (!body.matchDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.matchDate))) {
        problems.push('matchDate must be a date like 2026-01-08');
    }
    if (!String(body.opponentSchool || '').trim()) {
        problems.push('opponentSchool is required');
    }
    if (!Array.isArray(body.bouts) || body.bouts.length === 0) {
        problems.push('bouts must be a non-empty list');
    } else {
        for (const bout of body.bouts) {
            if (typeof bout.weight !== 'number') {
                problems.push('every bout needs a numeric weight');
                break;
            }
        }
    }

    return problems;
}

/** A human-readable account of what the engine made of the sheet. */
function buildReport(derived: ReturnType<typeof deriveLiveSheet>, sheet: LiveSheet): string {
    const lines: string[] = [
        `Bouts scored: ${derived.decidedCount} (${derived.skipped} not counted)`,
        `Derived score: ${derived.ourScore}-${derived.opponentScore}`,
    ];

    if (sheet.officialOurScore !== null && sheet.officialOurScore !== undefined) {
        const official = `${sheet.officialOurScore}-${sheet.officialOpponentScore}`;
        lines.push(`Official book: ${official}`);
        if (
            sheet.officialOurScore !== derived.ourScore ||
            sheet.officialOpponentScore !== derived.opponentScore
        ) {
            lines.push('WARNING: the official score does not match what the bouts add up to.');
        }
    }

    for (const error of derived.errors) lines.push(`ERROR: ${error}`);
    for (const warning of derived.warnings) lines.push(`WARNING: ${warning}`);

    return lines.join('\n');
}

async function storeSheet(
    conn: PoolConnection,
    sheet: LiveSheet,
    derived: ReturnType<typeof deriveLiveSheet>,
    report: string,
    submittedBy: string,
): Promise<number> {
    const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO wrestling_livescoresheet (
            match_date, opponent_school, school_id, venue, starting_weight, bouts,
            our_score, opponent_score, official_our_score, official_opponent_score,
            status, report, notes, submitted_by, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            sheet.matchDate,
            sheet.opponentSchool,
            sheet.opponentSchoolId || null,
            sheet.venue === 'Away' ? 'Away' : 'Home',
            sheet.startingWeight || null,
            JSON.stringify(sheet.bouts || []),
            derived.ourScore,
            derived.opponentScore,
            sheet.officialOurScore ?? null,
            sheet.officialOpponentScore ?? null,
            STATUS_SUBMITTED,
            report,
            '',
            submittedBy,
        ],
    );
    return result.insertId;
}

function rowToSheet(row: RowDataPacket): LiveSheet {
    return {
        matchDate:
            row.match_date instanceof Date
                ? row.match_date.toISOString().slice(0, 10)
                : String(row.match_date),
        opponentSchool: row.opponent_school,
        opponentSchoolId: row.school_id,
        venue: row.venue,
        startingWeight: row.starting_weight,
        bouts: typeof row.bouts === 'string' ? JSON.parse(row.bouts) : row.bouts,
        officialOurScore: row.official_our_score,
        officialOpponentScore: row.official_opponent_score,
    };
}

/** The same checks as a dual, for a sheet that is one bout. */
function validateTournament(body: any): string[] {
    const problems: string[] = [];

    if (!body || typeof body !== 'object') {
        return ['no scoresheet was sent'];
    }
    if (!body.matchDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.matchDate))) {
        problems.push('matchDate must be a date like 2026-01-08');
    }
    if (!String(body.tournament || '').trim()) {
        problems.push('tournament is required');
    }
    if (!body.bout || typeof body.bout !== 'object') {
        problems.push('bout is required');
    } else if (typeof body.bout.weight !== 'number') {
        problems.push('the bout needs a numeric weight');
    }

    return problems;
}

function tournamentReport(derived: TournamentResult): string {
    const lines: string[] = [];

    if (!derived.record) {
        lines.push('We forfeited: nothing is recorded for our wrestler.');
    } else if (derived.result) {
        const score =
            derived.pointsFor !== null && derived.pointsAgainst !== null
                ? ` ${derived.pointsFor}-${derived.pointsAgainst}`
                : '';
        lines.push(`Result: ${derived.result} by ${derived.method}${score} (${derived.period})`);
        lines.push(derived.breakdown ? 'Full scoring breakdown recorded.' : 'Result only, no breakdown.');
    }

    for (const error of derived.errors) lines.push(`ERROR: ${error}`);
    for (const warning of derived.warnings) lines.push(`WARNING: ${warning}`);

    return lines.join('\n');
}

/**
 * The tournament's name rides along inside the bout.
 *
 * The table has no column for it, and the bout is the thing that belongs to
 * the tournament, so that is where it is kept.
 */
function storedTournamentBouts(sheet: TournamentSheet): string {
    return JSON.stringify([{ ...sheet.bout, tournament: sheet.tournament }]);
}

async function storeTournamentSheet(
    conn: PoolConnection,
    sheet: TournamentSheet,
    derived: TournamentResult,
    report: string,
    submittedBy: string,
): Promise<number> {
    const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO wrestling_livescoresheet (
            match_date, opponent_school, school_id, venue, starting_weight, bouts,
            our_score, opponent_score, official_our_score, official_opponent_score,
            status, report, notes, submitted_by, submitted_at, team_match_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
            sheet.matchDate,
            sheet.opponentSchool || '',
            sheet.opponentSchoolId || null,
            // Home and away mean nothing for one bout at a tournament.
            null,
            null,
            storedTournamentBouts(sheet),
            // Team score. A single bout has none.
            null,
            null,
            null,
            null,
            STATUS_SUBMITTED,
            report,
            '',
            submittedBy,
            INDIVIDUAL_TEAM_MATCH_ID,
        ],
    );
    return result.insertId;
}

function rowToTournamentSheet(row: RowDataPacket): TournamentSheet {
    const bouts = typeof row.bouts === 'string' ? JSON.parse(row.bouts) : row.bouts;
    const { tournament, ...bout } = (bouts && bouts[0]) || {};
    return {
        tournament: tournament || '',
        matchDate:
            row.match_date instanceof Date
                ? row.match_date.toISOString().slice(0, 10)
                : String(row.match_date),
        opponentSchool: row.opponent_school,
        opponentSchoolId: row.school_id,
        bout: bout as TournamentBout,
    };
}

const isTournamentRow = (row: RowDataPacket) => Number(row.team_match_id) === INDIVIDUAL_TEAM_MATCH_ID;

/**
 * Write a stored tournament sheet's bout and mark the sheet recorded.
 *
 * The match id goes back into the stored bout, since the sheet's own
 * `team_match_id` is the shared placeholder and says nothing about which match
 * this sheet produced.
 */
async function commitStoredTournament(
    conn: PoolConnection,
    scoresheetId: number,
    sheet: TournamentSheet,
    derived: TournamentResult,
) {
    const committed = await commitTournamentBout(conn, sheet, derived);
    const recorded: TournamentSheet = { ...sheet, bout: { ...sheet.bout, matchId: committed.matchId } };

    await conn.query(
        `UPDATE wrestling_livescoresheet
         SET status = ?, committed_at = NOW(), bouts = ?, report = ?
         WHERE scoresheet_id = ?`,
        [STATUS_COMMITTED, storedTournamentBouts(recorded), tournamentReport(derived), scoresheetId],
    );
    return committed;
}

/** List every submitted sheet, newest first. Public. */
liveScoresheetRouter.get('/', async (_req: Request, res: Response) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT scoresheet_id, match_date, opponent_school, venue, our_score, opponent_score,
                    official_our_score, official_opponent_score, status, submitted_by, submitted_at,
                    committed_at, team_match_id, bouts
             FROM wrestling_livescoresheet
             ORDER BY match_date DESC, scoresheet_id DESC`,
        );

        // The bouts are only read to describe a tournament sheet's one bout;
        // a dual's fourteen stay out of the list.
        res.json(
            rows.map(({ bouts, ...row }) => {
                if (!isTournamentRow(row as RowDataPacket)) return { ...row, kind: 'dual' };

                const sheet = rowToTournamentSheet({ ...row, bouts } as RowDataPacket);
                const derived = deriveTournamentBout(sheet);
                return {
                    ...row,
                    kind: 'tournament',
                    tournament: sheet.tournament,
                    weight: sheet.bout.weight,
                    wrestler: sheet.bout.wrestler,
                    opponent: sheet.bout.opponent,
                    match_id: sheet.bout.matchId ?? null,
                    recorded: derived.record,
                    result: derived.result,
                    method: derived.method,
                    period: derived.period,
                    points_for: derived.pointsFor,
                    points_against: derived.pointsAgainst,
                };
            }),
        );
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

/** One sheet, with its bouts, so it can be shown back. Public. */
liveScoresheetRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM wrestling_livescoresheet WHERE scoresheet_id = ?',
            [req.params.id],
        );
        if (!rows.length) {
            res.status(404).json({ error: 'no such scoresheet' });
            return;
        }

        const row = rows[0];
        res.json({
            ...row,
            kind: isTournamentRow(row) ? 'tournament' : 'dual',
            bouts: typeof row.bouts === 'string' ? JSON.parse(row.bouts) : row.bouts,
        });
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

/**
 * Submit a scored dual.
 *
 * Stores the sheet, then writes the match tables. The two are separate
 * transactions on purpose: if the write is refused, the sheet still exists and
 * can be corrected and committed, rather than the scorer being told to do the
 * whole dual again.
 */
liveScoresheetRouter.post('/', requireStaff, async (req: Request, res: Response) => {
    const problems = validate(req.body);
    if (problems.length) {
        res.status(400).json({ error: 'this scoresheet is not usable', problems });
        return;
    }

    const sheet: LiveSheet = req.body;
    const submittedBy = String((req as any).user?.username || req.body.submittedBy || '');

    let derived;
    try {
        derived = deriveLiveSheet(sheet);
    } catch (err) {
        res.status(422).json({ error: (err as Error).message });
        return;
    }

    const report = buildReport(derived, sheet);

    let scoresheetId: number;
    try {
        scoresheetId = await withTransaction((conn) =>
            storeSheet(conn, sheet, derived, report, submittedBy),
        );
    } catch (err) {
        res.status(500).json({ error: `the scoresheet could not be saved: ${(err as Error).message}` });
        return;
    }

    try {
        const result = await withTransaction(async (conn) => {
            const committed = await commitDual(conn, sheet, derived);
            await conn.query(
                `UPDATE wrestling_livescoresheet
                 SET status = ?, team_match_id = ?, committed_at = NOW()
                 WHERE scoresheet_id = ?`,
                [STATUS_COMMITTED, committed.teamMatchId, scoresheetId],
            );
            return committed;
        });

        res.status(201).json({ scoresheetId, status: STATUS_COMMITTED, report, ...result });
    } catch (err) {
        const status = err instanceof IngestError ? err.status : 500;
        res.status(status).json({
            error: (err as Error).message,
            // The sheet is safe even though nothing was recorded.
            scoresheetId,
            status: STATUS_SUBMITTED,
            report,
        });
    }
});

/**
 * Submit a scored tournament bout.
 *
 * The same two steps as a dual, for the same reason: the sheet is stored
 * first, so a bout that cannot be recorded -- a wrestler missing from the
 * roster, say -- is still kept and can be committed once that is fixed.
 */
liveScoresheetRouter.post('/tournament', requireStaff, async (req: Request, res: Response) => {
    const problems = validateTournament(req.body);
    if (problems.length) {
        res.status(400).json({ error: 'this scoresheet is not usable', problems });
        return;
    }

    const sheet: TournamentSheet = {
        tournament: String(req.body.tournament).trim(),
        matchDate: req.body.matchDate,
        opponentSchool: String(req.body.opponentSchool || '').trim(),
        opponentSchoolId: req.body.opponentSchoolId ?? null,
        bout: req.body.bout,
    };
    const submittedBy = String((req as any).user?.username || req.body.submittedBy || '');

    const derived = deriveTournamentBout(sheet);
    const report = tournamentReport(derived);

    let scoresheetId: number;
    try {
        scoresheetId = await withTransaction((conn) =>
            storeTournamentSheet(conn, sheet, derived, report, submittedBy),
        );
    } catch (err) {
        res.status(500).json({ error: `the scoresheet could not be saved: ${(err as Error).message}` });
        return;
    }

    try {
        const result = await withTransaction((conn) =>
            commitStoredTournament(conn, scoresheetId, sheet, derived),
        );
        res.status(201).json({ scoresheetId, status: STATUS_COMMITTED, report, ...result });
    } catch (err) {
        const status = err instanceof IngestError ? err.status : 500;
        res.status(status).json({
            error: (err as Error).message,
            // The sheet is safe even though nothing was recorded.
            scoresheetId,
            status: STATUS_SUBMITTED,
            report,
        });
    }
});

/** Retry the match-table write for a sheet that was stored but not committed. */
liveScoresheetRouter.post('/:id/commit', requireStaff, async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM wrestling_livescoresheet WHERE scoresheet_id = ?',
            [req.params.id],
        );
        if (!rows.length) {
            res.status(404).json({ error: 'no such scoresheet' });
            return;
        }
        if (rows[0].status === STATUS_COMMITTED) {
            res.status(409).json({ error: 'this scoresheet is already recorded' });
            return;
        }

        // A tournament sheet must never reach the dual path: it would be
        // written as a team match of its own.
        if (isTournamentRow(rows[0])) {
            const sheet = rowToTournamentSheet(rows[0]);
            const derived = deriveTournamentBout(sheet);
            const result = await withTransaction((conn) =>
                commitStoredTournament(conn, Number(req.params.id), sheet, derived),
            );
            res.json({ scoresheetId: Number(req.params.id), status: STATUS_COMMITTED, ...result });
            return;
        }

        const sheet = rowToSheet(rows[0]);
        const derived = deriveLiveSheet(sheet);

        const result = await withTransaction(async (conn) => {
            const committed = await commitDual(conn, sheet, derived);
            await conn.query(
                `UPDATE wrestling_livescoresheet
                 SET status = ?, team_match_id = ?, committed_at = NOW(), report = ?
                 WHERE scoresheet_id = ?`,
                [STATUS_COMMITTED, committed.teamMatchId, buildReport(derived, sheet), req.params.id],
            );
            return committed;
        });

        res.json({ scoresheetId: Number(req.params.id), status: STATUS_COMMITTED, ...result });
    } catch (err) {
        const status = err instanceof IngestError ? err.status : 500;
        res.status(status).json({ error: (err as Error).message });
    }
});

/** Remove a sheet. Does not touch anything it already wrote. */
liveScoresheetRouter.delete('/:id', requireStaff, async (req: Request, res: Response) => {
    try {
        const [result] = await pool.query<ResultSetHeader>(
            'DELETE FROM wrestling_livescoresheet WHERE scoresheet_id = ?',
            [req.params.id],
        );
        if (!result.affectedRows) {
            res.status(404).json({ error: 'no such scoresheet' });
            return;
        }
        res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

export default liveScoresheetRouter;
