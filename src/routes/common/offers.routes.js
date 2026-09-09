import { Router } from 'express';
import * as offerController from '../../controllers/offer.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { publicOffersQuerySchema } from '../../validators/offer.validator.js';

const router = Router();

router.get('/', validateRequest(publicOffersQuerySchema, 'query'), offerController.listOffersPublic);

export default router;
