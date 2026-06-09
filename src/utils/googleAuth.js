import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

// One client instance, reused across requests. The library handles JWKS
// caching internally so we don't refetch Google's public keys per call.
const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

/**
 * Verifies a Google ID token (the JWT a Google Sign-In popup hands to the
 * frontend) and returns the trusted claims. Throws ApiError.unauthorized on
 * any failure — signature, audience mismatch, expired, etc.
 *
 * ⚠️ Only fields from THIS return value are safe to act on. Anything else
 *    the frontend ships is unverified user input.
 */
export const verifyGoogleIdToken = async (idToken) => {
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
  } catch (error) {
    throw ApiError.unauthorized('Invalid Google token.');
  }

  const payload = ticket.getPayload();
  if (!payload) {
    throw ApiError.unauthorized('Invalid Google token payload.');
  }

  // email_verified must be true — Google can return unverified emails for
  // some account types (rare, but possible). Treat unverified as a hard fail.
  if (!payload.email_verified) {
    throw ApiError.unauthorized('Your Google account email is not verified.');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    firstName: payload.given_name || payload.name?.split(' ')[0] || 'Google',
    lastName: payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'User',
    avatarUrl: payload.picture ?? null,
    emailVerified: true,
  };
};
