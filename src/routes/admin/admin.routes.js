import { Router } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as kycController from '../../controllers/vendorKyc.controller.js';
import {
  listKycQuerySchema,
  rejectKycSchema,
} from '../../validators/vendorKyc.validator.js';

const router = Router();

router.get('/ping', (req, res) =>
  sendSuccess(res, {
    message: 'Admin panel reachable.',
    data: { user: req.user },
  }),
);

// --- Vendor KYC review ---
router.get(
  '/vendor-kyc',
  validateRequest(listKycQuerySchema, 'query'),
  kycController.listKycForAdmin,
);

router.post('/vendor-kyc/:userId/approve', kycController.approveVendorKyc);

router.post(
  '/vendor-kyc/:userId/reject',
  validateRequest(rejectKycSchema),
  kycController.rejectVendorKyc,
);

export default router;
