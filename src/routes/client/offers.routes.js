import { Router } from 'express';
import * as offerController from '../../controllers/offer.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { validateCouponSchema } from '../../validators/offer.validator.js';

const router = Router();

router.post('/validate', validateRequest(validateCouponSchema), offerController.validateCoupon);

export default router;
