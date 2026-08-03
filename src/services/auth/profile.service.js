import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import * as refreshRepo from '../../repositories/refreshToken.repository.js';
import { sanitizeUser } from './_helpers.js';

// -----------------------------------------------------------------------------
// Update self profile (any authenticated role)
// -----------------------------------------------------------------------------
// Only touches User table fields the validator allows: firstName, lastName,
// phone, avatarUrl. Anything else is ignored.
//
// Returns the same sanitized shape as /auth/me so the frontend can drop this
// straight into its user state.
export const updateProfile = async ({ userId, data }) => {
  // Phone uniqueness pre-check — Prisma will still throw P2002 on race, but
  // pre-checking gives a friendlier error code + message.
  if (data.phone) {
    const taken = await userRepo.isPhoneTakenByAnother({ userId, phone: data.phone });
    if (taken) {
      throw ApiError.conflict('This phone number is already in use by another account.', {
        code: 'PHONE_ALREADY_TAKEN',
      });
    }
  }

  const updated = await userRepo.updateUserProfile(userId, data);

  // Vendors get the {kycStatus, nextStep} block like login/me so the frontend
  // can render consistent post-update state.
  const vendorProfile =
    updated.role === 'VENDOR' ? await kycRepo.findVendorKycStatus(userId) : null;

  return { user: sanitizeUser(updated, { vendorProfile }) };
};

// -----------------------------------------------------------------------------
// Change password (authenticated — requires current password)
// -----------------------------------------------------------------------------
// Distinct from /password/reset (OTP-based, unauthenticated). Because the user
// already has a session, we require the CURRENT password before allowing a new
// one — protects against a stolen session token locking out the owner.
//
// After a successful change we revoke ALL refresh tokens so any other session
// (mobile, other browser) is forced to log in again with the new password. The
// current tab keeps working via its still-valid short-lived access token.
export const changePassword = async ({ userId, currentPassword, newPassword }) => {
  const user = await userRepo.findUserByIdWithPassword(userId);
  if (!user) throw ApiError.notFound('User not found.');

  // Google-only accounts (no local password) can't change what they don't have.
  // They must set one first via the forgot-password / reset flow.
  if (!user.password) {
    throw new ApiError(400,
      'This account uses Google sign-in. Set a password via forgot-password first.',
      { code: 'PASSWORD_NOT_SET' },
    );
  }

  const matches = await comparePassword(currentPassword, user.password);
  if (!matches) {
    throw ApiError.unauthorized('Current password is incorrect.', {
      code: 'CURRENT_PASSWORD_INVALID',
    });
  }

  const newHash = await hashPassword(newPassword);
  await userRepo.updateUserPassword(userId, newHash);

  // Force re-login on other devices.
  await refreshRepo.revokeAllRefreshTokensForUser(userId).catch(() => {});

  return { message: 'Password changed successfully. Other sessions have been logged out.' };
};
