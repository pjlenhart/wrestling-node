/**
 * Both engines must produce these results exactly.
 *
 * The same fixture is committed to the frontend and executed by its port. If
 * the two ever disagree, one of these two suites fails -- which is the point,
 * because otherwise the disagreement shows up as a dual that scores one way on
 * the screen and another way in the database.
 *
 * Regenerate with `npm run conformance:generate` after a deliberate rule change.
 */

import assert from 'assert';
import { test, describe, finish } from './harness';
import { deriveLiveSheet } from './liveBout';
import fixture from './__fixtures__/conformance.json';

describe(`conformance (${fixture.cases.length} cases, ${fixture.generatedFrom})`);

for (const testCase of fixture.cases) {
    test(testCase.name, () => {
        const derived = deriveLiveSheet(testCase.sheet as any);
        const expected = testCase.expected;

        assert.strictEqual(derived.ourScore, expected.ourScore, 'our team score');
        assert.strictEqual(derived.opponentScore, expected.opponentScore, 'opponent team score');
        assert.strictEqual(derived.decidedCount, expected.decidedCount, 'bouts counted');
        assert.strictEqual(derived.errors.length, expected.errors, 'error count');
        assert.strictEqual(derived.warnings.length, expected.warnings, 'warning count');

        assert.deepStrictEqual(
            derived.insertable.map((b) => b.weight).sort((a, b) => a - b),
            expected.insertable,
            'bouts that belong in the match tables',
        );

        const actual = derived.bouts
            .slice()
            .sort((a, b) => a.weight - b.weight)
            .map((b) => ({
                weight: b.weight,
                method: b.method,
                period: b.period,
                result: b.result,
                teamPointsFor: b.teamPointsFor,
                teamPointsAgainst: b.teamPointsAgainst,
                pointMargin: b.pointMargin,
                weForfeited: b.weForfeited,
                ours: b.ours,
                theirs: b.theirs,
            }));

        assert.deepStrictEqual(actual, expected.bouts, 'per-bout results');
    });
}

finish();
