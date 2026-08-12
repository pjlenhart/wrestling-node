import { Request, Response, NextFunction } from 'express';
import { bearerFrom, readToken, StaffClaims } from '../auth/tokens';

/**
 * Who may change a scoresheet.
 *
 * Reading is public and stays public: anyone can list sheets or look at a dual.
 * Only submitting, committing and deleting come through here.
 *
 * The bar is Django's `is_staff` flag -- the same one that grants access to the
 * admin panel -- so granting somebody the ability to score a dual is a
 * deliberate act performed in a tool that already exists, rather than a second
 * permission system to keep in step with the first.
 */

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: StaffClaims;
        }
    }
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
    const token = bearerFrom(req.headers.authorization);

    if (!token) {
        res.status(401).json({ error: 'sign in to change a scoresheet' });
        return;
    }

    const claims = readToken(token);
    if (!claims) {
        res.status(401).json({ error: 'your session has expired -- sign in again' });
        return;
    }

    // Checked on every request rather than trusted from sign-in alone: a token
    // issued before somebody lost their staff flag should stop working.
    if (!claims.isStaff) {
        res.status(403).json({ error: 'this account is not allowed to change scoresheets' });
        return;
    }

    req.user = claims;
    next();
}

export default requireStaff;
