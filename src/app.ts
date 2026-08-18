import testMiddleware from './middleware/testMiddleware';
import testRouter from './routes/testRouter';
import wrestlerRouter from './routes/wrestlerRouter';
import matchRouter from './routes/matchRouter';
import schoolRouter from './routes/schoolRouter';
import statsRouter from './routes/statisticsRouter';
import widgetRouter from './routes/widgetRouter';
import liveScoresheetRouter from './routes/liveScoresheetRouter';
import authRouter from './routes/authRouter';
import config, { useProductionDatabase } from './database/config';
const cors = require('cors');
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');

// load .env variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();

// disable header
app.disable('x-powered-by');

// middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// custom middleware
app.use(testMiddleware);

const prePath = '/wrestling-api';
app.use(`${prePath}/test`, testRouter);
app.use(`${prePath}/wrestlers`, wrestlerRouter);
app.use(`${prePath}/matches`, matchRouter);
app.use(`${prePath}/schools`, schoolRouter);
app.use(`${prePath}/statistics`, statsRouter);
app.use(`${prePath}/info`, widgetRouter);
app.use(`${prePath}/scoresheets`, liveScoresheetRouter);
app.use(`${prePath}/auth`, authRouter);

// Configurable so a second instance can be run against a local database
// without stopping the one already serving 8001.
const port = Number(process.env.PORT) || 8001;

app.listen(port, () => {
    // Reports what was actually resolved, not what was asked for -- the whole
    // point is to be able to tell at a glance whether this instance is about to
    // write to live match history.
    const target = useProductionDatabase
        ? `PRODUCTION (${config.mysql.host}/${config.mysql.database})`
        : `local (${config.mysql.host}/${config.mysql.database})`;
    console.log(`listening on ${port} -- database: ${target}`);
});
