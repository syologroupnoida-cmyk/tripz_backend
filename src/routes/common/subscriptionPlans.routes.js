import { Router } from 'express';
import * as subscriptionController from '../../controllers/subscription.controller.js';

// Public pricing-page catalog. NO authentication — anyone browsing the site
// can see the plans before signing up. Same data as `/vendor/subscription-plans`
// (only isActive + non-deleted plans), just served without a role gate.
//
// Mounted under /subscription-plans by common/index.js.

const router = Router();

// GET /api/v1/subscription-plans
router.get('/', subscriptionController.listActivePlansForVendor);

export default router;
