import { Router } from 'express';
import { authenticateUser } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { verifyPaymentSchema } from '../../validators/payment.validator.js';
import * as paymentController from '../../controllers/payment.controller.js';

const router = Router();
router.use(authenticateUser);
router.post('/verify', validateRequest(verifyPaymentSchema), paymentController.verifyPayment);
router.get('/:id', paymentController.getPayment);
export default router;
