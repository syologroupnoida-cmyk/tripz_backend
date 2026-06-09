import { isProduction } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * httpOnly + Secure + SameSite=strict puts the refresh token out of reach of
 * page JS (XSS-safe) and limits cross-site auto-attach (CSRF-safe). `path` is
 * scoped to /api/v1/auth so the cookie isn't sent to unrelated routes.
 */
const baseCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api/v1/auth',
});

export const setRefreshCookie = (res, token, expiresAt) => {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    expires: expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
  });
};

export const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieOptions());
};

export const readRefreshToken = (req) => {
  return req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken || null;
};
