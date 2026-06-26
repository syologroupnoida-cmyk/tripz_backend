import prisma from '../config/db.js';

const WALLET_SELECT = {
  vendorUserId: true,
  balanceCredits: true,
  createdAt: true,
  updatedAt: true,
};

const TRANSACTION_SELECT = {
  id: true,
  type: true,
  amount: true,
  balanceAfter: true,
  referenceType: true,
  referenceId: true,
  notes: true,
  createdAt: true,
};

// Idempotent: returns the wallet, creating it with a zero balance if missing.
// Vendor signup should also call this so the row exists eagerly - but we
// keep it safe here so a missing wallet never crashes an unlock attempt.
export const ensureWallet = async (vendorUserId) => {
  return prisma.wallet.upsert({
    where: { vendorUserId },
    create: { vendorUserId },
    update: {},
    select: WALLET_SELECT,
  });
};

export const getWallet = async (vendorUserId) => {
  return prisma.wallet.findUnique({
    where: { vendorUserId },
    select: WALLET_SELECT,
  });
};

/**
 * Vendor's own wallet view — current balance + last N transactions in one call.
 * Used by GET /vendor/wallet for the dashboard.
 */
export const getWalletWithRecentTransactions = async (vendorUserId, limit = 10) => {
  const [wallet, transactions] = await Promise.all([
    prisma.wallet.upsert({
      where: { vendorUserId },
      create: { vendorUserId },
      update: {},
      select: WALLET_SELECT,
    }),
    prisma.walletTransaction.findMany({
      where: { vendorUserId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: TRANSACTION_SELECT,
    }),
  ]);
  return { wallet, transactions };
};

/**
 * Paginated full transaction history. Used by GET /vendor/wallet/transactions.
 * Optional `type` filter narrows to just debits / top-ups / etc.
 */
export const listVendorTransactions = async ({ vendorUserId, type, take, skip }) => {
  const where = { vendorUserId };
  if (type) where.type = type;

  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: TRANSACTION_SELECT,
    }),
    prisma.walletTransaction.count({ where }),
  ]);
  return { items, total };
};
