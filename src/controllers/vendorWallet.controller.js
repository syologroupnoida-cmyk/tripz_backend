import * as walletService from '../services/vendorWallet/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createOrder as createPaymentOrder } from '../services/payment/index.js';
import { env } from '../config/env.js';

export const getMyWallet = asyncHandler(async (req, res) => {
  const data = await walletService.getMyWallet(req.user.id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Wallet retrieved.',
    data,
  });
});

export const listMyTransactions = asyncHandler(async (req, res) => {
  const data = await walletService.listMyTransactions({
    vendorUserId: req.user.id,
    ...req.query,
  });
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Transactions retrieved.',
    data,
  });
});

export const createTopUp = asyncHandler(async (req, res) => {
  const data = await createPaymentOrder({
    userId: req.user.id,
    purpose: 'WALLET_TOP_UP',
    referenceId: `wallet:${req.user.id}:${Date.now()}`,
    amountInPaise: req.body.credits * env.WALLET_CREDIT_PRICE_IN_PAISE,
    metadata: { credits: req.body.credits },
  });
  return sendSuccess(res, { statusCode: 201, message: 'Wallet top-up payment created.', data });
});
