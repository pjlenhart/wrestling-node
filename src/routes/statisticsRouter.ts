import { Request, Response } from 'express';
import { connection } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const statsRouter = express.Router();

statsRouter.get('/career-stats', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.career_stats';
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) throw err;
        conn.query(query, (err, resultSet: any) => {
            if (err) throw err;
            else {
                res.status(200).send({
                    message: 'Successfully retrieved all career stats',
                    data: resultSet,
                });
            }
        });
        conn.release();
    });
});

statsRouter.get('/career-stats/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.career_stats s WHERE s.wrestler_id=${req.params.id}`;
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) throw err;
        conn.query(query, (err, resultSet: any) => {
            if (err) throw err;
            else {
                res.status(200).send({
                    message: `Successfully retrieved career stats for wrestler with id: ${req.params.id}`,
                    data: resultSet,
                });
            }
        });
        conn.release();
    });
});

export default statsRouter;
