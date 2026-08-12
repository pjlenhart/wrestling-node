/**
 * The sheets both scoring engines must agree on.
 *
 * Inputs only. The expected results are generated from this engine into
 * `__fixtures__/conformance.json`, and the same fixture is committed to the
 * frontend, where its own port executes it.
 *
 * The division of labour matters: the hand-written suites in each project assert
 * that the rules are *right*, and this fixture asserts that the two
 * implementations *agree*. Neither replaces the other -- a fixture generated
 * from a wrong engine would simply teach the other engine to be wrong in the
 * same way, which is exactly why the hand-written assertions exist too.
 */

import { LiveSheet, SIDE_BOTH, SIDE_OURS, SIDE_THEIRS, BOUT_FINAL } from './liveBout';

type Case = { name: string; sheet: LiveSheet };

const ev = (side: string, period: string, token: string) => ({ side, period, token });

/** A bout that has been wrestled to a finish. */
const bout = (
    weight: number,
    wrestler: string,
    opponent: string,
    events: { side: string; period: string; token: string }[],
    extra: Record<string, unknown> = {},
) => ({ weight, wrestler, opponent, status: BOUT_FINAL, events, ...extra });

const sheet = (bouts: any[], matchDate = '2026-01-08'): LiveSheet => ({
    matchDate,
    opponentSchool: 'Conformance High',
    venue: 'Home',
    bouts,
});

export const CONFORMANCE_CASES: Case[] = [
    {
        name: 'decision decided on points',
        sheet: sheet([
            bout(138, 'A', 'B', [ev(SIDE_OURS, '1', 'T3'), ev(SIDE_OURS, '2', 'E1'), ev(SIDE_THEIRS, '2', 'T3')]),
        ]),
    },
    {
        name: 'major decision at exactly eight',
        sheet: sheet([bout(165, 'A', 'B', [ev(SIDE_OURS, '1', 'T3'), ev(SIDE_OURS, '1', 'T3'), ev(SIDE_OURS, '2', 'N2')])]),
    },
    {
        name: 'tech fall at exactly fifteen',
        sheet: sheet([
            bout(175, 'A', 'B', [
                ev(SIDE_OURS, '1', 'T3'),
                ev(SIDE_OURS, '1', 'T3'),
                ev(SIDE_OURS, '2', 'T3'),
                ev(SIDE_OURS, '2', 'N3'),
                ev(SIDE_OURS, '3', 'N3'),
            ]),
        ]),
    },
    {
        name: 'pin beats a bigger score on the other line',
        sheet: sheet([
            bout(150, 'A', 'B', [
                ev(SIDE_THEIRS, '1', 'T3'),
                ev(SIDE_THEIRS, '1', 'N4'),
                ev(SIDE_THEIRS, '2', 'N4'),
                ev(SIDE_OURS, '3', 'Pin'),
            ]),
        ]),
    },
    {
        name: 'pin against us',
        sheet: sheet([bout(157, 'A', 'B', [ev(SIDE_OURS, '1', 'T3'), ev(SIDE_THEIRS, '2', 'Pin')])]),
    },
    {
        name: 'period taken from the overtime column',
        sheet: sheet([
            bout(120, 'A', 'B', [ev(SIDE_OURS, '1', 'E1'), ev(SIDE_THEIRS, '2', 'E1'), ev(SIDE_OURS, 'SV', 'T3')]),
        ]),
    },
    {
        name: 'every overtime column in turn',
        sheet: sheet([
            bout(126, 'A', 'B', [ev(SIDE_OURS, 'TB1', 'E1'), ev(SIDE_THEIRS, 'TB2', 'E1'), ev(SIDE_OURS, 'UTB', 'R2')]),
        ]),
    },
    {
        name: 'reversals, penalties and every legal near fall',
        sheet: sheet([
            bout(132, 'A', 'B', [
                ev(SIDE_OURS, '1', 'R2'),
                ev(SIDE_OURS, '1', 'N2'),
                ev(SIDE_OURS, '2', 'N3'),
                ev(SIDE_OURS, '2', 'N4'),
                ev(SIDE_OURS, '3', 'P1'),
                ev(SIDE_THEIRS, '3', 'P2'),
            ]),
        ]),
    },
    {
        name: 'opponent forfeits',
        sheet: sheet([{ weight: 106, wrestler: 'A', forfeit: SIDE_THEIRS, status: BOUT_FINAL, events: [] }]),
    },
    {
        name: 'we forfeit',
        sheet: sheet([{ weight: 113, opponent: 'B', forfeit: SIDE_OURS, status: BOUT_FINAL, events: [] }]),
    },
    {
        // The opponent is owed six points whether or not anyone wrote down who
        // they would have fielded. This used to reach the engine as two blank
        // lines and score nothing at all.
        name: 'we forfeit with nobody named on either line',
        sheet: sheet([{ weight: 150, forfeit: SIDE_OURS, status: BOUT_FINAL, events: [] }]),
    },
    {
        name: 'they forfeit with nobody named on either line',
        sheet: sheet([{ weight: 157, forfeit: SIDE_THEIRS, status: BOUT_FINAL, events: [] }]),
    },
    {
        name: 'double forfeit scores nothing',
        sheet: sheet([{ weight: 190, forfeit: SIDE_BOTH, status: BOUT_FINAL, events: [] }]),
    },
    {
        name: 'disqualification with an explicit winner',
        sheet: sheet([
            bout(215, 'A', 'B', [ev(SIDE_OURS, '1', 'T3')], { winner: SIDE_THEIRS, method: 'Disqualification' }),
        ]),
    },
    {
        name: 'default with an explicit winner',
        sheet: sheet([bout(285, 'A', 'B', [ev(SIDE_OURS, '2', 'E1')], { winner: SIDE_OURS, method: 'Default' })]),
    },
    {
        name: 'a tie warns rather than guessing',
        sheet: sheet([bout(144, 'A', 'B', [ev(SIDE_OURS, '1', 'T3'), ev(SIDE_THEIRS, '2', 'T3')])]),
    },
    {
        name: 'two-point takedown era',
        sheet: sheet(
            [bout(138, 'A', 'B', [ev(SIDE_OURS, '1', 'T2'), ev(SIDE_THEIRS, '2', 'T2'), ev(SIDE_OURS, '3', 'E1')])],
            '2023-12-01',
        ),
    },
    {
        name: 'a takedown written at the wrong value for the era warns',
        sheet: sheet([bout(138, 'A', 'B', [ev(SIDE_OURS, '1', 'T2')])]),
    },
    {
        name: 'bouts not marked final are ignored',
        sheet: sheet([
            bout(106, 'A', 'B', [ev(SIDE_OURS, '1', 'Pin')]),
            { weight: 113, wrestler: 'C', opponent: 'D', status: 'In Progress', events: [ev(SIDE_OURS, '1', 'T3')] },
            { weight: 120, events: [] },
        ]),
    },
    {
        name: 'a finalised bout with no wrestler is refused, not scored as a forfeit',
        sheet: sheet([bout(106, '', 'B', [ev(SIDE_OURS, '1', 'Pin')])]),
    },
    {
        name: 'a full card of mixed results',
        sheet: sheet([
            bout(106, 'A', 'Z', [ev(SIDE_OURS, '1', 'Pin')]),
            { weight: 113, wrestler: 'B', forfeit: SIDE_THEIRS, status: BOUT_FINAL, events: [] },
            { weight: 120, opponent: 'Y', forfeit: SIDE_OURS, status: BOUT_FINAL, events: [] },
            { weight: 126, forfeit: SIDE_BOTH, status: BOUT_FINAL, events: [] },
            bout(132, 'E', 'X', [ev(SIDE_OURS, '1', 'T3'), ev(SIDE_OURS, '2', 'N4'), ev(SIDE_OURS, '3', 'T3')]),
            bout(138, 'F', 'W', [ev(SIDE_THEIRS, '1', 'T3'), ev(SIDE_THEIRS, '2', 'T3'), ev(SIDE_THEIRS, '3', 'N4')]),
            bout(144, 'G', 'V', [ev(SIDE_OURS, '1', 'T3'), ev(SIDE_THEIRS, '3', 'E1')]),
        ]),
    },
];

export default CONFORMANCE_CASES;
