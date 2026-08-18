/**
 * Signing in.
 *
 * The only endpoint on this API that accepts a password, and the only reason it
 * exists is that Django is not deployed -- its `auth_user` table is the record
 * of who exists, but nothing is serving a login for it.
 */

import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../database/pool';
import { verifyDjangoPassword } from '../auth/djangoPassword';
import { issueToken, readToken, bearerFrom } from '../auth/tokens';

const express = require('express');

const authRouter = express.Router();

/** One message for every failure, so it cannot be used to enumerate accounts. */
const REJECTED = 'that username and password do not match';

authRouter.post('/login', async (req: Request, res: Response) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password) {
        res.status(400).json({ error: 'a username and password are required' });
        return;
    }

    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT id, username, password, is_staff, is_active FROM auth_user WHERE username = ? LIMIT 1',
            [username],
        );

        const user = rows[0];

        // The hash is verified even when there is no such user, so a missing
        // account and a wrong password take the same amount of time.
        const stored = user
            ? user.password
            : 'pbkdf2_sha256$320000$notarealsalt$3AbYSlm2XN0Fh4kUXWLpS7ZG1QYqbEwn0nJ0PjKk1sQ=';
        const matches = verifyDjangoPassword(password, stored);

        if (!user || !matches || !user.is_active) {
            res.status(401).json({ error: REJECTED });
            return;
        }

        const isStaff = Boolean(user.is_staff);
        const token = issueToken({ sub: user.id, username: user.username, isStaff });

        res.json({
            token,
            user: { id: user.id, username: user.username, isStaff },
        });
    } catch (err) {
        const message = (err as Error).message || '';
        // A missing JWT_SECRET is a deployment problem, not a bad password.
        if (message.includes('JWT_SECRET')) {
            res.status(503).json({ error: 'signing in is not configured on this server' });
            return;
        }
        res.status(500).json({ error: 'sign in could not be completed' });
    }
});

/** Who the caller is, for restoring a session on page load. */
authRouter.get('/me', async (req: Request, res: Response) => {
    const claims = readToken(bearerFrom(req.headers.authorization));
    if (!claims) {
        res.status(401).json({ error: 'not signed in' });
        return;
    }
    res.json({ id: claims.sub, username: claims.username, isStaff: claims.isStaff });
});

export default authRouter;
