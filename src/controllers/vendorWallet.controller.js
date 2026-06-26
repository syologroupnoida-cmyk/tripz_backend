import * as walletService from '../services/vendorWallet/index.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
