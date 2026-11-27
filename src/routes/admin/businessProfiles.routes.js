import { Router } from 'express';
import * as controller from '../../controllers/businessProfile.controller.js';
import { uploadCsv } from '../../middlewares/csvUpload.middleware.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import {
  listBusinessProfilesQuerySchema,
  updateBusinessProfileSchema,
} from '../../validators/businessProfile.validator.js';

const router = Router();

router.post('/import', uploadCsv, controller.importCsv);
router.get('/', validateRequest(listBusinessProfilesQuerySchema, 'query'), controller.listAdmin);
router.get('/:id', controller.getAdmin);
router.patch('/:id', validateRequest(updateBusinessProfileSchema), controller.update);
router.delete('/:id', controller.remove);

export default router;
