/**
 * The tournament write path, against a stand-in connection.
 *
 * This is not the integration test -- that needs a real database, and this
 * one does not. It records every statement the commit issues and answers them
 * from a script, which is enough to pin down what is written, in what order,
 * and that every placeholder has a value. A miscounted VALUES list is the kind
 * of bug that only shows up on the first real submit, at a tournament.
 */

import assert from 'assert';
import { asyncTest, describe, finish } from '../scoring/harness';
import { deriveTournamentBout, TournamentSheet } from '../scoring/tournamentBout';
import { commitTournamentBout } from './tournamentIngest';
import { IngestError } from './ingest';

interface Statement {
    sql: string;
    params: unknown[];
}

/** A connection that answers each statement by matching its text. */
function fakeConnection(answers: { match: RegExp; rows: unknown }[]) {
    const statements: Statement[] = [];
    const conn = {
        statements,
        async query(sql: string, params: unknown[] = []) {
            statements.push({ sql, params });
            const answer = answers.find((a) => a.match.test(sql));
            if (/^\s*INSERT/i.test(sql)) return [{ insertId: 900 + statements.length }];
            return [answer ? answer.rows : []];
        },
    };
    return conn;
}

const ROSTER = { match: /FROM wrestling_wrestler/, rows: [{ wrestler_id: 7 }] };
const SCHOOL = { match: /FROM wrestling_school/, rows: [{ school_id: 31 }] };

function sheet(bout: Partial<TournamentSheet['bout']>): TournamentSheet {
    return {
        tournament: 'BCPS JV Invitational',
        matchDate: '2026-01-10',
        opponentSchool: 'Dulaney',
        opponentSchoolId: 31,
        bout: {
            weight: 145,
            wrestlerId: 7,
            wrestler: 'J. Smith',
            opponent: 'F. Kakos',
            events: [],
            status: 'Final',
            forfeit: null,
            mode: 'live',
            fallTime: '',
            ...bout,
        },
    };
}

const placeholders = (sql: string) => (sql.match(/\?/g) || []).length;

async function commit(s: TournamentSheet, answers: { match: RegExp; rows: unknown }[] = [ROSTER, SCHOOL]) {
    const conn = fakeConnection(answers);
    const result = await commitTournamentBout(conn as any, s, deriveTournamentBout(s));
    return { conn, result };
}

async function main(): Promise<void> {
    describe('committing a tournament bout');

    await asyncTest('a live bout writes a match and a postseason row with the full breakdown', async () => {
        const s = sheet({
            fallTime: '3:42',
            events: [
                { side: 'ours', period: '1', token: 'T3' },
                { side: 'theirs', period: '2', token: 'E1' },
                { side: 'ours', period: '2', token: 'Pin' },
            ],
        });
        const { conn, result } = await commit(s);

        const match = conn.statements.find((st) => /INSERT INTO wrestling_match/.test(st.sql))!;
        const post = conn.statements.find((st) => /INSERT INTO wrestling_postseason/.test(st.sql))!;
        assert.ok(match && post, 'both rows are written');

        assert.strictEqual(placeholders(match.sql), match.params.length);
        assert.deepStrictEqual(match.params, ['F. Kakos', '2026-01-10', 'Win', 24, 31, 7, 145]);

        assert.strictEqual(placeholders(post.sql), post.params.length);
        assert.strictEqual(post.params.length, 27);
        assert.deepStrictEqual(post.params.slice(0, 7), [
            result.matchId,
            'BCPS JV Invitational',
            '00:03:42',
            3,
            1,
            'Pin',
            '2nd',
        ]);
        assert.ok(post.params.slice(7).every((value) => typeof value === 'number'), 'no breakdown column is NULL');
        assert.strictEqual(result.recorded, true);
    });

    await asyncTest('a quick result writes NULL into every breakdown column', async () => {
        const s = sheet({
            mode: 'quick',
            quick: { winner: 'theirs', method: 'Decision', period: '3', pointsFor: 2, pointsAgainst: 5 },
        });
        const { conn } = await commit(s);
        const post = conn.statements.find((st) => /INSERT INTO wrestling_postseason/.test(st.sql))!;

        assert.deepStrictEqual(post.params.slice(1, 7), [
            'BCPS JV Invitational',
            '00:00:00',
            2,
            5,
            'Minor Decision',
            '3rd',
        ]);
        assert.ok(post.params.slice(7).every((value) => value === null), 'breakdown is all or nothing');

        const match = conn.statements.find((st) => /INSERT INTO wrestling_match/.test(st.sql))!;
        assert.strictEqual(match.params[2], 'Loss');
    });

    await asyncTest('a bout the opponent forfeited is a win by forfeit with no breakdown', async () => {
        const { conn } = await commit(sheet({ forfeit: 'theirs' }));
        const post = conn.statements.find((st) => /INSERT INTO wrestling_postseason/.test(st.sql))!;
        assert.strictEqual(post.params[5], 'Forfeit');
        assert.deepStrictEqual(post.params.slice(3, 5), [0, 0], 'points are 0-0, never NULL');
        assert.ok(post.params.slice(7).every((value) => value === null));
    });

    await asyncTest('a quick pin entered without a score is stored as 0-0', async () => {
        const s = sheet({
            mode: 'quick',
            fallTime: '0:58',
            quick: { winner: 'ours', method: 'Pin', period: '1', pointsFor: '', pointsAgainst: '' },
        });
        const { conn } = await commit(s);
        const post = conn.statements.find((st) => /INSERT INTO wrestling_postseason/.test(st.sql))!;
        assert.deepStrictEqual(post.params.slice(2, 7), ['00:00:58', 0, 0, 'Pin', '1st']);
    });

    await asyncTest('a bout we forfeited writes nothing at all', async () => {
        const { conn, result } = await commit(sheet({ forfeit: 'ours' }));
        assert.strictEqual(conn.statements.length, 0);
        assert.deepStrictEqual(result, { matchId: null, recorded: false, result: null, method: 'Forfeit' });
    });

    await asyncTest('a bout already on the record is refused before anything is written', async () => {
        const duplicate = { match: /FROM wrestling_match/, rows: [{ match_id: 4410 }] };
        const s = sheet({ events: [{ side: 'ours', period: '1', token: 'T3' }] });

        await assert.rejects(
            () => commit(s, [ROSTER, SCHOOL, duplicate]),
            (err: unknown) => err instanceof IngestError && err.status === 409 && /4410/.test(err.message),
        );
    });

    await asyncTest('a wrestler missing from the roster is refused, not invented', async () => {
        const s = sheet({ wrestlerId: null, events: [{ side: 'ours', period: '1', token: 'T3' }] });
        await assert.rejects(
            () => commit(s, [SCHOOL]),
            (err: unknown) => err instanceof IngestError && /not on the roster/.test(err.message),
        );
    });

    await asyncTest('a bout that does not derive is refused before any query', async () => {
        const conn = fakeConnection([]);
        const s = sheet({ opponent: '', events: [{ side: 'ours', period: '1', token: 'T3' }] });
        await assert.rejects(
            () => commitTournamentBout(conn as any, s, deriveTournamentBout(s)),
            (err: unknown) => err instanceof IngestError && err.status === 422,
        );
        assert.strictEqual(conn.statements.length, 0);
    });

    finish();
}

main();
