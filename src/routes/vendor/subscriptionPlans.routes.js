import { Router } from 'express';
import * as subscriptionController from '../../controllers/subscription.controller.js';

// Vendor-facing plan catalog. Only isActive=true plans. VENDOR role.
// Role gate at routes/vendor/index.js. Mounted under /subscription-plans.

const router = Router();

// GET /api/v1/vendor/subscription-plans
// Returns active plans ordered cheapest → priciest so the UI can render
// Basic → Pro → Ultra top-to-bottom naturally.
router.get('/', subscriptionController.listActivePlansForVendor);

export default router;
