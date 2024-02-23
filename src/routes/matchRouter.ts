import { Request, Response } from 'express';
import { connection1 } from '../database/mysql';

const express = require('express');

const matchRouter = express.Router();

matchRouter.get('/regular-season', async (req: Request, res: Response) => {
    let query = `
                    SELECT
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
                        CASE 
                            WHEN DATEDIFF('2021-11-01',match_date) < 1 AND DATEDIFF('2022-04-01', match_date) > 0 THEN '2021-2022'
                            WHEN DATEDIFF('2022-11-01',match_date) < 1 AND DATEDIFF('2023-04-01', match_date) > 0 THEN '2022-2023'
                            WHEN DATEDIFF('2023-11-01',match_date) < 1 AND DATEDIFF('2024-04-01', match_date) > 0 THEN '2023-2024'
                            WHEN DATEDIFF('2024-11-01',match_date) < 1 AND DATEDIFF('2025-04-01', match_date) > 0 THEN '2024-2025'
                            WHEN DATEDIFF('2025-11-01',match_date) < 1 AND DATEDIFF('2026-04-01', match_date) > 0 THEN '2025-2026'
                            WHEN DATEDIFF('2026-11-01',match_date) < 1 AND DATEDIFF('2027-04-01', match_date) > 0 THEN '2026-2027'
                        END as 'season',
                        JSON_OBJECT(
	                    	'takedowns_for', rs.takedowns_for,
                            'takedowns_against', rs.takedowns_against,
                            'reversals_for', rs.reversals_for,
                            'reversals_against', rs.reversals_against,
                            'escapes_for', rs.escapes_for,
                            'escapes_against', rs.escapes_against,
                            'nearfall_for', rs.nearfall_for,
                            'nearfall_against', rs.nearfall_against,
                            'takedown_points_for', rs.takedown_points_for,
                            'takedown_points_against', rs.takedown_points_against,
                            'reversal_points_for', rs.reversal_points_for,
                            'reversal_points_against', rs.reversal_points_against,
                            'nearfall_points_for', rs.nearfall_points_for,
                            'nearfall_points_against', rs.nearfall_points_against,
                            'penalties_for', rs.penalties_for,
                            'penalties_against', rs.penalties_against,
                            'penalty_points_for', rs.penalty_points_for,
                            'penalty_points_against', rs.penalty_points_against,
                            'total_points_for', rs.total_points_for,
                            'total_points_against', rs.total_points_against,
                            'point_margin', rs.point_margin,
                            'method_of_result', rs.method_of_result,
                            'period', rs.period,
                            'team_points_earned', rs.team_points_earned
                        ) as 'match_stats'
                        
                        FROM                     
	                        wrestlingdb.wrestling_match m
	                    	    LEFT JOIN wrestlingdb.wrestling_wrestler w
	                    		    ON m.wrestler_id = w.wrestler_id
	                    	    LEFT JOIN wrestlingdb.wrestling_school s
	                    		    ON m.school_id = s.school_id
	                    	    LEFT JOIN wrestlingdb.wrestling_regularseason rs
	                    		    ON m.match_id = rs.match_id
                        
                        WHERE
                            m.team_match_id <> 24
    `;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

matchRouter.get('/regular-season/:id', async (req: Request, res: Response) => {
    let query = `
            SELECT
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
                CASE 
                    WHEN DATEDIFF('2021-11-01',match_date) < 1 AND DATEDIFF('2022-04-01', match_date) > 0 THEN '2021-2022'
                    WHEN DATEDIFF('2022-11-01',match_date) < 1 AND DATEDIFF('2023-04-01', match_date) > 0 THEN '2022-2023'
                    WHEN DATEDIFF('2023-11-01',match_date) < 1 AND DATEDIFF('2024-04-01', match_date) > 0 THEN '2023-2024'
                    WHEN DATEDIFF('2024-11-01',match_date) < 1 AND DATEDIFF('2025-04-01', match_date) > 0 THEN '2024-2025'
                    WHEN DATEDIFF('2025-11-01',match_date) < 1 AND DATEDIFF('2026-04-01', match_date) > 0 THEN '2025-2026'
                    WHEN DATEDIFF('2026-11-01',match_date) < 1 AND DATEDIFF('2027-04-01', match_date) > 0 THEN '2026-2027'
                END as 'season',
                JSON_OBJECT(
                    'takedowns_for', rs.takedowns_for,
                    'takedowns_against', rs.takedowns_against,
                    'reversals_for', rs.reversals_for,
                    'reversals_against', rs.reversals_against,
                    'escapes_for', rs.escapes_for,
                    'escapes_against', rs.escapes_against,
                    'nearfall_for', rs.nearfall_for,
                    'nearfall_against', rs.nearfall_against,
                    'takedown_points_for', rs.takedown_points_for,
                    'takedown_points_against', rs.takedown_points_against,
                    'reversal_points_for', rs.reversal_points_for,
                    'reversal_points_against', rs.reversal_points_against,
                    'nearfall_points_for', rs.nearfall_points_for,
                    'nearfall_points_against', rs.nearfall_points_against,
                    'penalties_for', rs.penalties_for,
                    'penalties_against', rs.penalties_against,
                    'penalty_points_for', rs.penalty_points_for,
                    'penalty_points_against', rs.penalty_points_against,
                    'total_points_for', rs.total_points_for,
                    'total_points_against', rs.total_points_against,
                    'point_margin', rs.point_margin,
                    'method_of_result', rs.method_of_result,
                    'period', rs.period,
                    'team_points_earned', rs.team_points_earned
                ) as 'match_stats'
                
                FROM                     
                    wrestlingdb.wrestling_match m
                        LEFT JOIN wrestlingdb.wrestling_wrestler w
                            ON m.wrestler_id = w.wrestler_id
                        LEFT JOIN wrestlingdb.wrestling_school s
                            ON m.school_id = s.school_id
                        LEFT JOIN wrestlingdb.wrestling_regularseason rs
                            ON m.match_id = rs.match_id
                
                WHERE
                    m.wrestler_id = ${req.params.id}
                    AND m.team_match_id <> 24 
    `;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

matchRouter.get('/individual', async (req: Request, res: Response) => {
    let query = `
            SELECT
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
                CASE 
                    WHEN DATEDIFF('2021-11-01',match_date) < 1 AND DATEDIFF('2022-04-01', match_date) > 0 THEN '2021-2022'
                    WHEN DATEDIFF('2022-11-01',match_date) < 1 AND DATEDIFF('2023-04-01', match_date) > 0 THEN '2022-2023'
                    WHEN DATEDIFF('2023-11-01',match_date) < 1 AND DATEDIFF('2024-04-01', match_date) > 0 THEN '2023-2024'
                    WHEN DATEDIFF('2024-11-01',match_date) < 1 AND DATEDIFF('2025-04-01', match_date) > 0 THEN '2024-2025'
                    WHEN DATEDIFF('2025-11-01',match_date) < 1 AND DATEDIFF('2026-04-01', match_date) > 0 THEN '2025-2026'
                    WHEN DATEDIFF('2026-11-01',match_date) < 1 AND DATEDIFF('2027-04-01', match_date) > 0 THEN '2026-2027'
                END as 'season',
                JSON_OBJECT(
                    'tournament', rs.tournament,
                    'points_for', rs.points_for,
                    'points_against', rs.points_against,
                    'method_of_result', rs.method_of_result,
                    'period', rs.period
                ) as 'match_stats'
                
                FROM                     
                    wrestlingdb.wrestling_match m
                        LEFT JOIN wrestlingdb.wrestling_wrestler w
                            ON m.wrestler_id = w.wrestler_id
                        LEFT JOIN wrestlingdb.wrestling_school s
                            ON m.school_id = s.school_id
                        LEFT JOIN wrestlingdb.wrestling_postseason rs
                            ON m.match_id = rs.match_id

                WHERE
                    m.team_match_id = 24
            `;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

matchRouter.get('/individual/:id', async (req: Request, res: Response) => {
    let query = `
            SELECT
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
                CASE 
                    WHEN DATEDIFF('2021-11-01',match_date) < 1 AND DATEDIFF('2022-04-01', match_date) > 0 THEN '2021-2022'
                    WHEN DATEDIFF('2022-11-01',match_date) < 1 AND DATEDIFF('2023-04-01', match_date) > 0 THEN '2022-2023'
                    WHEN DATEDIFF('2023-11-01',match_date) < 1 AND DATEDIFF('2024-04-01', match_date) > 0 THEN '2023-2024'
                    WHEN DATEDIFF('2024-11-01',match_date) < 1 AND DATEDIFF('2025-04-01', match_date) > 0 THEN '2024-2025'
                    WHEN DATEDIFF('2025-11-01',match_date) < 1 AND DATEDIFF('2026-04-01', match_date) > 0 THEN '2025-2026'
                    WHEN DATEDIFF('2026-11-01',match_date) < 1 AND DATEDIFF('2027-04-01', match_date) > 0 THEN '2026-2027'
                END as 'season',
                JSON_OBJECT(
                    'tournament', rs.tournament,
                    'points_for', rs.points_for,
                    'points_against', rs.points_against,
                    'method_of_result', rs.method_of_result,
                    'period', rs.period
                ) as 'match_stats'
                
                FROM                     
                    wrestlingdb.wrestling_match m
                        LEFT JOIN wrestlingdb.wrestling_wrestler w
                            ON m.wrestler_id = w.wrestler_id
                        LEFT JOIN wrestlingdb.wrestling_school s
                            ON m.school_id = s.school_id
                        LEFT JOIN wrestlingdb.wrestling_postseason rs
                            ON m.match_id = rs.match_id

                WHERE
                    m.team_match_id = 24
                    AND m.wrestler_id = ${req.params.id}
            `;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

matchRouter.get('/team-matches', async (req: Request, res: Response) => {
    let query = `
        SELECT 
            * ,
            DATE_FORMAT(match_date, '%Y-%m-%d') as 'match_date_formatted',
            CASE 
                WHEN DATEDIFF('2021-11-01',match_date) < 1 AND DATEDIFF('2022-04-01', match_date) > 0 THEN '2021-2022'
                WHEN DATEDIFF('2022-11-01',match_date) < 1 AND DATEDIFF('2023-04-01', match_date) > 0 THEN '2022-2023'
                WHEN DATEDIFF('2023-11-01',match_date) < 1 AND DATEDIFF('2024-04-01', match_date) > 0 THEN '2023-2024'
                WHEN DATEDIFF('2024-11-01',match_date) < 1 AND DATEDIFF('2025-04-01', match_date) > 0 THEN '2024-2025'
                WHEN DATEDIFF('2025-11-01',match_date) < 1 AND DATEDIFF('2026-04-01', match_date) > 0 THEN '2025-2026'
                WHEN DATEDIFF('2026-11-01',match_date) < 1 AND DATEDIFF('2027-04-01', match_date) > 0 THEN '2026-2027'
            END as 'season'
        FROM 
            wrestlingdb.wrestling_teammatch t 
        WHERE
            t.team_match_id <> 24
        `;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

matchRouter.get('/team-matches/:id', async (req: Request, res: Response) => {
    let query = `
        SELECT 
            * ,
            DATE_FORMAT(match_date, '%Y-%m-%d') as 'match_date_formatted',
            CASE 
                WHEN DATEDIFF('2021-11-01',match_date) < 1 AND DATEDIFF('2022-04-01', match_date) > 0 THEN '2021-2022'
                WHEN DATEDIFF('2022-11-01',match_date) < 1 AND DATEDIFF('2023-04-01', match_date) > 0 THEN '2022-2023'
                WHEN DATEDIFF('2023-11-01',match_date) < 1 AND DATEDIFF('2024-04-01', match_date) > 0 THEN '2023-2024'
                WHEN DATEDIFF('2024-11-01',match_date) < 1 AND DATEDIFF('2025-04-01', match_date) > 0 THEN '2024-2025'
                WHEN DATEDIFF('2025-11-01',match_date) < 1 AND DATEDIFF('2026-04-01', match_date) > 0 THEN '2025-2026'
                WHEN DATEDIFF('2026-11-01',match_date) < 1 AND DATEDIFF('2027-04-01', match_date) > 0 THEN '2026-2027'
            END as 'season'
        FROM 
            wrestlingdb.wrestling_teammatch t 
        WHERE 
            t.team_match_id <> 24
            AND t.team_match_id = ${req.params.id}
        `;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

export default matchRouter;
