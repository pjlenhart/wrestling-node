import testMiddleware from './middleware/testMiddleware';
import testRouter from './routes/testRouter';
import wrestlerRouter from './routes/wrestlerRouter';
import matchRouter from './routes/matchRouter';
import schoolRouter from './routes/schoolRouter';
import statsRouter from './routes/statisticsRouter';
import widgetRouter from './routes/widgetRouter';
const cors = require('cors');
const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

// load .env variables
require('dotenv').config({ path: '../.env' });

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

app.listen(8001, () => console.log('listening on 8001'));
