/**
 * Verifying a password against Django's `auth_user` table.
 *
 * Django is not deployed anywhere -- it exists to own the schema and to serve a
 * local admin panel -- so this API cannot delegate a login to it. It reads the
 * stored hash directly instead, which is safe because the hash format is
 * self-describing: the algorithm, cost and salt all travel with it.
 *
 * That last part matters here. Accounts on this database were created under
 * different Django versions and carry different iteration counts (320,000 and
 * 390,000 both appear), so the cost has to be read from each hash rather than
 * assumed. Hardcoding one would silently reject every account created under the
 * other.
 */

import crypto from 'crypto';

const SUPPORTED_ALGORITHM = 'pbkdf2_sha256';

/** SHA-256's digest size, which is Django's default derived-key length. */
const KEY_LENGTH = 32;

export interface ParsedHash {
    algorithm: string;
    iterations: number;
    salt: string;
    hash: string;
}

/** Split `pbkdf2_sha256$320000$<salt>$<base64>` into its parts. */
export function parseDjangoHash(encoded: string): ParsedHash | null {
    if (!encoded) return null;

    const parts = String(encoded).split('$');
    if (parts.length !== 4) return null;

    const [algorithm, iterations, salt, hash] = parts;
    const rounds = parseInt(iterations, 10);

    if (!algorithm || !salt || !hash || !Number.isFinite(rounds) || rounds <= 0) return null;

    return { algorithm, iterations: rounds, salt, hash };
}

/**
 * Whether `password` produces `encoded`.
 *
 * Returns false rather than throwing for anything unusable -- an unsupported
 * algorithm, a malformed row, an empty password. A login failing closed is the
 * only acceptable behaviour when the stored hash cannot be understood.
 */
export function verifyDjangoPassword(password: string, encoded: string): boolean {
    if (!password) return false;

    const parsed = parseDjangoHash(encoded);
    if (!parsed) return false;

    // Django supports several hashers; this only understands its default. An
    // account stored under another one cannot log in here, which is a visible
    // failure rather than a silent downgrade.
    if (parsed.algorithm !== SUPPORTED_ALGORITHM) return false;

    let expected: Buffer;
    try {
        expected = Buffer.from(parsed.hash, 'base64');
    } catch (err) {
        return false;
    }

    const derived = crypto.pbkdf2Sync(
        password,
        parsed.salt,
        parsed.iterations,
        expected.length || KEY_LENGTH,
        'sha256',
    );

    if (derived.length !== expected.length) return false;

    // Constant-time, so a wrong password cannot be narrowed down by timing.
    return crypto.timingSafeEqual(derived, expected);
}

export default { verifyDjangoPassword, parseDjangoHash };
