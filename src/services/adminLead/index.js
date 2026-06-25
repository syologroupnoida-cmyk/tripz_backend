// =============================================================================
//   Admin Lead Management — review queue, approve, reject, close
// =============================================================================
//
// Lead lifecycle (admin-controlled transitions):
//
//   PENDING_REVIEW ──approve──► ACTIVE     (now visible in /marketplace/leads)
//   PENDING_REVIEW ──reject──►  REJECTED   (with mandatory reason)
//   ACTIVE         ──close──►   CLOSED     (taken off marketplace manually)
//
// Automatic transitions (NOT admin-controlled, handled elsewhere):
//   ACTIVE → EXHAUSTED  (when unlockCount === maxUnlocks)
//   ACTIVE → EXPIRED    (future cron after travel date)
//
// All actions are logged with the admin's user id for audit.
// =============================================================================

import { ApiError } from '../../utils/ApiError.js';
import * as adminLeadRepo from '../../repositories/adminLead.repository.js';

export const listLeadsForAdmin = async (query) => {
  const { items, total } = await adminLeadRepo.listLeadsForAdmin(query);
  return { items, total, take: query.take, skip: query.skip };
};

export const getLeadDetailForAdmin = async (leadId) => {
  const lead = await adminLeadRepo.getLeadDetailForAdmin(leadId);
  if (!lead) {
    throw ApiError.notFound('Lead not found.');
  }
  return lead;
};

const handleTransitionResult = (result, action, expectedStatus) => {
  if (result.notFound) {
    throw ApiError.notFound('Lead not found.');
  }
  if (!result.updated) {
    throw new ApiError(
      409,
      `Cannot ${action} lead from status ${result.currentStatus}. Lead must be ${expectedStatus}.`,
      { code: 'INVALID_STATE_TRANSITION', currentStatus: result.currentStatus },
    );
  }
  return result.lead;
};

export const approveLead = async ({ leadId, adminId, priceInCredits, maxUnlocks }) => {
  const result = await adminLeadRepo.approveLead({
    leadId,
    adminId,
    priceInCredits,
    maxUnlocks,
  });
  const lead = handleTransitionResult(result, 'approve', 'PENDING_REVIEW');
  console.log(
    `[admin-audit] LEAD_APPROVED leadId=${leadId} by admin=${adminId}` +
      (priceInCredits !== undefined ? ` price=${priceInCredits}` : '') +
      (maxUnlocks !== undefined ? ` maxUnlocks=${maxUnlocks}` : ''),
  );
  return { lead };
};

export const rejectLead = async ({ leadId, adminId, reason }) => {
  const result = await adminLeadRepo.rejectLead({ leadId, adminId, reason });
  const lead = handleTransitionResult(result, 'reject', 'PENDING_REVIEW');
  console.log(
    `[admin-audit] LEAD_REJECTED leadId=${leadId} by admin=${adminId} reason="${reason}"`,
  );
  return { lead };
};

export const closeLead = async ({ leadId, adminId, reason }) => {
  const result = await adminLeadRepo.closeLead({ leadId, adminId, reason });
  const lead = handleTransitionResult(result, 'close', 'ACTIVE');
  console.log(
    `[admin-audit] LEAD_CLOSED leadId=${leadId} by admin=${adminId} reason="${reason ?? '(none)'}"`,
  );
  return { lead };
};

/**
 * Update lead pricing (priceInCredits / maxUnlocks).
 *
 * Guarded — only allowed while:
 *   - lead status is PENDING_REVIEW or ACTIVE, AND
 *   - unlockCount === 0  (no vendor has paid for this lead yet)
 *
 * Once even one vendor has unlocked, the price is locked to keep things fair.
 */
export const updateLeadPricing = async ({
  leadId,
  adminId,
  priceInCredits,
  maxUnlocks,
}) => {
  const result = await adminLeadRepo.updateLeadPricing({
    leadId,
    priceInCredits,
    maxUnlocks,
  });

  if (result.notFound) {
    throw ApiError.notFound('Lead not found.');
  }
  if (!result.updated) {
    // Surface the *specific* reason so the frontend can show a useful message.
    if (result.currentUnlockCount > 0) {
      throw new ApiError(
        409,
        `Pricing is locked: ${result.currentUnlockCount} vendor(s) have already unlocked this lead.`,
        { code: 'PRICING_LOCKED', currentUnlockCount: result.currentUnlockCount },
      );
    }
    throw new ApiError(
      409,
      `Cannot update pricing on a ${result.currentStatus} lead. Lead must be PENDING_REVIEW or ACTIVE.`,
      { code: 'INVALID_STATE_FOR_PRICING', currentStatus: result.currentStatus },
    );
  }

  console.log(
    `[admin-audit] LEAD_PRICING_UPDATED leadId=${leadId} by admin=${adminId}` +
      (priceInCredits !== undefined ? ` price=${priceInCredits}` : '') +
      (maxUnlocks !== undefined ? ` maxUnlocks=${maxUnlocks}` : ''),
  );
  return { lead: result.lead };
};
