import dotenv from 'dotenv';

dotenv.config();

const MYSQL_HOST = process.env.DB_HOST || 'localhost';
const MYSQL_DATABASE = process.env.DB_DATABASE || 'wrestlingdb';
const MYSQL_USER = process.env.DB_USER;
const MYSQL_PASS = process.env.DB_PASS;

const MYSQL = {
    host: MYSQL_HOST,
    database: MYSQL_DATABASE,
    user: MYSQL_USER,
    pass: MYSQL_PASS,
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
