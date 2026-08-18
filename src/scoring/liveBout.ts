/**
 * The live bout shape, as the scoring screen records it.
 *
 * A submitted sheet carries the marks, not the arithmetic: every bout is an
 * append-only list of events, one per tap. The server folds those into period
 * cells itself and derives from there, so nothing a client computed is ever
 * trusted -- it only has to be honest about what was pressed.
 *
 * This mirrors the frontend module of the same name. The two are kept in step
 * by the shared conformance fixtures.
 */

import { BoutInput, PERIOD_ORDER, deriveDual, DualResult, DerivedBout } from './scoring';

export const SIDE_OURS = 'ours';
export const SIDE_THEIRS = 'theirs';
/** Neither team fielded a wrestler: a double forfeit, worth nothing to anyone. */
export const SIDE_BOTH = 'both';

export const BOUT_FINAL = 'Final';

export interface LiveEvent {
    id?: string;
    side: string;
    period: string;
    token: string;
    at?: string;
}

export interface LiveBout {
    weight: number;
    wrestlerId?: number | null;
    wrestler?: string;
    opponent?: string;
    events?: LiveEvent[];
    status?: string;
    forfeit?: string | null;
    winner?: string | null;
    method?: string | null;
}

export interface LiveSheet {
    matchDate: string;
    opponentSchool: string;
    opponentSchoolId?: number | null;
    venue?: string;
    startingWeight?: number | null;
    bouts: LiveBout[];
    officialOurScore?: number | null;
    officialOpponentScore?: number | null;
}

/** Fold the event list into the period cells the engine reads. */
export function eventsToCells(events: LiveEvent[] | undefined): {
    ours: Record<string, string>;
    theirs: Record<string, string>;
} {
    const cells: { ours: Record<string, string>; theirs: Record<string, string> } = {
        ours: {},
        theirs: {},
    };

    for (const event of events || []) {
        const line = event.side === SIDE_OURS ? cells.ours : event.side === SIDE_THEIRS ? cells.theirs : null;
        if (!line) continue;
        if (!PERIOD_ORDER.includes(event.period)) {
            throw new Error(`unknown period column '${event.period}'`);
        }
        line[event.period] = line[event.period] ? `${line[event.period]} ${event.token}` : event.token;
    }

    return cells;
}

/** A bout counts toward the team score once it is final or conceded. */
export function isDecided(bout: LiveBout): boolean {
    return bout.status === BOUT_FINAL || Boolean(bout.forfeit);
}

/**
 * Whether a decided bout can safely be scored.
 *
 * A blank name is not a forfeit. The engine reads an empty line as one, so a
 * bout submitted before the wrestlers were filled in would quietly award six
 * points to the other team -- a wrong answer that looks like a real result.
 * Forfeits are declared or they do not happen.
 */
export function boutReadiness(bout: LiveBout): { ready: boolean; reason: string | null } {
    if (bout.forfeit) return { ready: true, reason: null };
    if (!String(bout.wrestler || '').trim()) {
        return { ready: false, reason: 'our wrestler was never chosen, and no forfeit was marked' };
    }
    if (!String(bout.opponent || '').trim()) {
        return { ready: false, reason: 'the opponent was never named, and no forfeit was marked' };
    }
    return { ready: true, reason: null };
}

/**
 * Translate one live bout into the engine's input shape.
 *
 * The forfeit is passed as a declaration rather than encoded into the names.
 * Writing 'FF' onto the blank line used to mean a bout we conceded, where
 * nobody had recorded an opponent, arrived at the engine as two blank lines and
 * scored nothing for either team.
 */
export function boutToEngineInput(bout: LiveBout): BoutInput {
    const cells = eventsToCells(bout.events);
    return {
        weight: bout.weight,
        forfeitedBy: (bout.forfeit as BoutInput['forfeitedBy']) || null,
        wrestler: bout.wrestler,
        opponent: bout.opponent,
        wrestlerId: bout.wrestlerId ?? null,
        ours: cells.ours,
        theirs: cells.theirs,
        method: bout.method || null,
        winner: bout.winner || null,
    };
}

export interface LiveDualResult extends DualResult {
    byWeight: Record<number, DerivedBout>;
    decidedCount: number;
    skipped: number;
}

/**
 * Derive a submitted sheet.
 *
 * Only decided bouts are handed to the engine -- a bout nobody wrestled has two
 * blank lines, which the engine rightly refuses. A decided bout missing a name
 * is held back and reported rather than scored.
 */
export function deriveLiveSheet(sheet: LiveSheet): LiveDualResult {
    const bouts = sheet.bouts || [];
    const decided = bouts.filter(isDecided);

    const scorable: LiveBout[] = [];
    const incomplete: LiveBout[] = [];
    for (const bout of decided) {
        if (boutReadiness(bout).ready) scorable.push(bout);
        else incomplete.push(bout);
    }

    const result = deriveDual(scorable.map(boutToEngineInput), new Date(sheet.matchDate));

    const byWeight: Record<number, DerivedBout> = {};
    for (const bout of result.bouts) byWeight[bout.weight] = bout;

    return {
        ...result,
        errors: [
            ...result.errors,
            ...incomplete.map((bout) => `${bout.weight}: ${boutReadiness(bout).reason}`),
        ],
        byWeight,
        decidedCount: scorable.length,
        skipped: bouts.length - scorable.length,
    };
}
