import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const generateOtp = (length = env.OTP_LENGTH) => {
  // crypto.randomInt is unbiased — Math.random is not suitable for security codes.
  const max = 10 ** length;
  const code = crypto.randomInt(0, max).toString().padStart(length, '0');
  return code;
};

export const hashOtp = (code) => {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
};

export const otpExpiry = (minutes = env.OTP_TTL_MINUTES) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

export const constantTimeEquals = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};
