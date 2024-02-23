import config from './config';
import mysql from 'mysql2';

// const params = {
//   user: config.mysql.user,
//   password: config.mysql.pass,
//   host: config.mysql.host,
//   database: config.mysql.database,
// };

export const connection1 = mysql.createConnection({
    user: config.mysql.user,
    password: config.mysql.pass,
    host: config.mysql.host,
    database: config.mysql.database,
    port: 3306,
});
