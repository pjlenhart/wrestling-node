import { Request, Response } from 'express';
import { connection1 } from '../database/mysql';

const express = require('express');

const widgetRouter = express.Router();

widgetRouter.get('/announcements', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_announcement';
    connection1.query(query, (err, results, fields) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Query failed' });
            return;
        }
        res.end(JSON.stringify(results));
    });
});

// The home page calendar. A season is named by the year it starts in, and runs
// November through March: season=2026 is Nov 1 2026 - Mar 31 2027. Multi-day
// events are matched on overlap, so a tournament starting before the window but
// ending inside it is still returned.
widgetRouter.get('/events', async (req: Request, res: Response) => {
    const season = Number(req.query.season);
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
        res.status(400).json({ error: 'season must be a four-digit year' });
        return;
    }
    const seasonStart = `${season}-11-01`;
    const seasonEnd = `${season + 1}-03-31`;

    // Dates and times are formatted in SQL so they arrive as plain calendar
    // values -- a DATE hydrated into a JS Date shifts a day west of UTC.
    let query = `SELECT
            event_id,
            DATE_FORMAT(event_date, '%Y-%m-%d') as 'event_date',
            DATE_FORMAT(end_date, '%Y-%m-%d') as 'end_date',
            team,
            event_type,
            title,
            venue,
            location,
            TIME_FORMAT(start_time, '%H:%i') as 'start_time'
        FROM wrestlingdb.wrestling_event
        WHERE event_date <= ? AND COALESCE(end_date, event_date) >= ?
        ORDER BY event_date, start_time IS NULL, start_time, event_id`;
    connection1.query(query, [seasonEnd, seasonStart], (err, results, fields) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Query failed' });
            return;
        }
        res.end(JSON.stringify(results));
    });
});

widgetRouter.get('/accolades/:id', async (req: Request, res: Response) => {
    let query = 'SELECT * FROM wrestlingdb.wrestling_accolade a WHERE a.wrestler_id=?';
    connection1.query(query, [req.params.id], (err, results, fields) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: 'Query failed' });
            return;
        }
        res.end(JSON.stringify(results));
    });
});

export default widgetRouter;
