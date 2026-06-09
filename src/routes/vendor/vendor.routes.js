import { Router } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as kycController from '../../controllers/vendorKyc.controller.js';
import {
  submitKycSchema,
  verifyPanSchema,
  verifyGstinSchema,
  verifyCinSchema,
  aadhaarSendOtpSchema,
  aadhaarConfirmOtpSchema,
} from '../../validators/vendorKyc.validator.js';

const router = Router();

router.get('/ping', (req, res) =>
  sendSuccess(res, {
    message: 'Vendor panel reachable.',
    data: { user: req.user },
  }),
);

// ---- KYC status + final submission ----
router.get('/kyc', kycController.getMyKycStatus);
router.post('/kyc', validateRequest(submitKycSchema), kycController.submitMyKyc);

// ---- Per-document verification (real-time during the wizard) ----
router.post(
  '/kyc/verify/pan',
  validateRequest(verifyPanSchema),
  kycController.verifyPan,
);
router.post(
  '/kyc/verify/gstin',
  validateRequest(verifyGstinSchema),
  kycController.verifyGstin,
);
router.post(
  '/kyc/verify/cin',
  validateRequest(verifyCinSchema),
  kycController.verifyCin,
);

// ---- Aadhaar two-step OTP flow ----
router.post(
  '/kyc/verify/aadhaar/send-otp',
  validateRequest(aadhaarSendOtpSchema),
  kycController.sendAadhaarOtp,
);
router.post(
  '/kyc/verify/aadhaar/confirm-otp',
  validateRequest(aadhaarConfirmOtpSchema),
  kycController.confirmAadhaarOtp,
);

export default router;
