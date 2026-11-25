import * as paymentService from '../services/payment/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const verifyPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.verifyCheckout({
    userId: req.user.id,
    orderId: req.body.razorpay_order_id,
    providerPaymentId: req.body.razorpay_payment_id,
    signature: req.body.razorpay_signature,
  });
  return sendSuccess(res, { message: 'Payment verified.', data });
});

export const getPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.getMyPayment({ userId: req.user.id, paymentId: req.params.id });
  return sendSuccess(res, { message: 'Payment retrieved.', data });
});

export const razorpayWebhook = asyncHandler(async (req, res) => {
  await paymentService.processWebhook({
    rawBody: req.body,
    signature: req.headers['x-razorpay-signature'],
    eventId: req.headers['x-razorpay-event-id'],
  });
  return res.status(200).json({ success: true });
});
