import prisma from '../config/db.js';

// Idempotent: returns the wallet, creating it with a zero balance if missing.
// Vendor signup should also call this so the row exists eagerly - but we
// keep it safe here so a missing wallet never crashes an unlock attempt.
export const ensureWallet = async (vendorUserId) => {
  return prisma.wallet.upsert({
    where: { vendorUserId },
    create: { vendorUserId },
    update: {},
    select: { vendorUserId: true, balanceCredits: true, updatedAt: true },
  });
};

export const getWallet = async (vendorUserId) => {
  return prisma.wallet.findUnique({
    where: { vendorUserId },
    select: { vendorUserId: true, balanceCredits: true, updatedAt: true },
  });
};
