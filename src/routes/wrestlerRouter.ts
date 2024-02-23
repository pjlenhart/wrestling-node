import { Request, Response } from 'express';
import { connection } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';
import { isExternalModuleReference } from 'typescript';

const express = require('express');

const wrestlerRouter = express.Router();

wrestlerRouter.get('/', async (req: Request, res: Response) => {
    connection.getConnection(
        (err: NodeJS.ErrnoException, conn: PoolConnection) => {
            if (err) throw err;
            let query: string = 'SELECT * FROM wrestlingdb.wrestling_wrestler';
            conn.query(query, (err: QueryError, resultSet: any) => {
                if (err) throw err;
                else {
                    res.status(200).send({
                        message: 'Successfully retrieved all wrestlers',
                        data: resultSet,
                    });
                }
            });
            conn.release();
        }
    );
});

wrestlerRouter.get('/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_wrestler w WHERE w.wrestler_id=${req.params.id}`;
    connection.getConnection((err: QueryError, conn: PoolConnection) => {
        if (err) throw err;
        conn.query(query, (err, resultSet: any) => {
            if (err) throw err;
            else {
                res.status(200).send({
                    message: `Successfully retrieved wrestler with id: ${req.params.id}`,
                    data: resultSet,
                });
            }
        });
        conn.release();
    });
});

export default wrestlerRouter;
