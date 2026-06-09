import { comparePassword } from '../../utils/password.js';
import { ApiError } from '../../utils/ApiError.js';
import * as userRepo from '../../repositories/user.repository.js';
import {
  sanitizeUser,
  issueTokenPair,
  issueAndSendVerificationOtp,
} from './_helpers.js';

export const loginUser = async ({ email, password }) => {
  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated.');
  }

  const passwordMatches = await comparePassword(password, user.password);
  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (!user.emailVerifiedAt) {
    // Auto-send a fresh OTP so the user can complete verification right away.
    await issueAndSendVerificationOtp(user);
    throw new ApiError(
      403,
      'Email not verified. We have sent a new verification code to your inbox.',
      { code: 'EMAIL_NOT_VERIFIED', email: user.email },
    );
  }

  const tokens = await issueTokenPair(user);

  return {
    user: sanitizeUser(user),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt,
  };
};
