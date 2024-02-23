import { Request, Response } from 'express';
import { connection, connection1 } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const wrestlerRouter = express.Router();

wrestlerRouter.get('/', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_wrestler';
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
    // connection.getConnection(
    //     (err: NodeJS.ErrnoException, conn: PoolConnection) => {
    //         if (err) {
    //             res.status(500).send({
    //                 message: err.message,
    //                 data: null,
    //             });
    //         }
    //         conn.query(query, (err: QueryError, resultSet: any) => {
    //             conn.release();
    //             if (err) {
    //                 res.status(500).send({
    //                     message: err.message,
    //                     data: null,
    //                 });
    //             } else {
    //                 res.status(200).send({
    //                     message: 'Successfully retrieved all wrestlers',
    //                     data: resultSet,
    //                 });
    //             }
    //         });
    //     }
    // );
});

wrestlerRouter.get('/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_wrestler w WHERE w.wrestler_id=${req.params.id}`;
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
                    message: `Successfully retrieved wrestler with id: ${req.params.id}`,
                    data: resultSet,
                });
            }
        });
    });
});

export default wrestlerRouter;
