import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError.js';
import { sendError } from '../utils/response.js';
import { isProduction } from '../config/env.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return sendError(res, {
      statusCode: err.statusCode,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return sendError(res, {
        statusCode: 409,
        message: `A record with this ${target} already exists.`,
      });
    }
    if (err.code === 'P2025') {
      return sendError(res, { statusCode: 404, message: 'Resource not found.' });
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return sendError(res, { statusCode: 400, message: 'Invalid database query parameters.' });
  }

  if (err?.type === 'entity.parse.failed') {
    return sendError(res, { statusCode: 400, message: 'Malformed JSON in request body.' });
  }

  console.error('[error]', {
    method: req.method,
    url: req.originalUrl,
    message: err?.message,
    stack: err?.stack,
  });

  return sendError(res, {
    statusCode: 500,
    message: 'Internal server error',
    details: isProduction ? null : { message: err?.message },
  });
};
