import * as leadRepo from '../../repositories/lead.repository.js';
import * as walletRepo from '../../repositories/wallet.repository.js';
import * as marketplaceRepo from '../../repositories/marketplace.repository.js';
import { maskEmail, maskPhone } from './_masking.js';

const toTeaserView = (lead, isUnlocked) => {
  if (isUnlocked) {
    return { ...lead, isUnlocked: true };
  }
  return {
    ...lead,
    email: maskEmail(lead.email),
    phone: maskPhone(lead.phone),
    isUnlocked: false,
  };
};

export const browseLeads = async ({ vendorUserId, query }) => {
  const { items, total } = await leadRepo.listActiveLeads(query);

  const unlockedIds = await leadRepo.findVendorAssignmentLeadIds({
    vendorUserId,
    leadIds: items.map((l) => l.id),
  });

  return {
    items: items.map((lead) => toTeaserView(lead, unlockedIds.has(lead.id))),
    total,
    take: query.take,
    skip: query.skip,
  };
};

export const unlockLead = async ({ leadId, vendorUserId }) => {
  // Make sure a wallet row exists before we hit the atomic transaction.
  // Won't grant credits - just ensures the row is there to debit against.
  await walletRepo.ensureWallet(vendorUserId);

  const result = await marketplaceRepo.unlockLeadAtomically({
    leadId,
    vendorUserId,
  });

  return {
    leadId: result.assignment.leadId,
    assignmentId: result.assignment.id,
    unlockedAt: result.assignment.unlockedAt,
    priceInCreditsPaid: result.assignment.priceInCreditsPaid,
    walletBalanceAfter: result.walletBalanceAfter,
    lead: result.assignment.lead, // FULL contact info - vendor paid for it.
  };
};
