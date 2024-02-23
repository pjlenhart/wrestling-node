import config from './config';
import mysql from 'mysql';
import { createPool } from 'mysql2';

export const connection1 = mysql.createConnection({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.pass,
    database: config.mysql.database,
    port: 3306,
});

connection1.connect((err) => {
    if (err) throw err;
    console.log('You are now connected to the DB');
});

const params = {
    user: config.mysql.user,
    password: config.mysql.pass,
    host: config.mysql.host,
    database: config.mysql.database,
};

export const connection = createPool({
    user: config.mysql.user,
    password: config.mysql.pass,
    host: config.mysql.host,
    database: config.mysql.database,
    port: 3306,
});
