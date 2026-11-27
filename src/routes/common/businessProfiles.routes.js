import { Router } from 'express';
import * as controller from '../../controllers/businessProfile.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { listBusinessProfilesQuerySchema } from '../../validators/businessProfile.validator.js';

const router = Router();

router.get('/', validateRequest(listBusinessProfilesQuerySchema, 'query'), controller.listPublic);
router.get('/:id', controller.getPublic);

export default router;
