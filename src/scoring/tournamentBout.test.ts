/**
 * Tournament bouts, exercised without a database.
 *
 * The cases live in a fixture committed to both repos, so the frontend's port
 * is held to exactly the same results. A bout that shows one result on the
 * screen and records another is the failure this exists to catch.
 */

import assert from 'assert';
import { test, describe, finish } from './harness';
import { deriveTournamentBout, parseFallTime } from './tournamentBout';
import fixture from './__fixtures__/tournament.json';

describe('fall times');

test('minutes and seconds become a TIME value', () => {
    assert.deepStrictEqual(parseFallTime('3:42'), { time: '00:03:42', error: null });
    assert.deepStrictEqual(parseFallTime('12:05'), { time: '00:12:05', error: null });
});

test('blank is the usual zero, and nonsense is refused', () => {
    assert.deepStrictEqual(parseFallTime(''), { time: '00:00:00', error: null });
    assert.ok(parseFallTime('3:75').error);
    assert.ok(parseFallTime('342').error);
});

describe(`tournament fixture (${fixture.cases.length} cases)`);

for (const testCase of fixture.cases) {
    test(testCase.name, () => {
        const derived = deriveTournamentBout(testCase.sheet as any);
        const expected = testCase.expected;

        assert.strictEqual(derived.errors.length, expected.errors, `errors: ${derived.errors.join('; ')}`);
        assert.strictEqual(derived.record, expected.record, 'record');
        assert.strictEqual(derived.result, expected.result, 'result');
        assert.strictEqual(derived.method, expected.method, 'method');
        assert.strictEqual(derived.period, expected.period, 'period');
        assert.strictEqual(derived.pointsFor, expected.pointsFor, 'points for');
        assert.strictEqual(derived.pointsAgainst, expected.pointsAgainst, 'points against');
        assert.strictEqual(derived.matchTime, expected.matchTime, 'match time');
        assert.strictEqual(derived.breakdown !== null, expected.breakdown, 'has breakdown');
    });
}

finish();
