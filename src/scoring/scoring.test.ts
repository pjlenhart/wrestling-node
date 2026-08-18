/**
 * The scoring rules, exercised without a database.
 *
 * These are the rules the frontend also implements. Anything changed here has
 * to be changed there, and vice versa -- the two engines producing different
 * numbers for the same sheet is the failure mode this suite exists to catch.
 */

import assert from 'assert';
import { test, describe, finish } from './harness';
import {
    deriveBout,
    deriveDual,
    parseCell,
    rulesForSeason,
    seasonForDate,
    DOUBLE_FORFEIT,
    FORFEIT,
    MAJOR_DECISION,
    MINOR_DECISION,
    PIN,
    TECH_FALL,
    DISQUALIFICATION,
} from './scoring';
import { deriveLiveSheet, eventsToCells, boutReadiness, SIDE_BOTH, SIDE_OURS, SIDE_THEIRS, BOUT_FINAL } from './liveBout';

const CURRENT = rulesForSeason('2025-2026');

describe('seasons and rules');

test('a January date belongs to the season that started the prior year', () => {
    assert.strictEqual(seasonForDate(new Date('2026-01-08')), '2025-2026');
});

test('takedowns are worth 3 from 2024-2025 and 2 before', () => {
    assert.strictEqual(rulesForSeason('2025-2026').takedownPoints, 3);
    assert.strictEqual(rulesForSeason('2023-2024').takedownPoints, 2);
});

describe('token parsing');

test('splits on whitespace and commas, case-insensitively', () => {
    assert.deepStrictEqual(
        parseCell('T3 n4,e1').map((t) => [t.category, t.points]),
        [['T', 3], ['N', 4], ['E', 1]],
    );
});

test('discards cautions and warnings', () => {
    assert.deepStrictEqual(parseCell('C W'), []);
});

test('refuses riding time rather than silently dropping the point', () => {
    assert.throws(() => parseCell('RT1'), /riding time/);
});

test('rejects an unrecognized token', () => {
    assert.throws(() => parseCell('X9'), /unrecognized/);
});

describe('bout derivation');

test('scores a decision from the tokens', () => {
    const bout = deriveBout(
        { weight: 138, wrestler: 'A', opponent: 'B', ours: { 1: 'T3', 2: 'E1' }, theirs: { 2: 'T3' } },
        CURRENT,
    );
    assert.strictEqual(bout.pointMargin, 1);
    assert.strictEqual(bout.method, MINOR_DECISION);
    assert.strictEqual(bout.teamPointsFor, 3);
});

test('a pin decides the bout even when the pinner trails', () => {
    const bout = deriveBout(
        { weight: 150, wrestler: 'A', opponent: 'B', ours: { 3: 'Pin' }, theirs: { 1: 'T3 N4 N4' } },
        CURRENT,
    );
    assert.strictEqual(bout.method, PIN);
    assert.strictEqual(bout.result, 'Win');
    assert.strictEqual(bout.teamPointsFor, 6);
    assert.strictEqual(bout.period, '3rd');
});

test('a margin of 8 is a major, 15 is a tech fall', () => {
    const major = deriveBout({ weight: 165, wrestler: 'A', opponent: 'B', ours: { 1: 'T3 T3 N2' } }, CURRENT);
    assert.strictEqual(major.method, MAJOR_DECISION);
    assert.strictEqual(major.teamPointsFor, 4);

    const tech = deriveBout({ weight: 175, wrestler: 'A', opponent: 'B', ours: { 1: 'T3 T3 T3 N3 N3' } }, CURRENT);
    assert.strictEqual(tech.method, TECH_FALL);
    assert.strictEqual(tech.teamPointsFor, 5);
});

test('the period comes from the column the mark sits in', () => {
    const bout = deriveBout({ weight: 120, wrestler: 'A', opponent: 'B', ours: { SV: 'T3' } }, CURRENT);
    assert.strictEqual(bout.period, 'OT1');
});

test('an opponent forfeit is six points and an empty stat line', () => {
    const bout = deriveBout({ weight: 106, wrestler: 'A', opponent: 'FF' }, CURRENT);
    assert.strictEqual(bout.method, FORFEIT);
    assert.strictEqual(bout.teamPointsFor, 6);
    assert.strictEqual(bout.weForfeited, false);
});

test('a double forfeit scores nothing for either team', () => {
    const bout = deriveBout({ weight: 106, forfeitedBy: 'both' }, CURRENT);
    assert.strictEqual(bout.method, DOUBLE_FORFEIT);
    assert.strictEqual(bout.teamPointsFor, 0);
    assert.strictEqual(bout.teamPointsAgainst, 0);
    assert.strictEqual(bout.result, null);
    assert.strictEqual(bout.weForfeited, true);
});

test('two blank lines are refused unless flagged a double forfeit', () => {
    assert.throws(() => deriveBout({ weight: 106, wrestler: '', opponent: '' }, CURRENT), /double forfeit/);
});

test('a disqualification needs an explicit winner', () => {
    assert.throws(
        () => deriveBout({ weight: 132, wrestler: 'A', opponent: 'B', method: DISQUALIFICATION, ours: { 1: 'T3' } }, CURRENT),
        /requires an explicit winner/,
    );
});

describe('live sheets');

test('folds taps into the period cells the engine reads', () => {
    const cells = eventsToCells([
        { side: SIDE_OURS, period: '1', token: 'T3' },
        { side: SIDE_OURS, period: '1', token: 'N4' },
        { side: SIDE_THEIRS, period: '2', token: 'E1' },
    ]);
    assert.deepStrictEqual(cells, { ours: { 1: 'T3 N4' }, theirs: { 2: 'E1' } });
});

test('rejects an unknown period column', () => {
    assert.throws(() => eventsToCells([{ side: SIDE_OURS, period: '9', token: 'T3' }]), /unknown period/);
});

test('a nameless bout is not ready to score', () => {
    assert.strictEqual(boutReadiness({ weight: 106 }).ready, false);
    assert.strictEqual(boutReadiness({ weight: 106, forfeit: SIDE_OURS }).ready, true);
    assert.strictEqual(boutReadiness({ weight: 106, wrestler: 'A', opponent: 'B' }).ready, true);
});

/**
 * The bug this guards: a bout we conceded, where nobody recorded who the
 * opponent would have been, used to reach the engine as two blank lines and
 * score nothing -- so the opponent silently lost the six points they were owed.
 */
test('our forfeit awards six to the opponent even with no opponent named', () => {
    const result = deriveLiveSheet({
        matchDate: '2026-01-08',
        opponentSchool: 'Somewhere',
        bouts: [{ weight: 126, forfeit: SIDE_OURS, status: BOUT_FINAL, events: [] }],
    });

    assert.strictEqual(result.opponentScore, 6);
    assert.strictEqual(result.ourScore, 0);
    assert.deepStrictEqual(result.errors, []);
    // Nothing to record against our roster.
    assert.strictEqual(result.insertable.length, 0);
});

test('their forfeit awards six to us even with no wrestler named', () => {
    const result = deriveLiveSheet({
        matchDate: '2026-01-08',
        opponentSchool: 'Somewhere',
        bouts: [{ weight: 132, forfeit: SIDE_THEIRS, status: BOUT_FINAL, events: [] }],
    });

    assert.strictEqual(result.ourScore, 6);
    assert.strictEqual(result.opponentScore, 0);
    assert.deepStrictEqual(result.errors, []);
});

test('bouts nobody has wrestled yet are ignored', () => {
    const result = deriveLiveSheet({
        matchDate: '2026-01-08',
        opponentSchool: 'Somewhere',
        bouts: [{ weight: 106 }, { weight: 113 }],
    });
    assert.strictEqual(result.ourScore, 0);
    assert.strictEqual(result.decidedCount, 0);
    assert.deepStrictEqual(result.errors, []);
});

/**
 * The trap this guards: an empty line reads as a forfeit to the engine, so a
 * bout submitted before the names were filled in would score six points to the
 * opponent while looking like a legitimate result.
 */
test('a finalised bout with no wrestler is refused, not scored as a forfeit', () => {
    const result = deriveLiveSheet({
        matchDate: '2026-01-08',
        opponentSchool: 'Somewhere',
        bouts: [
            {
                weight: 106,
                wrestler: '',
                opponent: 'J. Ramos',
                status: BOUT_FINAL,
                events: [{ side: SIDE_OURS, period: '1', token: 'Pin' }],
            },
        ],
    });
    assert.strictEqual(result.ourScore, 0);
    assert.strictEqual(result.opponentScore, 0);
    assert.match(result.errors.join(' '), /never chosen/);
});

test('totals a whole card, keeping our forfeits out of the insert', () => {
    const result = deriveLiveSheet({
        matchDate: '2026-01-08',
        opponentSchool: 'Somewhere',
        bouts: [
            { weight: 106, wrestler: 'A', forfeit: SIDE_THEIRS, status: BOUT_FINAL },
            { weight: 113, forfeit: SIDE_OURS, opponent: 'Z', status: BOUT_FINAL },
            { weight: 120, forfeit: SIDE_BOTH, status: BOUT_FINAL },
            {
                weight: 126,
                wrestler: 'C',
                opponent: 'Y',
                status: BOUT_FINAL,
                events: [{ side: SIDE_OURS, period: '1', token: 'Pin' }],
            },
        ],
    });

    assert.strictEqual(result.ourScore, 12, 'forfeit in + pin');
    assert.strictEqual(result.opponentScore, 6, 'our forfeit only; double forfeit is worth nothing');
    assert.strictEqual(result.decidedCount, 4);
    // Our forfeit and the double forfeit say nothing about our roster.
    assert.deepStrictEqual(result.insertable.map((b) => b.weight), [106, 126]);
});

finish();
