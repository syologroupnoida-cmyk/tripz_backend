import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const extractBearerToken = (req) => {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
};

export const authenticateUser = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw ApiError.unauthorized('Authentication token missing or malformed.');
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Access token has expired.');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid access token.');
    }
    throw error;
  }
});

// Like `authenticateUser`, but does NOT throw when the token is missing or
// invalid. Use on public routes that want to attribute the action to a logged-in
// user if a valid token happens to be present (e.g. public lead submission that
// auto-links to a customer when they're signed in).
export const optionalAuthenticateUser = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    // Invalid / expired token on a public route → treat as anonymous.
  }
  return next();
});

export const authorizeRoles = (allowedRoles = []) => {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('authorizeRoles: allowedRoles must be a non-empty array.');
  }
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`Access denied. Required role(s): ${allowedRoles.join(', ')}.`),
      );
    }
    return next();
  };
};
