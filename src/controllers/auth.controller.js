import * as authService from '../services/auth/index.js';
import { sendSuccess } from '../utils/response.js';
import { sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { findUserById } from '../repositories/user.repository.js';
import { findVendorKycStatus } from '../repositories/vendorKyc.repository.js';
import { deriveVendorNextStep } from '../services/auth/_helpers.js';
import { ApiError } from '../utils/ApiError.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshToken,
} from '../utils/cookies.js';

export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, password, role, vendorType } = req.body;
  const args = { firstName, lastName, email, phone, password };

  const result =
    role === 'VENDOR'
      ? await authService.registerAgent({ ...args, vendorType })
      : await authService.registerCustomer(args);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Account registered. Please verify your email to continue.',
    data: result,
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.loginUser({ email, password });

  // Web clients use the httpOnly cookie (XSS-safe). Mobile clients ignore it
  // and read refreshToken from the JSON body. One backend, two delivery modes.
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Login successful.',
    data: result,
  });
});

export const googleLogin = asyncHandler(async (req, res) => {
  // Only `token`, `role`, and `vendorType` are read — any other fields the
  // frontend ships (email, name, googleId, picture) are intentionally ignored
  // because they're unverified. Identity comes from the verified token only.
  // `vendorType` is only used when creating a brand-new VENDOR account.
  const { token, role, vendorType } = req.body;
  const result = await authService.loginWithGoogle({ token, role, vendorType });

  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

  return sendSuccess(res, {
    statusCode: result.isNewAccount ? 201 : 200,
    message: result.isNewAccount
      ? 'Account created and signed in with Google.'
      : 'Signed in with Google.',
    data: result,
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const incoming = readRefreshToken(req);
  if (!incoming) {
    return sendError(res, {
      statusCode: 400,
      message: 'Refresh token is required (via httpOnly cookie or request body).',
    });
  }

  const result = await authService.refreshTokens(incoming);

  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Tokens refreshed successfully.',
    data: result,
  });
});

export const logout = asyncHandler(async (req, res) => {
  const incoming = readRefreshToken(req);

  // Idempotent: missing token still clears the cookie and returns success.
  let revoked = false;
  if (incoming) {
    const result = await authService.logoutUser(incoming);
    revoked = result.revoked;
  }

  clearRefreshCookie(res);

  return sendSuccess(res, {
    statusCode: 200,
    message: revoked ? 'Logged out successfully.' : 'Already logged out.',
    data: null,
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const result = await authService.verifyEmailWithOtp({ email, otp });

  // Note: no tokens issued here. After verification the user must call /login
  // explicitly — verification is identity confirmation, not session creation.
  return sendSuccess(res, {
    statusCode: 200,
    message: result.alreadyVerified
      ? 'Email is already verified.'
      : 'Email verified successfully. Please log in to continue.',
    data: result,
  });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.resendVerificationOtp({ email });

  return sendSuccess(res, {
    statusCode: 200,
    message: result.message,
    data: { otp: result.otp },
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.requestPasswordReset({ email });

  return sendSuccess(res, {
    statusCode: 200,
    message: result.message,
    data: { otp: result.otp },
  });
});

export const verifyResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const result = await authService.verifyPasswordResetOtp({ email, otp });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'OTP verified. You can now set a new password.',
    data: result,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  await authService.resetPassword({ resetToken, newPassword });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Password reset successfully. Please log in with your new password.',
    data: null,
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await findUserById(req.user.id);
  if (!user) {
    throw ApiError.notFound('User profile not found.');
  }

  // For vendors, attach vendorType + KYC status + nextStep so the frontend can
  // mirror the same routing logic post-login when the user refreshes the page.
  if (user.role === 'VENDOR') {
    const vendorProfile = await findVendorKycStatus(user.id);
    const kycStatus = vendorProfile?.kycStatus ?? 'NOT_SUBMITTED';
    const vendorType = vendorProfile?.vendorType ?? 'TRAVEL_AGENT';
    user.vendorType = vendorType;
    user.vendorProfile = {
      vendorType,
      kycStatus,
      nextStep: deriveVendorNextStep(kycStatus),
    };
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Profile retrieved.',
    data: { user },
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const result = await authService.updateProfile({
    userId: req.user.id,
    data: req.body,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Profile updated.',
    data: result,
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword({
    userId: req.user.id,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: result.message,
    data: null,
  });
});
