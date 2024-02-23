import { Request, Response } from 'express';
import { connection1 } from '../database/mysql';

const express = require('express');

const widgetRouter = express.Router();

widgetRouter.get('/announcements', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_announcement';
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

widgetRouter.get('/accolades/:id', async (req: Request, res: Response) => {
    let query = `SELECT * FROM wrestlingdb.wrestling_accolade a WHERE a.wrestler_id=${req.params.id}`;
    connection1.query(query, (err, results, fields) => {
        if (err) res.status(500).send(err);
        res.end(JSON.stringify(results));
    });
});

export default widgetRouter;
