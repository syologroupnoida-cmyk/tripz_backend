import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { requireKycApproved } from '../../middlewares/kyc.middleware.js';
import * as marketplaceController from '../../controllers/marketplace.controller.js';
import { browseLeadsQuerySchema } from '../../validators/marketplace.validator.js';

const router = Router();

// All marketplace routes require an APPROVED KYC - unverified vendors
// can't browse or buy leads.
router.use(requireKycApproved);

router.get(
  '/leads',
  validateRequest(browseLeadsQuerySchema, 'query'),
  marketplaceController.browseLeads,
);

router.post('/leads/:id/unlock', marketplaceController.unlockLead);

export default router;
