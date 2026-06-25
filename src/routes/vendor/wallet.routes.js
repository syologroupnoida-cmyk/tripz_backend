import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as walletController from '../../controllers/vendorWallet.controller.js';
import { listTransactionsQuerySchema } from '../../validators/vendorWallet.validator.js';

// Vendor's own wallet view. Role gate (VENDOR) is applied at
// routes/vendor/index.js. Mounted under /wallet.

const router = Router();

// GET /api/v1/vendor/wallet
// Quick view — balance + last 10 transactions in one call (for dashboard widget).
router.get('/', walletController.getMyWallet);

// GET /api/v1/vendor/wallet/transactions?type=DEBIT_LEAD_UNLOCK&page=0&size=20
// Full paginated history with optional type filter (for full ledger view).
router.get(
  '/transactions',
  validateRequest(listTransactionsQuerySchema, 'query'),
  walletController.listMyTransactions,
);

export default router;
