import { Request, Response } from 'express';
import { connection } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const widgetRouter = express.Router();

widgetRouter.get('/announcements', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_announcement';
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
                    message: 'Successfully retrieved all announcements',
                    data: resultSet,
                });
            }
        });
    });
});

widgetRouter.get('/accolades/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_accolade a WHERE a.wrestler_id=${req.params.id}`;
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        conn.query(query, (err, resultSet: any) => {
            conn.release();
            if (err) {
                res.status(500).send({
                    message: err.message,
                    data: null,
                });
            } else {
                res.status(200).send({
                    message: 'Successfully retrieved accolades',
                    data: resultSet,
                });
            }
        });
    });
});

export default widgetRouter;
