/**
 * Regenerate the shared conformance fixture.
 *
 *   npm run conformance:generate
 *
 * Writes `__fixtures__/conformance.json` here and copies it to the frontend, so
 * both engines execute byte-identical expectations. Re-run after any deliberate
 * change to the scoring rules, and check the diff -- every changed line is a
 * result that used to be different.
 */

import fs from 'fs';
import path from 'path';
import { CONFORMANCE_CASES } from './conformanceCases';
import { deriveLiveSheet } from './liveBout';

// Anchored to the repo root rather than __dirname: this runs from `dist-test`
// after compilation, so a path relative to the module would write the fixture
// into the build output instead of the source tree.
const REPO_ROOT = process.cwd();

const LOCAL_FIXTURES = path.resolve(REPO_ROOT, 'src/scoring/__fixtures__');

/** Where the frontend keeps its copy, as a sibling checkout. */
const FRONTEND_COPY = path.resolve(
    REPO_ROOT,
    '../wrestling-db/src/app/LiveScoresheet/scoring/__fixtures__/conformance.json',
);

const expectations = CONFORMANCE_CASES.map(({ name, sheet }) => {
    const derived = deriveLiveSheet(sheet);

    return {
        name,
        sheet,
        expected: {
            ourScore: derived.ourScore,
            opponentScore: derived.opponentScore,
            decidedCount: derived.decidedCount,
            errors: derived.errors.length,
            warnings: derived.warnings.length,
            insertable: derived.insertable.map((b) => b.weight).sort((a, b) => a - b),
            bouts: derived.bouts
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
                })),
        },
    };
});

const fixture = {
    generatedFrom: 'wrestlingdb-node src/scoring',
    note: 'Regenerate with `npm run conformance:generate`. Both engines must reproduce these exactly.',
    cases: expectations,
};

const body = `${JSON.stringify(fixture, null, 2)}\n`;

fs.mkdirSync(LOCAL_FIXTURES, { recursive: true });
fs.writeFileSync(path.join(LOCAL_FIXTURES, 'conformance.json'), body);
console.log(`wrote src/scoring/__fixtures__/conformance.json (${expectations.length} cases)`);

fs.mkdirSync(path.dirname(FRONTEND_COPY), { recursive: true });
fs.writeFileSync(FRONTEND_COPY, body);
console.log(`wrote ${FRONTEND_COPY}`);
