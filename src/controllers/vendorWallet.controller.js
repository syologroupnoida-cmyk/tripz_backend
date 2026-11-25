import * as walletService from '../services/vendorWallet/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createOrder as createPaymentOrder } from '../services/payment/index.js';
import { getActiveCreditPackage } from '../services/creditPackage/index.js';

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
  const creditPackage = await getActiveCreditPackage(req.body.creditPackageId);
  const data = await createPaymentOrder({
    userId: req.user.id,
    purpose: 'WALLET_TOP_UP',
    referenceId: creditPackage.id,
    amountInPaise: creditPackage.offerPriceInPaise,
    metadata: {
      creditPackageId: creditPackage.id,
      packageName: creditPackage.name,
      credits: creditPackage.credits,
      salePriceInPaise: creditPackage.salePriceInPaise,
      offerPriceInPaise: creditPackage.offerPriceInPaise,
    },
  });
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Wallet top-up payment created.',
    data: { ...data, creditPackage },
  });
});
