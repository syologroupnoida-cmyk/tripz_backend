import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ACCESS_OPTIONS = {
  expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  issuer: 'tripz-api',
  audience: 'tripz-clients',
};

const REFRESH_OPTIONS = {
  expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  issuer: 'tripz-api',
  audience: 'tripz-clients',
};

export const signAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, ACCESS_OPTIONS);
};

export const signRefreshToken = (payload) => {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, env.JWT_REFRESH_SECRET, REFRESH_OPTIONS);
  return { token, jti };
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: ACCESS_OPTIONS.issuer,
    audience: ACCESS_OPTIONS.audience,
  });
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: REFRESH_OPTIONS.issuer,
    audience: REFRESH_OPTIONS.audience,
  });
};

export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// -----------------------------------------------------------------------------
//   Password-reset token — short-lived (10 min), single purpose.
//
// Issued by /password/verify-otp once the OTP has been validated. The user
// presents this token (NOT the OTP) on /password/reset to actually set their
// new password. Decoupling these into two clocks means a slow user on the
// "type new password" screen doesn't fail when the OTP expires.
//
// Purpose claim prevents token confusion attacks — an attacker can't use a
// reset token where an access token is expected and vice versa.
// -----------------------------------------------------------------------------

const RESET_TOKEN_OPTIONS = {
  expiresIn: '10m',
  issuer: 'tripz-api',
  audience: 'tripz-clients',
};

const RESET_TOKEN_PURPOSE = 'PASSWORD_RESET';

export const signPasswordResetToken = (userId) => {
  return jwt.sign(
    { sub: userId, purpose: RESET_TOKEN_PURPOSE },
    env.JWT_RESET_SECRET,
    RESET_TOKEN_OPTIONS,
  );
};

export const verifyPasswordResetToken = (token) => {
  const payload = jwt.verify(token, env.JWT_RESET_SECRET, {
    issuer: RESET_TOKEN_OPTIONS.issuer,
    audience: RESET_TOKEN_OPTIONS.audience,
  });
  if (payload.purpose !== RESET_TOKEN_PURPOSE) {
    throw new jwt.JsonWebTokenError('Token purpose mismatch');
  }
  return payload;
};
