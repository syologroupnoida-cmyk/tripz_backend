import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { optionalAuthenticateUser } from '../../middlewares/auth.middleware.js';
import * as leadController from '../../controllers/lead.controller.js';
import { submitLeadSchema } from '../../validators/lead.validator.js';

const router = Router();

// POST /api/v1/leads  (public — anonymous form submissions allowed)
// `optionalAuthenticateUser` decodes the bearer token *if* present, so the
// lead is linked to the logged-in customer; missing/invalid token = anonymous.
router.post(
  '/',
  optionalAuthenticateUser,
  validateRequest(submitLeadSchema),
  leadController.submitLead,
);

export default router;
