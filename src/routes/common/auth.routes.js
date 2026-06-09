import { Router } from 'express';
import * as authController from '../../controllers/auth.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { authenticateUser } from '../../middlewares/auth.middleware.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  verifyEmailSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleLoginSchema,
} from '../../validators/auth.validator.js';

const router = Router();

router.post('/register', validateRequest(registerSchema), authController.register);
router.post('/login', validateRequest(loginSchema), authController.login);
router.post(
  '/google/login',
  validateRequest(googleLoginSchema),
  authController.googleLogin,
);
router.post('/refresh', validateRequest(refreshTokenSchema), authController.refresh);
router.post('/logout', validateRequest(logoutSchema), authController.logout);

router.post('/verify-email', validateRequest(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-otp', validateRequest(resendOtpSchema), authController.resendOtp);

router.post(
  '/password/forgot',
  validateRequest(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/password/reset',
  validateRequest(resetPasswordSchema),
  authController.resetPassword,
);

router.get('/me', authenticateUser, authController.me);

export default router;
