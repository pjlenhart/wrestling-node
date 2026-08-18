/**
 * The write path, against a real database.
 *
 * Everything here runs inside a transaction that is rolled back at the end, so
 * a full run leaves nothing behind. That matters more than usual: the rows this
 * writes are match history, and a stray one is indistinguishable from a real
 * result once it is there.
 *
 *   DB_HOST=localhost DB_USER=root DB_PASS=... npm run test:ingest
 *
 * It refuses to run against anything but localhost.
 */

import assert from 'assert';
import { RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import { asyncTest, describe, finish } from '../scoring/harness';
import { assertLocalDatabase, closePool, pool } from '../database/pool';
import { deriveLiveSheet, LiveSheet, SIDE_BOTH, SIDE_OURS, SIDE_THEIRS, BOUT_FINAL } from '../scoring/liveBout';
import { commitDual, IngestError } from './ingest';

assertLocalDatabase();

/** A date far enough out that it cannot collide with real history. */
const TEST_DATE = '2099-12-31';
const TEST_OPPONENT = 'Test Opponent Academy';

async function rosterName(conn: PoolConnection): Promise<{ id: number; name: string }> {
    const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT wrestler_id, wrestler_name FROM wrestling_wrestler LIMIT 1',
    );
    if (!rows.length) throw new Error('the local database has no wrestlers to test with');
    return { id: rows[0].wrestler_id, name: rows[0].wrestler_name };
}

function sheetWith(bouts: LiveSheet['bouts']): LiveSheet {
    return {
        matchDate: TEST_DATE,
        opponentSchool: TEST_OPPONENT,
        venue: 'Home',
        bouts,
    };
}

/** Run one case in its own transaction, then throw the changes away. */
async function inRollback(work: (conn: PoolConnection) => Promise<void>): Promise<void> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        try {
            await work(conn);
        } finally {
            await conn.rollback();
        }
    } finally {
        conn.release();
    }
}

async function main(): Promise<void> {
    describe('committing a dual');

    await asyncTest('writes a team match, a match, and a regular season row', async () => {
        await inRollback(async (conn) => {
            const wrestler = await rosterName(conn);

            const sheet = sheetWith([
                {
                    weight: 106,
                    wrestlerId: wrestler.id,
                    wrestler: wrestler.name,
                    opponent: 'J. Ramos',
                    status: BOUT_FINAL,
                    events: [
                        { side: SIDE_OURS, period: '1', token: 'T3' },
                        { side: SIDE_THEIRS, period: '2', token: 'E1' },
                        { side: SIDE_OURS, period: '3', token: 'Pin' },
                    ],
                },
            ]);

            const derived = deriveLiveSheet(sheet);
            const result = await commitDual(conn, sheet, derived);

            assert.strictEqual(result.recorded, 1);
            assert.strictEqual(result.ourScore, 6);
            assert.strictEqual(result.opponentScore, 0);

            const [teamRows] = await conn.query<RowDataPacket[]>(
                'SELECT * FROM wrestling_teammatch WHERE team_match_id = ?',
                [result.teamMatchId],
            );
            assert.strictEqual(teamRows.length, 1);
            assert.strictEqual(teamRows[0].team_score, 6);
            assert.strictEqual(teamRows[0].opponent_score, 0);
            assert.strictEqual(teamRows[0].team_result, 'Win');

            const [matchRows] = await conn.query<RowDataPacket[]>(
                'SELECT * FROM wrestling_match WHERE match_id = ?',
                [result.matchIds[0]],
            );
            assert.strictEqual(matchRows.length, 1);
            assert.strictEqual(matchRows[0].weight_class, 106);
            assert.strictEqual(matchRows[0].wrestler_id, wrestler.id);
            assert.strictEqual(matchRows[0].match_result, 'Win');
            assert.strictEqual(matchRows[0].team_match_id, result.teamMatchId);

            const [seasonRows] = await conn.query<RowDataPacket[]>(
                'SELECT * FROM wrestling_regularseason WHERE match_id = ?',
                [result.matchIds[0]],
            );
            assert.strictEqual(seasonRows.length, 1);
            const season = seasonRows[0];
            assert.strictEqual(season.takedowns_for, 1);
            assert.strictEqual(season.takedown_points_for, 3);
            assert.strictEqual(season.escapes_against, 1);
            assert.strictEqual(season.escape_points_against, 1);
            assert.strictEqual(season.total_points_for, 3);
            assert.strictEqual(season.total_points_against, 1);
            assert.strictEqual(season.point_margin, 2);
            assert.strictEqual(season.method_of_result, 'Pin');
            assert.strictEqual(season.period, '3rd');
            assert.strictEqual(season.team_points_earned, 6);
        });
    });

    await asyncTest('keeps our forfeits and double forfeits out of the match tables', async () => {
        await inRollback(async (conn) => {
            const wrestler = await rosterName(conn);

            const sheet = sheetWith([
                { weight: 106, wrestlerId: wrestler.id, wrestler: wrestler.name, forfeit: SIDE_THEIRS, status: BOUT_FINAL },
                { weight: 113, opponent: 'Someone', forfeit: SIDE_OURS, status: BOUT_FINAL },
                { weight: 120, forfeit: SIDE_BOTH, status: BOUT_FINAL },
            ]);

            const derived = deriveLiveSheet(sheet);
            const result = await commitDual(conn, sheet, derived);

            // Only the bout we actually won by forfeit is recorded, but the
            // opponent's six points still reached the team match.
            assert.strictEqual(result.recorded, 1);
            assert.strictEqual(result.ourScore, 6);
            assert.strictEqual(result.opponentScore, 6);

            const [rows] = await conn.query<RowDataPacket[]>(
                'SELECT weight_class FROM wrestling_match WHERE team_match_id = ?',
                [result.teamMatchId],
            );
            assert.deepStrictEqual(rows.map((r) => r.weight_class), [106]);
        });
    });

    await asyncTest('refuses a dual that is already recorded', async () => {
        await inRollback(async (conn) => {
            const wrestler = await rosterName(conn);
            const sheet = sheetWith([
                { weight: 106, wrestlerId: wrestler.id, wrestler: wrestler.name, forfeit: SIDE_THEIRS, status: BOUT_FINAL },
            ]);

            await commitDual(conn, sheet, deriveLiveSheet(sheet));

            await assert.rejects(
                () => commitDual(conn, sheet, deriveLiveSheet(sheet)),
                (err: IngestError) => err.status === 409 && /already recorded/.test(err.message),
            );
        });
    });

    await asyncTest('refuses a wrestler who is not on the roster', async () => {
        await inRollback(async (conn) => {
            const sheet = sheetWith([
                {
                    weight: 106,
                    wrestler: 'Nobody At All ' + Date.now(),
                    opponent: 'Someone',
                    status: BOUT_FINAL,
                    events: [{ side: SIDE_OURS, period: '1', token: 'Pin' }],
                },
            ]);

            await assert.rejects(
                () => commitDual(conn, sheet, deriveLiveSheet(sheet)),
                /is not on the roster/,
            );
        });
    });

    await asyncTest('writes nothing at all when one bout fails', async () => {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const wrestler = await rosterName(conn);

            const sheet = sheetWith([
                {
                    weight: 106,
                    wrestlerId: wrestler.id,
                    wrestler: wrestler.name,
                    opponent: 'Fine',
                    status: BOUT_FINAL,
                    events: [{ side: SIDE_OURS, period: '1', token: 'Pin' }],
                },
                {
                    weight: 113,
                    wrestler: 'Not On The Roster ' + Date.now(),
                    opponent: 'Also fine',
                    status: BOUT_FINAL,
                    events: [{ side: SIDE_OURS, period: '1', token: 'Pin' }],
                },
            ]);

            await assert.rejects(() => commitDual(conn, sheet, deriveLiveSheet(sheet)));
            await conn.rollback();

            // After the rollback the first bout's team match must be gone too.
            const [rows] = await conn.query<RowDataPacket[]>(
                'SELECT team_match_id FROM wrestling_teammatch WHERE match_date = ? AND opponent_school = ?',
                [TEST_DATE, TEST_OPPONENT],
            );
            assert.strictEqual(rows.length, 0, 'a partial dual survived the rollback');
        } finally {
            conn.release();
        }
    });

    await asyncTest('refuses a sheet that does not add up', async () => {
        await inRollback(async (conn) => {
            const sheet = sheetWith([
                { weight: 106, wrestler: '', opponent: 'Someone', status: BOUT_FINAL },
            ]);
            await assert.rejects(
                () => commitDual(conn, sheet, deriveLiveSheet(sheet)),
                /does not add up/,
            );
        });
    });

    await closePool();
    finish();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
