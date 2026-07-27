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
      // Present only for VENDOR users — undefined for CLIENT/ADMIN/SUPER_ADMIN.
      vendorType: payload.vendorType,
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
      vendorType: payload.vendorType,
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

// Gate a route on the VENDOR's business type (TRAVEL_AGENT / PROPERTY_OWNER / ...).
// Use AFTER authenticateUser + authorizeRoles(['VENDOR']).
//
// Reads vendorType from the JWT payload (set by authenticateUser), so no DB
// hit per request. If a vendor upgrades their vendorType, they'll need to
// re-login for the new token to reflect it.
//
// Usage:
//   router.post('/vendor/packages',
//     authenticateUser,
//     authorizeRoles(['VENDOR']),
//     requireVendorType('TRAVEL_AGENT'),
//     ...handlers,
//   );
export const requireVendorType = (...allowedTypes) => {
  if (allowedTypes.length === 0) {
    throw new Error('requireVendorType: at least one vendor type is required.');
  }
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }
    if (req.user.role !== 'VENDOR') {
      return next(ApiError.forbidden('This action is available to vendors only.'));
    }
    if (!allowedTypes.includes(req.user.vendorType)) {
      return next(
        ApiError.forbidden(
          `Access denied. This action requires vendor type: ${allowedTypes.join(' or ')}.`,
          { code: 'VENDOR_TYPE_MISMATCH', required: allowedTypes, current: req.user.vendorType },
        ),
      );
    }
    return next();
  };
};
