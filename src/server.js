import http from 'node:http';
import app from './app.js';
import { env, isProduction } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { printRequestLogHeader } from './middlewares/requestLogger.middleware.js';
import { verifyMailTransport } from './services/mail/index.js';
import { logKycVerificationMode } from './services/vendorKyc/documentVerification.service.js';

const server = http.createServer(app);
console.log('this is token', env.SUREPASS_TOKEN);
const start = async () => {
  await connectDatabase();
  await verifyMailTransport();
  logKycVerificationMode();
  // Bind to 0.0.0.0 so requests from Nginx (or any external source) reach us.
  // Binding to the default (localhost/127.0.0.1) would block all non-local
  // connections — fine for dev, broken behind a reverse proxy.
  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[server] Tripz API listening on port ${env.PORT} (${env.NODE_ENV})`);
    if (!isProduction) {
      printRequestLogHeader();
    }
  });
};

const shutdown = async (signal) => {
  console.log(`[server] ${signal} received. Shutting down gracefully...`);
  server.close(async (err) => {
    if (err) {
      console.error('[server] Error during HTTP server shutdown:', err);
      process.exit(1);
    }
    try {
      await disconnectDatabase();
      process.exit(0);
    } catch (dbErr) {
      console.error('[server] Error during DB shutdown:', dbErr);
      process.exit(1);
    }
  });

  // Force-exit if graceful shutdown takes too long.
  setTimeout(() => {
    console.error('[server] Force exit after timeout.');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  shutdown('uncaughtException');
});

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
