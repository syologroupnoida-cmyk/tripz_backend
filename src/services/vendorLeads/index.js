// =============================================================================
//   Vendor Leads — vendor's own view into leads they've unlocked
// =============================================================================
//
// A vendor's "purchase history" — leads they paid credits to unlock. Contact
// info is unmasked here because they already paid for it.
//
// Scoped queries: a vendor can only see their OWN unlocks. The repo filters
// by vendorUserId (from JWT), so cross-vendor access is impossible.
// =============================================================================

import { ApiError } from '../../utils/ApiError.js';
import * as vendorLeadRepo from '../../repositories/vendorLead.repository.js';

export const listMyUnlockedLeads = async ({ vendorUserId, take, skip }) => {
  const { items, total } = await vendorLeadRepo.listUnlockedLeadsForVendor({
    vendorUserId,
    take,
    skip,
  });
  return { items, total, take, skip };
};

export const getMyUnlockedLead = async ({ vendorUserId, assignmentId }) => {
  const assignment = await vendorLeadRepo.findUnlockedLeadForVendor({
    vendorUserId,
    assignmentId,
  });
  if (!assignment) {
    throw ApiError.notFound('Unlocked lead not found in your purchase history.');
  }
  return assignment;
};
