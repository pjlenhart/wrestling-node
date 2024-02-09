import { Request, Response } from 'express';
import { connection } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const widgetRouter = express.Router();

widgetRouter.get('/', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_announcements';
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
                    message: 'Successfully retrieved all announcements',
                    data: resultSet,
                });
            }
        });
    });
});

export default widgetRouter;
