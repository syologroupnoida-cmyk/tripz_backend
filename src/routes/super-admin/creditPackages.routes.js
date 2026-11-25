import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as controller from '../../controllers/creditPackage.controller.js';
import {
  createCreditPackageSchema, updateCreditPackageSchema, listCreditPackagesSchema,
} from '../../validators/creditPackage.validator.js';

const router = Router();
router.post('/', validateRequest(createCreditPackageSchema), controller.create);
router.get('/', validateRequest(listCreditPackagesSchema, 'query'), controller.listAdmin);
router.get('/:id', controller.get);
router.patch('/:id', validateRequest(updateCreditPackageSchema), controller.update);
router.delete('/:id', controller.remove);
export default router;
