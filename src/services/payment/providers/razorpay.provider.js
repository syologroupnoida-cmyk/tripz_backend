import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';

const requireCredentials = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(503, 'Payment gateway is not configured.', {
      code: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
    });
  }
};

const request = async (path, { method = 'POST', body } = {}) => {
  requireCredentials();
  const authorization = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch(`${env.RAZORPAY_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, payload?.error?.description ?? 'Payment gateway request failed.', {
      code: 'PAYMENT_GATEWAY_ERROR', providerCode: payload?.error?.code,
    });
  }
  return payload;
};

export const createOrder = ({ amountInPaise, currency, receipt, notes }) =>
  request('/orders', { body: { amount: amountInPaise, currency, receipt: receipt.slice(0, 40), notes } });

export const refundPayment = ({ providerPaymentId, amountInPaise, notes }) =>
  request(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
    body: { amount: amountInPaise, notes },
  });

const safeEqualHex = (expected, actual = '') => {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(String(actual), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export const verifyCheckoutSignature = ({ orderId, paymentId, signature }) => {
  requireCredentials();
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
};

export const verifyWebhookSignature = ({ rawBody, signature }) => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(expected, signature);
};

export const publicKeyId = () => env.RAZORPAY_KEY_ID ?? null;
