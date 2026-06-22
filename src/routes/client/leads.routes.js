import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as clientLeadsController from '../../controllers/clientLeads.controller.js';
import { listMyLeadsQuerySchema } from '../../validators/clientLeads.validator.js';

// Customer's own leads — auth + CLIENT role already gated at routes/client/index.js.

const router = Router();

// GET /api/v1/client/leads
router.get(
  '/',
  validateRequest(listMyLeadsQuerySchema, 'query'),
  clientLeadsController.listMyLeads,
);

export default router;
