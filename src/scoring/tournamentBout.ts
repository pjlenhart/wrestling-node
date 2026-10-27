/**
 * One tournament bout, as the tournament scoresheet records it.
 *
 * A tournament sheet is a single bout -- one of ours against whoever the
 * bracket put across from them -- hung off the placeholder team match every
 * individual and postseason bout belongs to. It is scored one of two ways:
 *
 *   - Live, tap by tap, exactly like a dual bout. The breakdown is derived by
 *     the same engine and stored in full.
 *   - Quick, from the result alone (what TrackWrestling shows): winner,
 *     method, period and score. No breakdown is stored, because a missing
 *     breakdown is not a breakdown of zeros.
 *
 * Forfeits follow the dual rules: a bout the opponent forfeits is a win by
 * forfeit on our wrestler's record, and a bout we forfeit records nothing.
 *
 * This mirrors the frontend module of the same name. The two are kept in step
 * by the shared fixture in `__fixtures__/tournament.json`.
 */

import {
    DEFAULT_METHOD,
    DISQUALIFICATION,
    FORFEIT,
    MAJOR_DECISION,
    MAJOR_DECISION_MARGIN,
    MINOR_DECISION,
    PERIOD_COLUMNS,
    PERIOD_ORDER,
    PIN,
    SideStats,
    TECH_FALL,
    TECH_FALL_MARGIN,
    deriveBout,
    rulesForSeason,
    seasonForDate,
    totalPoints,
} from './scoring';
import { LiveBout, SIDE_OURS, SIDE_THEIRS, boutToEngineInput } from './liveBout';

/** The team match every individual and postseason bout hangs off. */
export const INDIVIDUAL_TEAM_MATCH_ID = 24;

export const MODE_LIVE = 'live';
export const MODE_QUICK = 'quick';

/** A quick result's decision, split into minor or major by the margin. */
export const DECISION = 'Decision';

export const QUICK_METHODS = [DECISION, MAJOR_DECISION, TECH_FALL, PIN, DEFAULT_METHOD, DISQUALIFICATION];

/** Methods that end the bout on the clock, so a time is worth recording. */
export const TIMED_METHODS = [PIN, TECH_FALL, DEFAULT_METHOD, DISQUALIFICATION];

/** What the `match_time` column holds when no time was recorded. */
export const NO_MATCH_TIME = '00:00:00';

export interface QuickResult {
    winner?: string | null;
    method?: string | null;
    /** A period column: '1', '2', '3', 'SV', 'TB1', 'TB2' or 'UTB'. */
    period?: string | null;
    pointsFor?: number | string | null;
    pointsAgainst?: number | string | null;
}

export interface TournamentBout extends LiveBout {
    mode?: string;
    quick?: QuickResult | null;
    /** Elapsed bout time when it ended, as 'm:ss'. */
    fallTime?: string | null;
    /** Set once the bout is in the match tables. */
    matchId?: number | null;
}

export interface TournamentSheet {
    tournament: string;
    matchDate: string;
    opponentSchool: string;
    opponentSchoolId?: number | null;
    bout: TournamentBout;
}

export interface TournamentResult {
    /** False when we forfeited: nothing goes on our wrestler's record. */
    record: boolean;
    result: 'Win' | 'Loss' | null;
    method: string | null;
    period: string | null;
    pointsFor: number | null;
    pointsAgainst: number | null;
    matchTime: string;
    /** Null for a quick result or a forfeit; full stat lines for a live bout. */
    breakdown: { ours: SideStats; theirs: SideStats } | null;
    errors: string[];
    warnings: string[];
}

/**
 * Read an elapsed time like '3:42' into the TIME column's '00:03:42'.
 *
 * Blank is allowed and stores the column's usual zero. Anything else that is
 * not minutes and seconds is refused, since a mistyped fall time looks exactly
 * like a real one once it is stored.
 */
export function parseFallTime(text: string | null | undefined): { time: string; error: string | null } {
    const value = String(text ?? '').trim();
    if (!value) return { time: NO_MATCH_TIME, error: null };

    const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
    if (!match) {
        return { time: NO_MATCH_TIME, error: `'${value}' is not a time -- write it like 3:42` };
    }
    return { time: `00:${match[1].padStart(2, '0')}:${match[2]}`, error: null };
}

/** A typed score: blank is null, anything else must be a whole number. */
function readScore(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : NaN;
}

function blankResult(errors: string[], warnings: string[]): TournamentResult {
    return {
        record: true,
        result: null,
        method: null,
        period: null,
        pointsFor: null,
        pointsAgainst: null,
        matchTime: NO_MATCH_TIME,
        breakdown: null,
        errors,
        warnings,
    };
}

function timeFor(method: string | null, bout: TournamentBout, errors: string[]): string {
    if (!method || !TIMED_METHODS.includes(method)) return NO_MATCH_TIME;
    const { time, error } = parseFallTime(bout.fallTime);
    if (error) errors.push(error);
    return time;
}

function deriveQuick(sheet: TournamentSheet, errors: string[], warnings: string[]): TournamentResult {
    const bout = sheet.bout;
    const quick = bout.quick || {};
    // Problems with the names are already listed; these are about the result.
    const before = errors.length;

    if (quick.winner !== SIDE_OURS && quick.winner !== SIDE_THEIRS) errors.push('say who won');
    if (!quick.method || !QUICK_METHODS.includes(quick.method)) errors.push('say how the bout ended');
    if (!quick.period || !PERIOD_ORDER.includes(quick.period)) errors.push('say which period it ended in');

    const pointsFor = readScore(quick.pointsFor);
    const pointsAgainst = readScore(quick.pointsAgainst);
    if (Number.isNaN(pointsFor) || Number.isNaN(pointsAgainst)) {
        errors.push('scores must be whole numbers');
    }

    if (errors.length > before) return blankResult(errors, warnings);

    const weWon = quick.winner === SIDE_OURS;
    let method = quick.method as string;
    const scored = pointsFor !== null && pointsAgainst !== null;

    if (method === DECISION || method === MAJOR_DECISION || method === TECH_FALL) {
        // A decision is decided by the score, so the score has to be there and
        // has to agree with the method -- otherwise one of them is a typo.
        if (!scored) {
            errors.push(`a ${method.toLowerCase()} needs the final score`);
        } else {
            const winnerPoints = weWon ? (pointsFor as number) : (pointsAgainst as number);
            const loserPoints = weWon ? (pointsAgainst as number) : (pointsFor as number);
            const margin = winnerPoints - loserPoints;

            if (margin <= 0) {
                errors.push(`the winner has to be ahead: ${winnerPoints}-${loserPoints} is not a win`);
            } else if (method === TECH_FALL) {
                if (margin < TECH_FALL_MARGIN) {
                    errors.push(`a tech fall needs a ${TECH_FALL_MARGIN}-point margin, not ${margin}`);
                }
            } else if (margin >= TECH_FALL_MARGIN) {
                errors.push(`a ${margin}-point margin is a tech fall, not a decision`);
            } else if (method === MAJOR_DECISION && margin < MAJOR_DECISION_MARGIN) {
                errors.push(`a major decision needs an ${MAJOR_DECISION_MARGIN}-point margin, not ${margin}`);
            } else {
                method = margin >= MAJOR_DECISION_MARGIN ? MAJOR_DECISION : MINOR_DECISION;
            }
        }
    } else if ((pointsFor === null) !== (pointsAgainst === null)) {
        // A pin, default or DQ can be stored without the score at the time it
        // happened -- but not with half of it.
        errors.push('enter both scores, or neither');
    }

    const matchTime = timeFor(method, bout, errors);
    if (errors.length) return blankResult(errors, warnings);

    return {
        record: true,
        result: weWon ? 'Win' : 'Loss',
        method,
        period: PERIOD_COLUMNS[quick.period as string],
        pointsFor: pointsFor as number | null,
        pointsAgainst: pointsAgainst as number | null,
        matchTime,
        breakdown: null,
        errors,
        warnings,
    };
}

function deriveLive(sheet: TournamentSheet, errors: string[], warnings: string[]): TournamentResult {
    const bout = sheet.bout;

    if (!(bout.events || []).length) {
        errors.push('nothing has been scored -- score the bout, or enter a quick result');
        return blankResult(errors, warnings);
    }

    // The engine reads a blank name as a forfeit. The names are already
    // reported missing, and scoring the bout as a forfeit would only add a
    // second, misleading error on top.
    if (errors.length) return blankResult(errors, warnings);

    let derived;
    try {
        derived = deriveBout(boutToEngineInput(bout), rulesForSeason(seasonForDate(new Date(sheet.matchDate))));
    } catch (err) {
        errors.push((err as Error).message);
        return blankResult(errors, warnings);
    }

    // A dual can carry a tied bout as a warning, because the team score still
    // adds up. A tournament bout is nothing but its winner, so a tie stops it.
    const tied = derived.pointMargin === 0 && derived.method === MINOR_DECISION && !bout.winner;
    if (tied) {
        errors.push('the bout is tied -- score the overtime, or mark the pin');
    }
    warnings.push(...derived.warnings.filter((warning) => !warning.includes('winner cannot be determined')));

    const matchTime = timeFor(derived.method, bout, errors);
    if (errors.length) return blankResult(errors, warnings);

    return {
        record: true,
        result: derived.result as 'Win' | 'Loss',
        method: derived.method,
        period: derived.period,
        pointsFor: totalPoints(derived.ours),
        pointsAgainst: totalPoints(derived.theirs),
        matchTime,
        breakdown: { ours: derived.ours, theirs: derived.theirs },
        errors,
        warnings,
    };
}

/**
 * Derive everything that gets written for one tournament bout.
 *
 * Never throws: every reason the bout cannot be recorded comes back in
 * `errors`, worded for whoever is holding the scoresheet.
 */
export function deriveTournamentBout(sheet: TournamentSheet): TournamentResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const bout = sheet.bout || ({} as TournamentBout);

    if (typeof bout.weight !== 'number') errors.push('pick the weight class');

    // We conceded: nothing about it belongs on our wrestler's record, so
    // nothing else on the sheet needs to be filled in.
    if (bout.forfeit === SIDE_OURS) {
        return { ...blankResult(errors, warnings), record: false, method: FORFEIT, period: '1st' };
    }
    if (bout.forfeit && bout.forfeit !== SIDE_THEIRS) {
        errors.push(`'${bout.forfeit}' is not a forfeit a tournament bout can have`);
        return blankResult(errors, warnings);
    }

    if (!String(bout.wrestler || '').trim()) errors.push('choose our wrestler');
    if (!String(bout.opponent || '').trim()) errors.push("enter the opponent's name");
    if (!String(sheet.opponentSchool || '').trim()) errors.push("enter the opponent's school");

    if (bout.forfeit === SIDE_THEIRS) {
        if (errors.length) return blankResult(errors, warnings);
        return { ...blankResult(errors, warnings), result: 'Win', method: FORFEIT, period: '1st' };
    }

    if (bout.mode === MODE_QUICK) return deriveQuick(sheet, errors, warnings);
    return deriveLive(sheet, errors, warnings);
}
