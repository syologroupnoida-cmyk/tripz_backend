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
