import { z } from 'zod';

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

export const walletTopUpSchema = z.object({
  credits: z.number().int().min(1).max(1000000),
}).strict();
