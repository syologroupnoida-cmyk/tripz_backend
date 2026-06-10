import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env, isProduction } from './config/env.js';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { requestLogger } from './middlewares/requestLogger.middleware.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());

// CORS — explicit methods + allowed headers so preflight (OPTIONS) succeeds
// when the frontend sends Authorization or custom headers. Origin handling
// supports either "*" (any origin, useful in dev) or a comma-separated list.
const corsOptions = {
  origin: (origin, callback) => {
    // No Origin header → server-to-server / curl / Postman. Always allow.
    if (!origin) return callback(null, true);

    if (env.CORS_ORIGIN === '*') {
      return callback(null, true);
    }

    const allowed = env.CORS_ORIGIN.split(',').map((o) => o.trim());
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin ${origin} not allowed`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Disposition'],
  optionsSuccessStatus: 204,
  maxAge: 86400, // cache preflight for 1 day
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // explicit preflight handler for all routes
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (isProduction) {
  app.use(morgan('combined'));
} else {
  app.use(requestLogger);
}

app.get('/', (_req, res) => {
  res.json({ success: true, message: 'Tripz API', version: '1.0.0' });
});

app.use('/api/v1', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
