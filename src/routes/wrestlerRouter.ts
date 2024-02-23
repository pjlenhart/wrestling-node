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
});

wrestlerRouter.get('/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_wrestler w WHERE w.wrestler_id=${req.params.id}`;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

export default wrestlerRouter;
