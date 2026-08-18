/**
 * Folkstyle dual-meet scoring: token parsing and derivation.
 *
 * This is the authoritative copy. The frontend has its own port so it can show
 * a running score without a round trip, but nothing a client sends is trusted:
 * a submitted sheet carries only the marks, and every number written to the
 * database is derived here.
 *
 * The two implementations are kept honest by a shared fixture file that both
 * execute -- see `__fixtures__/conformance.json` and the test beside it. Two
 * copies of the same rules will drift otherwise, and the failure is silent:
 * both produce plausible numbers, and which one you get depends on where the
 * bout was entered.
 *
 * Pure data in, data out. Nothing here touches the database or Express.
 */

/** Sheet column -> the value the `period` column actually stores. */
export const PERIOD_COLUMNS: Record<string, string> = {
    '1': '1st',
    '2': '2nd',
    '3': '3rd',
    SV: 'OT1',
    TB1: 'OT2',
    TB2: 'OT3',
    UTB: 'OT4',
};

export const PERIOD_ORDER = ['1', '2', '3', 'SV', 'TB1', 'TB2', 'UTB'];

export const PIN = 'Pin';
export const FORFEIT = 'Forfeit';
export const DOUBLE_FORFEIT = 'Double Forfeit';
export const MINOR_DECISION = 'Minor Decision';
export const MAJOR_DECISION = 'Major Decision';
export const TECH_FALL = 'Tech Fall';
export const DISQUALIFICATION = 'Disqualification';
export const DEFAULT_METHOD = 'Default';

/** Team points a winning wrestler earns, by method. A loss is always 0. */
export const TEAM_POINTS: Record<string, number> = {
    [PIN]: 6,
    [FORFEIT]: 6,
    [DOUBLE_FORFEIT]: 0,
    [DEFAULT_METHOD]: 6,
    [DISQUALIFICATION]: 6,
    [TECH_FALL]: 5,
    [MAJOR_DECISION]: 4,
    [MINOR_DECISION]: 3,
};

export const TECH_FALL_MARGIN = 15;
export const MAJOR_DECISION_MARGIN = 8;

/** Tokens that end a bout rather than score it. */
const TERMINAL_TOKENS: Record<string, string> = {
    PIN: PIN,
    FALL: PIN,
    DQ: DISQUALIFICATION,
    DEF: DEFAULT_METHOD,
};

/** Recorded on the sheet but deliberately not tracked in the schema. */
const IGNORED_TOKENS = new Set(['C', 'W']);

const SCORING_TOKEN = /^([TERNP])(\d+)$/;

export interface RuleSet {
    season: string;
    takedownPoints: number;
    escapePoints: number;
    reversalPoints: number;
    nearFallValues: number[];
    penaltyValues: number[];
}

/**
 * Return the folkstyle season label ('2025-2026') containing a date.
 *
 * A season runs roughly November through April, so any date before May belongs
 * to the season that started the prior year.
 */
export function seasonForDate(date: Date): string {
    const start = date.getUTCMonth() >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
    return `${start}-${start + 1}`;
}

/**
 * Return the rules in force for a season.
 *
 * NFHS moved the takedown from 2 points to 3 beginning with 2024-2025. Bouts
 * recorded before that are 2-point era bouts and have to stay that way.
 */
export function rulesForSeason(season: string): RuleSet {
    const startYear = parseInt(season.split('-')[0], 10);
    return {
        season,
        takedownPoints: startYear >= 2024 ? 3 : 2,
        escapePoints: 1,
        reversalPoints: 2,
        nearFallValues: [2, 3, 4, 5],
        penaltyValues: [1, 2],
    };
}

export interface Token {
    raw: string;
    category: string | null;
    points: number;
    terminal: string | null;
}

/**
 * Parse one period cell into tokens.
 *
 * Cells are written loosely -- 'T3 N4 Pin', 'T3,E1' -- so tokens split on
 * whitespace and commas and match case-insensitively.
 */
export function parseCell(text: string | undefined | null): Token[] {
    if (!text) return [];

    const tokens: Token[] = [];
    for (const raw of String(text).trim().split(/[\s,]+/)) {
        if (!raw) continue;

        const upper = raw.toUpperCase().replace(/\.+$/, '');

        if (IGNORED_TOKENS.has(upper)) continue;

        // Riding time is a point-scoring mark with no column to store it in.
        // Dropping it would quietly shift the margin and could flip a decision
        // into a major, so refuse the whole cell instead.
        if (upper.startsWith('RT')) {
            throw new Error(
                `token '${raw}': riding time has no field in the regular season table ` +
                    `and cannot be recorded without changing the schema`,
            );
        }

        if (upper in TERMINAL_TOKENS) {
            tokens.push({ raw, category: null, points: 0, terminal: TERMINAL_TOKENS[upper] });
            continue;
        }

        const match = SCORING_TOKEN.exec(upper);
        if (!match) {
            throw new Error(`unrecognized scoring token '${raw}'`);
        }

        tokens.push({ raw, category: match[1], points: parseInt(match[2], 10), terminal: null });
    }

    return tokens;
}

/** One wrestler's side of a bout: their tokens, cell by cell. */
export type Line = Record<string, string>;

export interface BoutInput {
    weight: number;
    /** Our wrestler's name, or 'FF'/empty if we forfeited. */
    wrestler?: string | null;
    /** The opponent's name, or 'FF'/empty if they forfeited. */
    opponent?: string | null;
    /** Roster id when the wrestler was picked from the list. */
    wrestlerId?: number | null;
    ours?: Line;
    theirs?: Line;
    /**
     * Which side conceded, when it is known rather than guessed.
     *
     * A live sheet always knows this, because somebody pressed a button. The
     * name-based fallback below exists only for sheets transcribed from paper,
     * where 'FF' written on a line is the only signal there is -- and it cannot
     * express "we forfeited and nobody wrote down who we would have wrestled",
     * which reads as two blank lines and scores nothing for anyone.
     */
    forfeitedBy?: 'ours' | 'theirs' | 'both' | null;
    /** Explicit override, otherwise derived. */
    method?: string | null;
    /** Explicit override, otherwise derived from column position. */
    period?: string | null;
    /** 'ours' or 'theirs'; required for a disqualification or default. */
    winner?: string | null;
}

export interface SideStats {
    takedowns: number;
    reversals: number;
    escapes: number;
    nearfall: number;
    penalties: number;
    takedownPoints: number;
    reversalPoints: number;
    escapePoints: number;
    nearfallPoints: number;
    penaltyPoints: number;
}

function emptyStats(): SideStats {
    return {
        takedowns: 0,
        reversals: 0,
        escapes: 0,
        nearfall: 0,
        penalties: 0,
        takedownPoints: 0,
        reversalPoints: 0,
        escapePoints: 0,
        nearfallPoints: 0,
        penaltyPoints: 0,
    };
}

export function totalPoints(stats: SideStats): number {
    return (
        stats.takedownPoints +
        stats.reversalPoints +
        stats.escapePoints +
        stats.nearfallPoints +
        stats.penaltyPoints
    );
}

export interface DerivedBout {
    weight: number;
    wrestler: string | null;
    wrestlerId: number | null;
    opponent: string | null;
    ours: SideStats;
    theirs: SideStats;
    method: string;
    period: string;
    /** 'Win' or 'Loss' from our side, or null when nobody wrestled. */
    result: string | null;
    teamPointsFor: number;
    teamPointsAgainst: number;
    pointMargin: number;
    /** True when nothing happened worth recording against our roster. */
    weForfeited: boolean;
    warnings: string[];
}

function isForfeit(name: string | null | undefined): boolean {
    if (name === null || name === undefined) return true;
    const cleaned = String(name).trim().toUpperCase().replace(/\./g, '');
    return cleaned === '' || cleaned === 'FF' || cleaned === 'FFT' || cleaned === 'FORFEIT';
}

/** Yield [periodColumn, token] pairs for one line, in sheet order. */
function* lineTokens(line: Line): Generator<[string, Token]> {
    for (const column of PERIOD_ORDER) {
        for (const token of parseCell(line[column])) {
            yield [column, token];
        }
    }
}

/** Fold one wrestler's tokens into a stat line, validating as it goes. */
function accumulate(line: Line, rules: RuleSet, side: string, warnings: string[]): SideStats {
    const stats = emptyStats();

    for (const [column, token] of lineTokens(line)) {
        if (token.terminal) continue;

        const { category, points } = token;

        if (category === 'T') {
            // The written value wins, since that is what the scorer recorded --
            // but a mismatch with the era means one of the two is wrong and a
            // human needs to look.
            if (points !== rules.takedownPoints) {
                warnings.push(
                    `${side} period ${column}: takedown written as T${points} but ` +
                        `${rules.season} uses ${rules.takedownPoints}-point takedowns`,
                );
            }
            stats.takedowns += 1;
            stats.takedownPoints += points;
        } else if (category === 'E') {
            if (points !== rules.escapePoints) {
                warnings.push(`${side} period ${column}: escape written as E${points}, expected E1`);
            }
            stats.escapes += 1;
            stats.escapePoints += points;
        } else if (category === 'R') {
            if (points !== rules.reversalPoints) {
                warnings.push(`${side} period ${column}: reversal written as R${points}, expected R2`);
            }
            stats.reversals += 1;
            stats.reversalPoints += points;
        } else if (category === 'N') {
            if (!rules.nearFallValues.includes(points)) {
                warnings.push(
                    `${side} period ${column}: near fall N${points} is outside the legal ` +
                        `range (${rules.nearFallValues.join(', ')})`,
                );
            }
            stats.nearfall += 1;
            stats.nearfallPoints += points;
        } else if (category === 'P') {
            if (!rules.penaltyValues.includes(points)) {
                warnings.push(`${side} period ${column}: penalty P${points} is not 1 or 2`);
            }
            stats.penalties += 1;
            stats.penaltyPoints += points;
        }
    }

    return stats;
}

/** The latest period column holding any mark on either line. */
function lastScoredPeriod(bout: BoutInput): string | null {
    let seen: string | null = null;
    for (const line of [bout.ours || {}, bout.theirs || {}]) {
        for (const [column] of lineTokens(line)) {
            if (seen === null || PERIOD_ORDER.indexOf(column) > PERIOD_ORDER.indexOf(seen)) {
                seen = column;
            }
        }
    }
    return seen;
}

/**
 * Find a bout-ending mark, if there is one.
 *
 * A pin decides the bout regardless of the score, so which line the mark sits
 * on determines the winner -- not the margin.
 */
function findTerminal(bout: BoutInput): [string | null, string | null, string | null] {
    const sides: [string, Line][] = [
        ['ours', bout.ours || {}],
        ['theirs', bout.theirs || {}],
    ];
    for (const [side, line] of sides) {
        for (const [column, token] of lineTokens(line)) {
            if (token.terminal) return [token.terminal, side, column];
        }
    }
    return [null, null, null];
}

function methodFromMargin(margin: number): string {
    const spread = Math.abs(margin);
    if (spread >= TECH_FALL_MARGIN) return TECH_FALL;
    if (spread >= MAJOR_DECISION_MARGIN) return MAJOR_DECISION;
    return MINOR_DECISION;
}

/**
 * Turn one bout into a fully derived result.
 *
 * Everything stored beyond the raw marks -- point subtotals, totals, margin,
 * method, period, team points, win/loss -- is computed here.
 */
export function deriveBout(bout: BoutInput, rules: RuleSet): DerivedBout {
    const warnings: string[] = [];
    const wrestlerId = bout.wrestlerId ?? null;

    // A declared forfeit is taken at its word. Names are irrelevant to it: a
    // bout we conceded still owes the opponent six points whether or not
    // anybody wrote down who they would have put on the mat.
    const declared = bout.forfeitedBy ?? null;

    if (declared === 'both') {
        return {
            weight: bout.weight,
            wrestler: null,
            wrestlerId: null,
            opponent: null,
            ours: emptyStats(),
            theirs: emptyStats(),
            method: DOUBLE_FORFEIT,
            period: '1st',
            result: null,
            teamPointsFor: 0,
            teamPointsAgainst: 0,
            pointMargin: 0,
            // Nothing happened to record against our roster, so this is
            // filtered out of the insert alongside our own forfeits.
            weForfeited: true,
            warnings,
        };
    }

    if (declared === 'ours' || declared === 'theirs') {
        const winnerIsUs = declared === 'theirs';
        return {
            weight: bout.weight,
            wrestler: bout.wrestler ?? null,
            wrestlerId,
            opponent: bout.opponent ?? null,
            ours: emptyStats(),
            theirs: emptyStats(),
            method: FORFEIT,
            period: '1st',
            result: winnerIsUs ? 'Win' : 'Loss',
            teamPointsFor: winnerIsUs ? TEAM_POINTS[FORFEIT] : 0,
            teamPointsAgainst: winnerIsUs ? 0 : TEAM_POINTS[FORFEIT],
            pointMargin: 0,
            weForfeited: declared === 'ours',
            warnings,
        };
    }

    // Nothing was declared, so fall back to reading the names -- which is all a
    // sheet transcribed from paper ever has.
    const weForfeited = isForfeit(bout.wrestler);
    const theyForfeited = isForfeit(bout.opponent);

    if (weForfeited && theyForfeited) {
        throw new Error(
            `${bout.weight}: both lines are blank or forfeit -- mark it a double forfeit ` +
                `if neither team wrestled`,
        );
    }

    if (weForfeited || theyForfeited) {
        // A forfeit is stored as an all-zero stat line; the only meaningful
        // output is who collected the six team points.
        const winnerIsUs = theyForfeited;
        return {
            weight: bout.weight,
            wrestler: bout.wrestler ?? null,
            wrestlerId,
            opponent: bout.opponent ?? null,
            ours: emptyStats(),
            theirs: emptyStats(),
            method: FORFEIT,
            period: '1st',
            result: winnerIsUs ? 'Win' : 'Loss',
            teamPointsFor: winnerIsUs ? TEAM_POINTS[FORFEIT] : 0,
            teamPointsAgainst: winnerIsUs ? 0 : TEAM_POINTS[FORFEIT],
            pointMargin: 0,
            weForfeited,
            warnings,
        };
    }

    const ours = accumulate(bout.ours || {}, rules, 'ours', warnings);
    const theirs = accumulate(bout.theirs || {}, rules, 'theirs', warnings);

    const margin = totalPoints(ours) - totalPoints(theirs);
    const [terminalMethod, terminalSide, terminalColumn] = findTerminal(bout);

    let method: string;
    let winnerIsUs: boolean;

    if (bout.winner !== null && bout.winner !== undefined) {
        if (bout.winner !== 'ours' && bout.winner !== 'theirs') {
            throw new Error(`winner must be 'ours' or 'theirs', got '${bout.winner}'`);
        }
        winnerIsUs = bout.winner === 'ours';
        method = bout.method || terminalMethod || methodFromMargin(margin);
    } else if (bout.method === DISQUALIFICATION || bout.method === DEFAULT_METHOD) {
        // A wrestler who is disqualified or defaults loses no matter what the
        // score says, and the tokens alone never reveal which side it was.
        throw new Error(
            `${bout.method} requires an explicit winner: the score cannot decide it ` +
                `(margin here is ${margin >= 0 ? '+' : ''}${margin})`,
        );
    } else if (bout.method) {
        method = bout.method;
        winnerIsUs = terminalSide ? terminalSide === 'ours' : margin > 0;
    } else if (terminalMethod) {
        method = terminalMethod;
        winnerIsUs = terminalSide === 'ours';
    } else {
        // No bout-ending mark, so the score decides both the winner and how
        // decisively they won.
        winnerIsUs = margin > 0;
        method = methodFromMargin(margin);

        if (margin === 0) {
            warnings.push(
                `${bout.weight}: bout is tied at ${totalPoints(ours)} with no overtime ` +
                    `marks and no pin -- winner cannot be determined`,
            );
        }
    }

    const periodColumn = bout.period || terminalColumn || lastScoredPeriod(bout) || '3';
    const period = PERIOD_COLUMNS[periodColumn] || periodColumn;
    const teamPoints = TEAM_POINTS[method] ?? 0;

    return {
        weight: bout.weight,
        wrestler: bout.wrestler ?? null,
        wrestlerId,
        opponent: bout.opponent ?? null,
        ours,
        theirs,
        method,
        period,
        result: winnerIsUs ? 'Win' : 'Loss',
        teamPointsFor: winnerIsUs ? teamPoints : 0,
        teamPointsAgainst: winnerIsUs ? 0 : teamPoints,
        pointMargin: margin,
        weForfeited: false,
        warnings,
    };
}

export interface DualResult {
    bouts: DerivedBout[];
    ourScore: number;
    opponentScore: number;
    errors: string[];
    warnings: string[];
    /**
     * Bouts that belong in the match tables.
     *
     * Our own forfeits and double forfeits are dropped: neither says anything
     * about one of our wrestlers. They are still counted in the totals first,
     * because once they are filtered out the opponent's score is no longer
     * reconstructable from what remains.
     */
    insertable: DerivedBout[];
}

/** Derive every bout on a sheet and total both teams. */
export function deriveDual(bouts: BoutInput[], matchDate: Date): DualResult {
    const rules = rulesForSeason(seasonForDate(matchDate));

    const derived: DerivedBout[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const bout of bouts) {
        try {
            const result = deriveBout(bout, rules);
            derived.push(result);
            warnings.push(...result.warnings);
        } catch (err) {
            errors.push(`${bout.weight}: ${(err as Error).message}`);
        }
    }

    return {
        bouts: derived,
        ourScore: derived.reduce((sum, b) => sum + b.teamPointsFor, 0),
        opponentScore: derived.reduce((sum, b) => sum + b.teamPointsAgainst, 0),
        errors,
        warnings,
        insertable: derived.filter((b) => !b.weForfeited),
    };
}
