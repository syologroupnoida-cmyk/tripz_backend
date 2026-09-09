import { Router } from 'express';
import * as offerController from '../../controllers/offer.controller.js';
import { uploadOfferCsv } from '../../middlewares/csvUpload.middleware.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { createOfferSchema, listOffersQuerySchema, updateOfferSchema } from '../../validators/offer.validator.js';

const router = Router();

router.post('/import', uploadOfferCsv, offerController.importOffersCsv);
router.get('/', validateRequest(listOffersQuerySchema, 'query'), offerController.listOffersAdmin);
router.post('/', validateRequest(createOfferSchema), offerController.createOffer);
router.get('/:id', offerController.getOfferAdmin);
router.patch('/:id', validateRequest(updateOfferSchema), offerController.updateOffer);
router.delete('/:id', offerController.deleteOffer);
router.post('/:id/activate', offerController.activateOffer);
router.post('/:id/pause', offerController.pauseOffer);

export default router;
