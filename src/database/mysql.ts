import config from './config';
import mysql from 'mysql2/promise';
import { createPool } from 'mysql2';

// const params = {
//   user: config.mysql.user,
//   password: config.mysql.pass,
//   host: config.mysql.host,
//   database: config.mysql.database,
// };

export const connection = createPool({
    user: config.mysql.user,
    password: config.mysql.pass,
    host: config.mysql.host,
    database: config.mysql.database,
    port: 3306,
});

export const connection1 = await mysql.createConnection({
    user: config.mysql.user,
    password: config.mysql.pass,
    host: config.mysql.host,
    database: config.mysql.database,
    port: 3306,
});
