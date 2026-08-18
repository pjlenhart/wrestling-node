import dotenv from 'dotenv';

dotenv.config();

/**
 * Which database to talk to.
 *
 * Production has to be asked for by name. Anything else -- a typo, an empty
 * value, a forgotten variable, a fresh clone with no .env at all -- resolves to
 * the local database.
 *
 * The direction matters. This project writes match history, and a mistake in
 * the safe direction costs a confusing error on a dev machine, while a mistake
 * in the other direction invents results in the live database that look
 * exactly like real ones.
 */
const source = String(process.env.DB_SOURCE || '')
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, '');

export const useProductionDatabase = source === 'prod' || source === 'production';

/**
 * Say so, loudly, when nothing was chosen.
 *
 * Defaulting to local is the right way to be wrong -- a dev machine that cannot
 * reach a database is a bad afternoon, while one silently writing to production
 * invents match history nobody can tell from the real thing. But a *deployed*
 * server that fell through to this default will fail every query, and the
 * reason needs to be the first thing in the log rather than something inferred
 * from a hundred connection errors.
 */
if (!source) {
    console.warn(
        '\n[config] DB_SOURCE is not set -- using the LOCAL database.\n' +
            '[config] In production set DB_SOURCE=prod, or every query will fail.\n',
    );
}

/**
 * Values are trimmed of stray quotes and trailing slashes.
 *
 * dotenv already strips a matching pair of surrounding quotes, but only when
 * the value ends in one -- a single trailing character is enough to leave the
 * quotes embedded in the host, which fails as a DNS lookup rather than as a
 * configuration error, and is miserable to diagnose.
 */
function clean(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    return value.trim().replace(/[\\/]+$/, '').replace(/^['"]|['"]$/g, '');
}

const MYSQL = useProductionDatabase
    ? {
          host: clean(process.env.DB_HOST),
          database: clean(process.env.DB_DATABASE) || 'wrestlingdb',
          user: clean(process.env.DB_USER),
          pass: process.env.DB_PASS,
      }
    : {
          host: clean(process.env.DB_LOCAL_HOST) || 'localhost',
          database: clean(process.env.DB_LOCAL_DATABASE) || clean(process.env.DB_DATABASE) || 'wrestlingdb',
          user: clean(process.env.DB_LOCAL_USER),
          pass: process.env.DB_LOCAL_PASS,
      };

const SERVER_HOSTNAME = process.env.SERVER_HOSTNAME || 'localhost';
const SERVER_PORT = process.env.SERVER_PORT || '1336';

const SERVER = {
    hostname: SERVER_HOSTNAME,
    port: SERVER_PORT,
};

const config = {
    mysql: MYSQL,
    server: SERVER,
};

export default config;
