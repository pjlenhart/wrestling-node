import { Request, Response } from 'express';
import { connection1 } from '../database/mysql';

const express = require('express');

const matchRouter = express.Router();

// The team match every individual/postseason bout hangs off. Anything else is
// a dual meet.
const INDIVIDUAL_TEAM_MATCH_ID = 24;

// A season runs November through March and is named for both years it spans.
// Matches from April to October belong to no season.
const seasonOf = (column: string) => `
    CASE
        WHEN MONTH(${column}) >= 11 THEN CONCAT(YEAR(${column}), '-', YEAR(${column}) + 1)
        WHEN MONTH(${column}) <= 3 THEN CONCAT(YEAR(${column}) - 1, '-', YEAR(${column}))
    END`;

// The scoring breakdown, which dual meet and postseason matches store under
// the same column names. Kept in one list so the two can never drift apart.
const BREAKDOWN_COLUMNS = [
    'takedowns_for',
    'takedowns_against',
    'reversals_for',
    'reversals_against',
    'escapes_for',
    'escapes_against',
    'nearfall_for',
    'nearfall_against',
    'takedown_points_for',
    'takedown_points_against',
    'reversal_points_for',
    'reversal_points_against',
    'escape_points_for',
    'escape_points_against',
    'nearfall_points_for',
    'nearfall_points_against',
    'penalties_for',
    'penalties_against',
    'penalty_points_for',
    'penalty_points_against',
];

const jsonPairs = (alias: string, columns: string[]) =>
    columns.map((column) => `'${column}', ${alias}.${column}`).join(',\n');

const matchColumns = `
    m.match_id as 'id',
    m.match_id,
    m.team_match_id,
    m.wrestler_id,
    m.school_id,
    w.wrestler_name,
    m.opponent_name,
    m.weight_class,
    s.school_name,
    DATE_FORMAT(match_date, '%Y-%m-%d') as 'match_date',
    match_result,
    ${seasonOf('match_date')} as 'season'`;

const matchJoins = `
    wrestlingdb.wrestling_match m
        LEFT JOIN wrestlingdb.wrestling_wrestler w
            ON m.wrestler_id = w.wrestler_id
        LEFT JOIN wrestlingdb.wrestling_school s
            ON m.school_id = s.school_id`;

// `has_breakdown` is 1 when the match carries the full scoring breakdown and 0
// when it does not. A missing breakdown is not a breakdown of zeros, so stats
// that add these up must skip matches where it is 0 rather than count them.
const dualMeetQuery = (where: string) => `
    SELECT
        ${matchColumns},
        JSON_OBJECT(
            ${jsonPairs('rs', BREAKDOWN_COLUMNS)},
            'total_points_for', rs.total_points_for,
            'total_points_against', rs.total_points_against,
            'point_margin', rs.point_margin,
            'method_of_result', rs.method_of_result,
            'period', rs.period,
            'team_points_earned', rs.team_points_earned,
            'has_breakdown', rs.match_id IS NOT NULL
        ) as 'match_stats'
    FROM
        ${matchJoins}
            LEFT JOIN wrestlingdb.wrestling_regularseason rs
                ON m.match_id = rs.match_id
    WHERE
        m.team_match_id <> ${INDIVIDUAL_TEAM_MATCH_ID}
        ${where}`;

// The breakdown is optional for postseason matches and entered all or nothing,
// so one of its columns being filled in means all of them are.
const individualQuery = (where: string) => `
    SELECT
        ${matchColumns},
        JSON_OBJECT(
            'tournament', ps.tournament,
            'points_for', ps.points_for,
            'points_against', ps.points_against,
            'method_of_result', ps.method_of_result,
            'period', ps.period,
            ${jsonPairs('ps', BREAKDOWN_COLUMNS)},
            'has_breakdown', ps.takedowns_for IS NOT NULL
        ) as 'match_stats'
    FROM
        ${matchJoins}
            LEFT JOIN wrestlingdb.wrestling_postseason ps
                ON m.match_id = ps.match_id
    WHERE
        m.team_match_id = ${INDIVIDUAL_TEAM_MATCH_ID}
        ${where}`;

const teamMatchQuery = (where: string) => `
    SELECT
        * ,
        DATE_FORMAT(match_date, '%Y-%m-%d') as 'match_date_formatted',
        -- The scoresheet this dual was recorded from, if it came from one.
        -- A correlated subquery rather than a join so a team match cannot
        -- be duplicated in the results by having more than one sheet, and
        -- so the SELECT * above keeps returning only team match columns.
        (
            SELECT s.scoresheet_id
            FROM wrestlingdb.wrestling_livescoresheet s
            WHERE s.team_match_id = t.team_match_id
            ORDER BY s.scoresheet_id DESC
            LIMIT 1
        ) as 'scoresheet_id',
        ${seasonOf('match_date')} as 'season'
    FROM
        wrestlingdb.wrestling_teammatch t
    WHERE
        t.team_match_id <> ${INDIVIDUAL_TEAM_MATCH_ID}
        ${where}`;

const sendQuery = (res: Response, query: string, params: unknown[] = []) => {
    connection1.query(query, params, (err, results, fields) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Query failed' });
            return;
        }
        res.end(JSON.stringify(results));
    });
};

// Dual meets. The path keeps its old name so existing links and clients work.
matchRouter.get('/regular-season', async (req: Request, res: Response) => {
    sendQuery(res, dualMeetQuery(''));
});

matchRouter.get('/regular-season/:id', async (req: Request, res: Response) => {
    sendQuery(res, dualMeetQuery('AND m.wrestler_id = ?'), [req.params.id]);
});

matchRouter.get('/individual', async (req: Request, res: Response) => {
    sendQuery(res, individualQuery(''));
});

matchRouter.get('/individual/:id', async (req: Request, res: Response) => {
    sendQuery(res, individualQuery('AND m.wrestler_id = ?'), [req.params.id]);
});

matchRouter.get('/team-matches', async (req: Request, res: Response) => {
    sendQuery(res, teamMatchQuery(''));
});

matchRouter.get('/team-matches/:id', async (req: Request, res: Response) => {
    sendQuery(res, teamMatchQuery('AND t.team_match_id = ?'), [req.params.id]);
});

export default matchRouter;
