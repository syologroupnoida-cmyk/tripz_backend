import { Router } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as kycController from '../../controllers/vendorKyc.controller.js';
import {
  submitKycSchema,
  verifyPanSchema,
  verifyGstinSchema,
  verifyCinSchema,
  aadhaarInitiateSchema,
  aadhaarCompleteSchema,
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
// GSTIN + CIN: format-only validation (no third-party API call, no credits used).
// Admin manually verifies the uploaded certificate during KYC review.
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

// ---- Aadhaar — DigiLocker-backed verification ----
// `initiate` returns a DigiLocker SDK URL; the frontend opens it. After the
// user finishes verification on DigiLocker (UIDAI OTP happens there), they
// are redirected back to the Tripz frontend callback page which fires
// `complete` to pull the verified Aadhaar data from Surepass.
router.post(
  '/kyc/verify/aadhaar/initiate',
  validateRequest(aadhaarInitiateSchema),
  kycController.initiateAadhaarVerification,
);
router.post(
  '/kyc/verify/aadhaar/complete',
  validateRequest(aadhaarCompleteSchema),
  kycController.completeAadhaarVerification,
);

export default router;
