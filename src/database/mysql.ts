import config from './config';
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
