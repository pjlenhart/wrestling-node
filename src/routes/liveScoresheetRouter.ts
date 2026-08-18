/**
 * The scoresheet API.
 *
 * Reading is public; submitting and deleting go through `requireStaff`.
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

/** List every submitted sheet, newest first. Public. */
liveScoresheetRouter.get('/', async (_req: Request, res: Response) => {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT scoresheet_id, match_date, opponent_school, venue, our_score, opponent_score,
                    official_our_score, official_opponent_score, status, submitted_by, submitted_at,
                    committed_at, team_match_id
             FROM wrestling_livescoresheet
             ORDER BY match_date DESC, scoresheet_id DESC`,
        );
        res.json(rows);
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
