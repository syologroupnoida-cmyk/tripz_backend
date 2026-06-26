// Internal helpers shared across the auth service files. Not part of the
// public auth API — only siblings under services/auth/ should import from here.

import jwt from 'jsonwebtoken';
import { signAccessToken, signRefreshToken, hashToken } from '../../utils/jwt.js';
import { generateOtp, hashOtp, otpExpiry } from '../../utils/otp.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as refreshRepo from '../../repositories/refreshToken.repository.js';
import * as otpRepo from '../../repositories/emailOtp.repository.js';
import { sendVerificationOtp, sendPasswordResetOtp } from '../mail/index.js';

/**
 * OTP metadata block sent to the frontend whenever an OTP is dispatched.
 * Lets the UI render an accurate countdown timer and disable the resend
 * button for the right cooldown window without hardcoding env values.
 *
 * Includes metadata even on anti-enumeration "generic" responses so the
 * shape is identical whether or not the email actually corresponds to a
 * real account — an attacker can't probe existence by inspecting the
 * response structure.
 */
export const buildOtpMetadata = ({ createdAt = new Date() } = {}) => {
  const sentAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const expiresAt = new Date(sentAt.getTime() + env.OTP_TTL_MINUTES * 60 * 1000);
  return {
    ttlSeconds: env.OTP_TTL_MINUTES * 60,
    resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    sentAt: sentAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
};

/**
 * Maps a vendor's `kycStatus` to a frontend-friendly `nextStep` hint so the
 * UI can route the user to the right screen after login without duplicating
 * the mapping logic in every client.
 *
 *   NOT_SUBMITTED / IN_PROGRESS → COMPLETE_KYC   (start or resume KYC wizard)
 *   REJECTED                    → RESUBMIT_KYC   (fix + resubmit)
 *   SUBMITTED                   → AWAITING_APPROVAL  (rarely seen — login is
 *                                                    blocked in this state)
 *   APPROVED                    → DASHBOARD      (full access)
 */
export const deriveVendorNextStep = (kycStatus) => {
  switch (kycStatus) {
    case 'APPROVED':
      return 'DASHBOARD';
    case 'REJECTED':
      return 'RESUBMIT_KYC';
    case 'SUBMITTED':
      return 'AWAITING_APPROVAL';
    case 'IN_PROGRESS':
    case 'NOT_SUBMITTED':
    default:
      return 'COMPLETE_KYC';
  }
};

/**
 * Strip server-side fields (password, googleId, etc.) before sending the user
 * to the client.
 *
 * For vendors, an optional `vendorProfile` arg attaches the KYC status and a
 * `nextStep` hint so the frontend can decide where to land them post-login.
 * Non-vendors do not get this block.
 */
export const sanitizeUser = (user, { vendorProfile } = {}) => {
  const base = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    avatarUrl: user.avatarUrl ?? null,
    authProvider: user.authProvider ?? 'LOCAL',
    createdAt: user.createdAt,
  };

  if (user.role === 'VENDOR') {
    const kycStatus = vendorProfile?.kycStatus ?? 'NOT_SUBMITTED';
    base.vendorProfile = {
      kycStatus,
      nextStep: deriveVendorNextStep(kycStatus),
    };
  }

  return base;
};

export const buildAccessPayload = (user) => ({
  sub: user.id,
  email: user.email,
  role: user.role,
});

export const buildRefreshPayload = (user) => ({
  sub: user.id,
  role: user.role,
});

export const issueTokenPair = async (user) => {
  const accessToken = signAccessToken(buildAccessPayload(user));
  const { token: refreshToken } = signRefreshToken(buildRefreshPayload(user));

  const decoded = jwt.decode(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await refreshRepo.createRefreshToken({
    tokenHash: hashToken(refreshToken),
    userId: user.id,
    expiresAt,
  });

  return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
};

export const issueAndSendVerificationOtp = async (user) => {
  await otpRepo.invalidateActiveOtps({
    userId: user.id,
    purpose: 'EMAIL_VERIFICATION',
  });

  const code = generateOtp();
  const sentAt = new Date();
  await otpRepo.createEmailOtp({
    userId: user.id,
    codeHash: hashOtp(code),
    purpose: 'EMAIL_VERIFICATION',
    expiresAt: otpExpiry(),
  });

  try {
    await sendVerificationOtp({
      to: user.email,
      firstName: user.firstName,
      code,
    });
  } catch (error) {
    console.error('[auth] Failed to send verification OTP:', error?.message);
    throw ApiError.internal(
      'We could not send the verification email. Please try again in a moment.',
    );
  }

  return buildOtpMetadata({ createdAt: sentAt });
};

export const issueAndSendPasswordResetOtp = async (user) => {
  await otpRepo.invalidateActiveOtps({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
  });

  const code = generateOtp();
  const sentAt = new Date();
  await otpRepo.createEmailOtp({
    userId: user.id,
    codeHash: hashOtp(code),
    purpose: 'PASSWORD_RESET',
    expiresAt: otpExpiry(),
  });

  try {
    await sendPasswordResetOtp({
      to: user.email,
      firstName: user.firstName,
      code,
    });
  } catch (error) {
    console.error('[auth] Failed to send password reset OTP:', error?.message);
    throw ApiError.internal(
      'We could not send the reset email. Please try again in a moment.',
    );
  }

  return buildOtpMetadata({ createdAt: sentAt });
};

export const assertEmailAndPhoneAvailable = async ({ email, phone }) => {
  if (await userRepo.userExistsByEmail(email)) {
    throw ApiError.conflict('An account with this email already exists.');
  }
  if (await userRepo.userExistsByPhone(phone)) {
    throw ApiError.conflict('An account with this phone number already exists.');
  }
};
