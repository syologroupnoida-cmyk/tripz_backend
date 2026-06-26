// =============================================================================
//   Vendor Wallet — vendor's own view into their credit balance + history
// =============================================================================
//
// The repo's "ensure" + "list" pattern means a brand-new vendor (no wallet yet)
// can hit GET /vendor/wallet and the row is lazily created with 0 credits.
// =============================================================================

import * as walletRepo from '../../repositories/wallet.repository.js';

export const getMyWallet = async (vendorUserId) => {
  const { wallet, transactions } = await walletRepo.getWalletWithRecentTransactions(
    vendorUserId,
    10,
  );

  return {
    balanceCredits: wallet.balanceCredits,
    walletCreatedAt: wallet.createdAt,
    walletUpdatedAt: wallet.updatedAt,
    recentTransactions: transactions,
  };
};

export const listMyTransactions = async ({ vendorUserId, type, take, skip }) => {
  const { items, total } = await walletRepo.listVendorTransactions({
    vendorUserId,
    type,
    take,
    skip,
  });
  return { items, total, take, skip };
};
