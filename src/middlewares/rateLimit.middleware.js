import { sendError } from '../utils/response.js';

// =============================================================================
//   Simple in-memory sliding-window rate limiter.
//
//   Enough for MVP where the API runs on a single node. Replace with Redis-
//   backed limiter (e.g. rate-limiter-flexible) before horizontal scaling.
//
//   Each middleware factory maintains its own Map keyed by whatever `getKey`
//   returns. Entries older than `windowMs` are pruned lazily on each hit.
// =============================================================================

const DEFAULT_KEY = (req) => req.ip;

/**
 * Build a rate-limit middleware.
 *
 * @param {Object} opts
 * @param {number} opts.windowMs   — rolling window size (ms)
 * @param {number} opts.max        — max hits per window per key
 * @param {(req)=>string|null} opts.getKey — key extractor. Return null/undefined
 *                                 to skip rate limiting for the request.
 * @param {string} [opts.message]  — message returned on limit hit
 * @param {string} [opts.code]     — error code returned in the details payload
 */
export const createRateLimit = ({
  windowMs,
  max,
  getKey = DEFAULT_KEY,
  message = 'Too many requests. Please try again later.',
  code = 'RATE_LIMITED',
}) => {
  const hits = new Map(); // key -> array of timestamps

  return (req, res, next) => {
    const key = getKey(req);
    if (!key) return next(); // no key → skip

    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= max) {
      const oldest = timestamps[0];
      const retryAfterMs = Math.max(0, oldest + windowMs - now);
      res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
      return sendError(res, {
        statusCode: 429,
        message,
        details: {
          code,
          limit: max,
          windowSeconds: Math.round(windowMs / 1000),
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        },
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return next();
  };
};

// -----------------------------------------------------------------------------
//   Lead-submit rate limit — spam gate for the public POST /leads endpoint.
//   5 inquiries per hour per (normalised) email. Falls back to IP when no
//   email is present in the payload.
// -----------------------------------------------------------------------------
export const submitLeadRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  getKey: (req) => {
    const email = req.body?.lead?.email;
    if (typeof email === 'string' && email.trim() !== '') {
      return `lead-email:${email.trim().toLowerCase()}`;
    }
    return `lead-ip:${req.ip}`;
  },
  message:
    'Too many inquiries from this email in the last hour. Please try again later.',
  code: 'LEAD_RATE_LIMIT',
});
