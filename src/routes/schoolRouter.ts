import { Request, Response } from 'express';
import { connection } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const schoolRouter = express.Router();

schoolRouter.get('/', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_school';
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) throw err;
        conn.query(query, (err, resultSet: any) => {
            if (err) throw err;
            else {
                res.status(200).send({
                    message: 'Successfully retrieved all schools',
                    data: resultSet,
                });
            }
        });
        conn.release();
    });
});

schoolRouter.get('/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_school s WHERE s.school_id=${req.params.id}`;
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) throw err;
        conn.query(query, (err, resultSet: any) => {
            if (err) throw err;
            else {
                res.status(200).send({
                    message: `Successfully retrieved school with id: ${req.params.id}`,
                    data: resultSet,
                });
            }
        });
        conn.release();
    });
});

export default schoolRouter;
