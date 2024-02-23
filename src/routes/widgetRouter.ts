import { Request, Response } from 'express';
import { connection } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const widgetRouter = express.Router();

widgetRouter.get('/announcements', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_announcement';
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) throw err;
        conn.query(query, (err, resultSet: any) => {
            if (err) throw err;
            else {
                res.status(200).send({
                    message: 'Successfully retrieved all announcements',
                    data: resultSet,
                });
            }
        });
        conn.release();
    });
});

widgetRouter.get('/accolades/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_accolade a WHERE a.wrestler_id=${req.params.id}`;
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) throw err;
        conn.query(query, (err, resultSet: any) => {
            if (err) throw err;
            else {
                res.status(200).send({
                    message: 'Successfully retrieved accolades',
                    data: resultSet,
                });
            }
        });
        conn.release();
    });
});

export default widgetRouter;
