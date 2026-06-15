import { hashOtp } from '../../utils/otp.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as otpRepo from '../../repositories/emailOtp.repository.js';
import {
  sanitizeUser,
  issueAndSendVerificationOtp,
  buildOtpMetadata,
} from './_helpers.js';

export const verifyEmailWithOtp = async ({ email, otp }) => {
  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid email or code.');
  }
  if (user.emailVerifiedAt) {
    return { user: sanitizeUser(user), alreadyVerified: true };
  }

  const active = await otpRepo.findLatestActiveOtp({
    userId: user.id,
    purpose: 'EMAIL_VERIFICATION',
  });

  if (!active) {
    throw ApiError.unauthorized('Verification code has expired. Please request a new one.');
  }

  if (active.attempts >= env.OTP_MAX_ATTEMPTS) {
    // Burn the OTP so the user is forced to request a fresh one.
    await otpRepo.consumeOtp(active.id);
    throw ApiError.unauthorized(
      'Too many incorrect attempts. Please request a new verification code.',
    );
  }

  if (hashOtp(otp) !== active.codeHash) {
    await otpRepo.incrementOtpAttempts(active.id);
    throw ApiError.unauthorized('Invalid verification code.');
  }

  await otpRepo.consumeOtp(active.id);
  const updated = await userRepo.markEmailVerified(user.id);

  return { user: sanitizeUser(updated), alreadyVerified: false };
};

export const resendVerificationOtp = async ({ email }) => {
  const user = await userRepo.findUserByEmail(email);

  // Same-shape response regardless of existence to avoid email enumeration.
  // OTP metadata is included in both branches so the response structure is
  // identical for valid and invalid emails.
  const messageText =
    'If an account exists for that email, a verification code has been sent.';

  if (!user || user.emailVerifiedAt || !user.isActive) {
    return { message: messageText, otp: buildOtpMetadata() };
  }

  const cooldownMs = env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
  const active = await otpRepo.findLatestActiveOtp({
    userId: user.id,
    purpose: 'EMAIL_VERIFICATION',
  });

  if (active) {
    const sinceCreated = Date.now() - new Date(active.createdAt).getTime();
    if (sinceCreated < cooldownMs) {
      const retryAfter = Math.ceil((cooldownMs - sinceCreated) / 1000);
      throw new ApiError(
        429,
        `Please wait ${retryAfter}s before requesting another code.`,
        { code: 'OTP_RESEND_COOLDOWN', retryAfter },
      );
    }
  }

  const otp = await issueAndSendVerificationOtp(user);
  return { message: messageText, otp };
};
