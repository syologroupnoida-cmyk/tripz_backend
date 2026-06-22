import { ApiError } from '../../utils/ApiError.js';
import { verifyGoogleIdToken } from '../../utils/googleAuth.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as leadRepo from '../../repositories/lead.repository.js';
import { SELF_SIGNUP_ROLES } from '../../validators/auth.validator.js';
import { sanitizeUser, issueTokenPair } from './_helpers.js';

const buildLoginResult = (user, isNewAccount) => ({
  user: sanitizeUser(user),
  isNewAccount,
});

const createUserForRole = async ({ role, identity }) => {
  if (role === 'VENDOR') {
    return userRepo.createAgentViaGoogle(identity);
  }
  return userRepo.createCustomerViaGoogle(identity);
};

/**
 * Single entry point for all Google sign-in flows.
 *
 * 1. Verify the ID token (signature, audience, issuer, expiry, email_verified).
 * 2. Returning user (matched by googleId) → log in.
 * 3. Existing email (matched by email)    → link, log in.
 * 4. Brand-new email                       → create + log in (needs `role`).
 *
 * Mirrors the shape of loginUser so the controller treats both flows identically.
 */
export const loginWithGoogle = async ({ token, role }) => {
  const identity = await verifyGoogleIdToken(token);

  // 1) Returning Google user
  let user = await userRepo.findUserByGoogleId(identity.googleId);
  let isNewAccount = false;

  // 2) Existing email account, first time signing in with Google → auto-link
  if (!user) {
    const byEmail = await userRepo.findUserByEmail(identity.email);
    if (byEmail) {
      if (!byEmail.isActive) {
        throw ApiError.forbidden('This account has been deactivated.');
      }
      user = await userRepo.linkGoogleAccount({
        userId: byEmail.id,
        googleId: identity.googleId,
        avatarUrl: identity.avatarUrl,
        hasPassword: Boolean(byEmail.password),
      });
    }
  }

  // 3) Brand-new account
  if (!user) {
    if (!role) {
      throw ApiError.badRequest(
        'A `role` is required to create a new account. Pass role: "CLIENT" or "VENDOR".',
        { code: 'ROLE_REQUIRED' },
      );
    }
    if (!SELF_SIGNUP_ROLES.includes(role)) {
      throw ApiError.badRequest('Role must be either "CLIENT" or "VENDOR".');
    }

    user = await createUserForRole({
      role,
      identity: {
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        googleId: identity.googleId,
        avatarUrl: identity.avatarUrl,
      },
    });
    isNewAccount = true;

    // Auto-link any anonymous leads submitted with this Google email — only
    // for new CLIENT signups (vendors don't have a customer-leads dashboard).
    if (role === 'CLIENT') {
      await leadRepo.claimLeadsForEmail({
        userId: user.id,
        email: identity.email,
      });
    }
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated.');
  }

  const tokens = await issueTokenPair(user);

  return {
    ...buildLoginResult(user, isNewAccount),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt,
  };
};
