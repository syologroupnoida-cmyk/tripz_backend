import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../../utils/jwt.js';
import { ApiError } from '../../utils/ApiError.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as refreshRepo from '../../repositories/refreshToken.repository.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import {
  sanitizeUser,
  buildAccessPayload,
  buildRefreshPayload,
} from './_helpers.js';

export const refreshTokens = async (incomingRefreshToken) => {
  let payload;
  try {
    payload = verifyRefreshToken(incomingRefreshToken);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Refresh token has expired. Please log in again.');
    }
    throw ApiError.unauthorized('Invalid refresh token.');
  }

  const tokenHash = hashToken(incomingRefreshToken);
  const stored = await refreshRepo.findRefreshTokenByHash(tokenHash);

  if (!stored) {
    // Token signature is valid but not in DB — likely already rotated and reused.
    // Treat as a possible replay attack: revoke all tokens for this user.
    if (payload?.sub) {
      await refreshRepo.revokeAllRefreshTokensForUser(payload.sub).catch(() => {});
    }
    throw ApiError.unauthorized('Refresh token is no longer valid. Please log in again.');
  }

  if (stored.isRevoked) {
    await refreshRepo.revokeAllRefreshTokensForUser(stored.userId).catch(() => {});
    throw ApiError.unauthorized('Refresh token has been revoked. Please log in again.');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('Refresh token has expired. Please log in again.');
  }

  const user = await userRepo.findUserById(stored.userId);
  if (!user) {
    throw ApiError.unauthorized('User no longer exists.');
  }
  if (!user.isActive) {
    // Surface the same "under review" message vendors see on login, so the
    // frontend can route them to the right screen instead of treating it as
    // a generic auth error.
    if (user.role === 'VENDOR') {
      const profile = await kycRepo.findVendorProfile(user.id);
      if (profile?.kycStatus === 'SUBMITTED') {
        throw new ApiError(
          403,
          'Your application is under review. We will email you once your account is approved.',
          { code: 'ACCOUNT_UNDER_REVIEW', kycStatus: 'SUBMITTED' },
        );
      }
    }
    throw new ApiError(
      403,
      'This account has been deactivated. Please contact support.',
      { code: 'ACCOUNT_DEACTIVATED' },
    );
  }

  // For vendors, fetch vendorType from VendorProfile so it lands in the new
  // access token — otherwise requireVendorType middleware sees undefined and
  // fails all vendor-type-gated routes after every refresh.
  const vendorProfile =
    user.role === 'VENDOR' ? await kycRepo.findVendorKycStatus(user.id) : null;

  const payloadUser =
    user.role === 'VENDOR'
      ? { ...user, vendorType: vendorProfile?.vendorType ?? 'TRAVEL_AGENT' }
      : user;

  const newAccessToken = signAccessToken(buildAccessPayload(payloadUser));
  const { token: newRefreshToken } = signRefreshToken(buildRefreshPayload(payloadUser));
  const decoded = jwt.decode(newRefreshToken);
  const newExpiresAt = new Date(decoded.exp * 1000);

  await refreshRepo.rotateRefreshToken({
    oldTokenId: stored.id,
    newTokenHash: hashToken(newRefreshToken),
    userId: user.id,
    expiresAt: newExpiresAt,
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    refreshExpiresAt: newExpiresAt,
    user: sanitizeUser(user),
  };
};

export const logoutUser = async (incomingRefreshToken) => {
  const tokenHash = hashToken(incomingRefreshToken);
  const stored = await refreshRepo.findRefreshTokenByHash(tokenHash);

  // Idempotent: missing / already-revoked tokens still return success.
  if (!stored || stored.isRevoked) {
    return { revoked: false };
  }

  await refreshRepo.revokeRefreshTokenById(stored.id);
  return { revoked: true };
};
