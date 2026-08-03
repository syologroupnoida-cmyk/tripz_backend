// Barrel for the auth service. Controllers can either import the whole API via
//   import * as authService from '../services/auth/index.js'
// or pick a specific sub-module directly:
//   import * as loginService from '../services/auth/login.service.js'
//
// Helpers in _helpers.js are intentionally NOT re-exported — they're private
// to this folder.

export { registerCustomer, registerAgent } from './registration.service.js';
export { loginUser } from './login.service.js';
export { loginWithGoogle } from './googleLogin.service.js';
export { verifyEmailWithOtp, resendVerificationOtp } from './emailVerification.service.js';
export {
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword,
} from './passwordReset.service.js';
export { refreshTokens, logoutUser } from './tokens.service.js';
export { updateProfile, changePassword } from './profile.service.js';
