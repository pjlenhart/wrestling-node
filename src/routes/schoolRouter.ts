import { Request, Response } from 'express';
import { connection, connection1 } from '../database/mysql';
import { QueryError, PoolConnection } from 'mysql2';

const express = require('express');

const schoolRouter = express.Router();

schoolRouter.get('/', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_school';
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

schoolRouter.get('/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_school s WHERE s.school_id=${req.params.id}`;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

export default schoolRouter;
