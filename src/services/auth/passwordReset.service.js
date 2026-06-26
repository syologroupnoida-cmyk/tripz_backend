import jwt from 'jsonwebtoken';
import { hashPassword } from '../../utils/password.js';
import { hashOtp } from '../../utils/otp.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { signPasswordResetToken, verifyPasswordResetToken } from '../../utils/jwt.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as refreshRepo from '../../repositories/refreshToken.repository.js';
import * as otpRepo from '../../repositories/emailOtp.repository.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import { sendPasswordChangedNotice } from '../mail/index.js';
import { issueAndSendPasswordResetOtp, buildOtpMetadata } from './_helpers.js';

/**
 * isActive=false has two distinct meanings:
 *   1. Vendor just submitted KYC and is waiting for admin review.
 *      → harmless to let them reset their password; admin still gates login.
 *   2. Account permanently disabled / banned by admin.
 *      → block everything.
 *
 * This helper returns `true` only for case (1). Used to selectively allow
 * password reset for vendors-under-review while keeping deactivated accounts
 * fully locked.
 */
const isVendorAwaitingReview = async (user) => {
  if (!user || user.role !== 'VENDOR') return false;
  const profile = await kycRepo.findVendorProfile(user.id);
  return profile?.kycStatus === 'SUBMITTED';
};

export const requestPasswordReset = async ({ email }) => {
  const user = await userRepo.findUserByEmail(email);

  // Generic response — never reveal whether the email exists, the user has a
  // password (vs. Google-only), or the account is permanently deactivated.
  // OTP metadata is included even on the generic branch so the response
  // shape is identical (anti-enumeration).
  const messageText =
    'If an account exists for that email, a password reset code has been sent.';

  if (!user || !user.password) {
    return { message: messageText, otp: buildOtpMetadata() };
  }

  // isActive=false: allow ONLY if the vendor is in admin-review limbo.
  // Permanently deactivated accounts still get the silent generic response.
  if (!user.isActive) {
    const underReview = await isVendorAwaitingReview(user);
    if (!underReview) {
      return { message: messageText, otp: buildOtpMetadata() };
    }
  }

  const cooldownMs = env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
  const active = await otpRepo.findLatestActiveOtp({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
  });

  if (active) {
    const sinceCreated = Date.now() - new Date(active.createdAt).getTime();
    if (sinceCreated < cooldownMs) {
      const retryAfter = Math.ceil((cooldownMs - sinceCreated) / 1000);
      throw new ApiError(
        429,
        `Please wait ${retryAfter}s before requesting another reset code.`,
        { code: 'OTP_RESEND_COOLDOWN', retryAfter },
      );
    }
  }

  const otp = await issueAndSendPasswordResetOtp(user);
  return { message: messageText, otp };
};

/**
 * Step 2 of the 3-step reset flow — verify-only.
 *
 * Validates the OTP WITHOUT consuming it. Returns success if the OTP matches
 * so the frontend can transition the user to the "set new password" screen
 * with confidence. The OTP is still alive — actual consumption happens in
 * resetPassword() when the user submits the new password.
 *
 * Failed attempts still increment the attempts counter (rate limiting), and
 * an exhausted OTP is burned to force a re-request.
 */
export const verifyPasswordResetOtp = async ({ email, otp }) => {
  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid email or reset code.');
  }
  // Allow vendors awaiting admin review to verify the OTP. Truly deactivated
  // accounts still get blocked.
  if (!user.isActive && !(await isVendorAwaitingReview(user))) {
    throw ApiError.forbidden('This account has been deactivated.');
  }

  const active = await otpRepo.findLatestActiveOtp({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
  });

  if (!active) {
    throw ApiError.unauthorized('Reset code has expired. Please request a new one.');
  }

  if (active.attempts >= env.OTP_MAX_ATTEMPTS) {
    await otpRepo.consumeOtp(active.id);
    throw ApiError.unauthorized(
      'Too many incorrect attempts. Please request a new reset code.',
    );
  }

  if (hashOtp(otp) !== active.codeHash) {
    await otpRepo.incrementOtpAttempts(active.id);
    throw ApiError.unauthorized('Invalid reset code.');
  }

  // OTP correct — burn it now and issue a short-lived reset token. The
  // frontend stores the token (NOT the OTP) and uses it on /password/reset.
  // Token has its own 10-minute clock — a slow user on the password screen
  // can't be tripped up by the OTP's own expiry.
  await otpRepo.consumeOtp(active.id);
  const resetToken = signPasswordResetToken(user.id);
  return {
    otpVerified: true,
    resetToken,
    tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
};

/**
 * Step 3 of the 3-step reset flow — set the new password.
 *
 * Takes the resetToken issued at step 2 (NOT the OTP). The token carries the
 * user identity (sub) and a purpose claim. We verify the signature + expiry,
 * extract the user, and update the password.
 */
export const resetPassword = async ({ resetToken, newPassword }) => {
  let payload;
  try {
    payload = verifyPasswordResetToken(resetToken);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Reset session expired. Please request a new code.', {
        code: 'RESET_TOKEN_EXPIRED',
      });
    }
    throw new ApiError(401, 'Invalid reset session. Please request a new code.', {
      code: 'RESET_TOKEN_INVALID',
    });
  }

  const user = await userRepo.findUserById(payload.sub);
  if (!user) {
    throw ApiError.unauthorized('Invalid reset session.');
  }
  // Vendors awaiting admin review may also set a new password — they still
  // can't log in until admin approves.
  if (!user.isActive && !(await isVendorAwaitingReview(user))) {
    throw ApiError.forbidden('This account has been deactivated.');
  }

  // Update password.
  const newPasswordHash = await hashPassword(newPassword);
  await userRepo.updateUserPassword(user.id, newPasswordHash);

  // Kick out every existing session — if the attacker still holds a refresh
  // token, they're now locked out.
  await refreshRepo.revokeAllRefreshTokensForUser(user.id).catch((err) => {
    console.error('[auth] Failed to revoke refresh tokens after password reset:', err?.message);
  });

  // Fire-and-forget confirmation email.
  sendPasswordChangedNotice({
    to: user.email,
    firstName: user.firstName,
    when: new Date(),
  }).catch((err) =>
    console.error('[auth] Failed to send password-changed notice:', err?.message),
  );

  return { passwordReset: true };
};
