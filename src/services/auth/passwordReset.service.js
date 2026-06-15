import { hashPassword } from '../../utils/password.js';
import { hashOtp } from '../../utils/otp.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as refreshRepo from '../../repositories/refreshToken.repository.js';
import * as otpRepo from '../../repositories/emailOtp.repository.js';
import { sendPasswordChangedNotice } from '../mail/index.js';
import { issueAndSendPasswordResetOtp, buildOtpMetadata } from './_helpers.js';

export const requestPasswordReset = async ({ email }) => {
  const user = await userRepo.findUserByEmail(email);

  // Generic response — never reveal whether the email exists, the user has a
  // password (vs. Google-only), or the account is active. OTP metadata is
  // included even on the generic branch so the response shape is identical.
  const messageText =
    'If an account exists for that email, a password reset code has been sent.';

  if (!user || !user.isActive || !user.password) {
    return { message: messageText, otp: buildOtpMetadata() };
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

export const resetPassword = async ({ email, otp, newPassword }) => {
  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid email or reset code.');
  }
  if (!user.isActive) {
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

  // OTP verified — finalize the reset.
  const newPasswordHash = await hashPassword(newPassword);
  await userRepo.updateUserPassword(user.id, newPasswordHash);
  await otpRepo.consumeOtp(active.id);

  // Kick out every existing session — if the attacker still holds a refresh
  // token, they're now locked out.
  await refreshRepo.revokeAllRefreshTokensForUser(user.id).catch((err) => {
    console.error('[auth] Failed to revoke refresh tokens after password reset:', err?.message);
  });

  // Fire-and-forget confirmation email. If SMTP fails the reset still succeeds —
  // the user already proved control of the inbox via the OTP.
  sendPasswordChangedNotice({
    to: user.email,
    firstName: user.firstName,
    when: new Date(),
  }).catch((err) =>
    console.error('[auth] Failed to send password-changed notice:', err?.message),
  );

  return { passwordReset: true };
};
