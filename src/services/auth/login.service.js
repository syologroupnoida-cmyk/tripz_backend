import { comparePassword } from '../../utils/password.js';
import { ApiError } from '../../utils/ApiError.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import {
  sanitizeUser,
  issueTokenPair,
  issueAndSendVerificationOtp,
} from './_helpers.js';

/**
 * For a deactivated vendor, decide which error to return. Vendors who just
 * submitted KYC get a clear "under review" message; everyone else gets the
 * generic deactivation message.
 */
const buildDeactivationError = async (user) => {
  if (user.role === 'VENDOR') {
    const profile = await kycRepo.findVendorProfile(user.id);
    if (profile?.kycStatus === 'SUBMITTED') {
      return new ApiError(
        403,
        'Your application is under review. We will email you once your account is approved.',
        { code: 'ACCOUNT_UNDER_REVIEW', kycStatus: 'SUBMITTED' },
      );
    }
  }
  return new ApiError(
    403,
    'This account has been deactivated. Please contact support.',
    { code: 'ACCOUNT_DEACTIVATED' },
  );
};

export const loginUser = async ({ email, password }) => {
  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (!user.isActive) {
    throw await buildDeactivationError(user);
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

  // Vendors need vendorType + KYC status BEFORE issuing tokens — vendorType
  // gets embedded in the JWT so middleware can gate routes without a DB hit.
  const vendorProfile =
    user.role === 'VENDOR' ? await kycRepo.findVendorKycStatus(user.id) : null;

  const tokens = await issueTokenPair(user, { vendorProfile });

  return {
    user: sanitizeUser(user, { vendorProfile }),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt,
  };
};
