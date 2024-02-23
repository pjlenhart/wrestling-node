import { Request, Response } from 'express';
import { connection1 } from '../database/mysql';

const express = require('express');

const statsRouter = express.Router();

statsRouter.get('/career-stats', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.career_stats';
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

statsRouter.get('/career-stats/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.career_stats s WHERE s.wrestler_id=${req.params.id}`;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

export default statsRouter;
