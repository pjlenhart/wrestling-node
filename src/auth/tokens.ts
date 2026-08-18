/**
 * Issuing and checking the token that authorises a write.
 *
 * Stateless on purpose: there is no session table to migrate, and the only
 * thing a token has to carry is who signed in and whether they are staff.
 */

import jwt from 'jsonwebtoken';

/** A dual runs a couple of hours; a tournament runs all day. */
export const TOKEN_LIFETIME = '12h';

export interface StaffClaims {
    sub: number;
    username: string;
    isStaff: boolean;
}

/**
 * The signing secret.
 *
 * Read at call time rather than at import, so a missing value surfaces when a
 * login is attempted rather than crashing the whole API at boot -- every read
 * endpoint on this server is public and should keep working regardless.
 *
 * There is deliberately no fallback. A default secret would make every token
 * on every deployment forgeable by anyone who has read this file.
 */
function secret(): string {
    const value = process.env.JWT_SECRET;
    if (!value || value.length < 32) {
        throw new Error(
            'JWT_SECRET is missing or too short (needs at least 32 characters). ' +
                'Signing in is disabled until it is set.',
        );
    }
    return value;
}

export function issueToken(claims: StaffClaims): string {
    return jwt.sign(
        { username: claims.username, isStaff: claims.isStaff },
        secret(),
        { subject: String(claims.sub), expiresIn: TOKEN_LIFETIME },
    );
}

/** Returns the claims, or null for anything expired, forged or malformed. */
export function readToken(token: string): StaffClaims | null {
    if (!token) return null;

    try {
        const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
        return {
            sub: Number(payload.sub),
            username: String(payload.username || ''),
            isStaff: payload.isStaff === true,
        };
    } catch (err) {
        return null;
    }
}

/** Pull a bearer token out of the Authorization header. */
export function bearerFrom(header: string | undefined): string {
    if (!header) return '';
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1].trim() : '';
}

export default { issueToken, readToken, bearerFrom, TOKEN_LIFETIME };
