/**
 * A promise-based pool, for the write path.
 *
 * The existing `connection1` is a single callback-style connection, which is
 * fine for the read-only routers but cannot express a transaction. Committing a
 * scoresheet touches three tables and must be all-or-nothing: a dual that lands
 * a team match and half its bouts is worse than one that fails outright.
 */

import mysql from 'mysql2/promise';
import config, { useProductionDatabase } from './config';

export const pool = mysql.createPool({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.pass,
    database: config.mysql.database,
    port: 3306,
    waitForConnections: true,
    connectionLimit: 5,
    // Sheets are submitted by one person at a time; a deep queue would only
    // hide a stuck connection.
    queueLimit: 20,
});

/**
 * Run `work` inside a transaction, rolling back on any throw.
 *
 * The connection is always released, including when the rollback itself fails
 * -- a leaked connection would take the pool down a request at a time.
 */
export async function withTransaction<T>(
    work: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        try {
            const result = await work(conn);
            await conn.commit();
            return result;
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    } finally {
        conn.release();
    }
}

/**
 * Refuse to continue unless the configured database is local.
 *
 * The committed .env points at the production host. Integration tests write
 * real rows, so they call this first -- running them against production would
 * quietly invent match history.
 */
export function assertLocalDatabase(): void {
    const host = String(config.mysql.host || '');

    // Both conditions are checked: the selector says which set of credentials
    // was chosen, the host says where they actually point. Either one being
    // wrong is enough to stop.
    if (useProductionDatabase || (host !== 'localhost' && host !== '127.0.0.1')) {
        throw new Error(
            `refusing to run against a non-local database (resolved host: ${host}). ` +
                `Set DB_SOURCE=local to run these tests.`,
        );
    }
}

export async function closePool(): Promise<void> {
    await pool.end();
}
