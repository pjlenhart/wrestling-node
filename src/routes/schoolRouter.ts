import { Request, Response } from 'express';
import { connection } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const schoolRouter = express.Router();

schoolRouter.get('/', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_school';
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) {
            res.status(500).send({
                message: err.message,
                data: null,
            });
        }
        conn.query(query, (err, resultSet: any) => {
            conn.release();
            if (err) {
                res.status(500).send({
                    message: err.message,
                    data: null,
                });
            } else {
                res.status(200).send({
                    message: 'Successfully retrieved all schools',
                    data: resultSet,
                });
            }
        });
    });
});

schoolRouter.get('/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_school s WHERE s.school_id=${req.params.id}`;
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) {
            res.status(500).send({
                message: err.message,
                data: null,
            });
        }
        conn.query(query, (err, resultSet: any) => {
            conn.release();
            if (err) {
                res.status(500).send({
                    message: err.message,
                    data: null,
                });
            } else {
                res.status(200).send({
                    message: `Successfully retrieved school with id: ${req.params.id}`,
                    data: resultSet,
                });
            }
        });
    });
});

export default schoolRouter;
