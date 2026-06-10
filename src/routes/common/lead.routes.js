import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as leadController from '../../controllers/lead.controller.js';
import { submitLeadSchema } from '../../validators/lead.validator.js';

const router = Router();

// POST /api/v1/leads  (public - anonymous form submissions allowed)
router.post('/', validateRequest(submitLeadSchema), leadController.submitLead);

export default router;
