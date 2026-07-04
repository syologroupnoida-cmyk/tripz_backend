import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { optionalAuthenticateUser } from '../../middlewares/auth.middleware.js';
import { submitLeadRateLimit } from '../../middlewares/rateLimit.middleware.js';
import * as leadController from '../../controllers/lead.controller.js';
import { submitLeadSchema } from '../../validators/lead.validator.js';

const router = Router();

// POST /api/v1/leads  (public — anonymous form submissions allowed)
// Middleware order matters:
//   1. optionalAuthenticateUser  — decodes bearer token if present (link to
//                                  logged-in customer); missing/invalid = anon.
//   2. submitLeadRateLimit       — spam gate: 5 inquiries per hour per email
//                                  (falls back to IP when email is absent).
//   3. validateRequest           — Zod-validates the payload.
//   4. controller                — hands off to lead service (handles global,
//                                  admin-direct, and package-inquiry flavours).
router.post(
  '/',
  optionalAuthenticateUser,
  submitLeadRateLimit,
  validateRequest(submitLeadSchema),
  leadController.submitLead,
);

export default router;
