// =============================================================================
//   Vendor Management — admin/super-admin operations on vendor accounts
// =============================================================================
//
// Two distinct surfaces:
//   • Read endpoints (list + detail) — accessible to ADMIN + SUPER_ADMIN.
//   • Write/power endpoints (activate / deactivate / credit grants) — accessible
//     to SUPER_ADMIN only. Role gating happens at the route folder level.
//
// All actions log who performed them (adminId from req.user.id) onto the
// WalletTransaction ledger or the audit trail so the trail is queryable.
// =============================================================================

import { ApiError } from '../../utils/ApiError.js';
import * as vendorRepo from '../../repositories/vendor.repository.js';

/**
 * Strip internal-only fields from a documents array before returning to the
 * client. `thirdPartyResponse` is a fat JSONB blob (full Surepass payload —
 * up to ~10KB per doc) that admins/vendors don't need. The summary fields
 * (`thirdPartyVerified`, `thirdPartyProvider`, `thirdPartyVerifiedAt`) stay.
 */
const stripInternalDocFields = (documents) =>
  (documents ?? []).map(({ thirdPartyResponse, ...rest }) => rest);

/**
 * Frontend-friendly approval summary, mirrors the one in vendorKyc service.
 * Derived from kycStatus so the frontend doesn't have to interpret the enum.
 */
const buildApprovalSummary = (kycStatus) => {
  switch (kycStatus) {
    case 'PENDING':
      return {
        status: 'KYC_NOT_SUBMITTED',
        adminApproved: false,
        canLogin: true,
        message: 'Vendor has not submitted KYC yet.',
      };
    case 'SUBMITTED':
      return {
        status: 'PENDING_ADMIN_REVIEW',
        adminApproved: false,
        canLogin: false,
        message: 'Awaiting admin review.',
      };
    case 'APPROVED':
      return {
        status: 'APPROVED',
        adminApproved: true,
        canLogin: true,
        message: 'KYC approved. Vendor has full marketplace access.',
      };
    case 'REJECTED':
      return {
        status: 'REJECTED',
        adminApproved: false,
        canLogin: true,
        message: 'KYC was rejected. Vendor can resubmit.',
      };
    default:
      return { status: 'UNKNOWN', adminApproved: false, canLogin: false, message: null };
  }
};

// -----------------------------------------------------------------------------
//   READ (ADMIN + SUPER_ADMIN)
// -----------------------------------------------------------------------------

export const listVendors = async (query) => {
  const { items, total } = await vendorRepo.listVendors(query);

  // Flatten the list rows into a shape that's easy for a table UI.
  // walletBalance is only emitted when ?wallet=true so default responses stay
  // identical to the pre-existing shape.
  const rows = items.map((profile) => ({
    userId: profile.user.id,
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    email: profile.user.email,
    phone: profile.user.phone,
    isActive: profile.user.isActive,
    emailVerifiedAt: profile.user.emailVerifiedAt,
    createdAt: profile.user.createdAt,
    kycStatus: profile.kycStatus,
    companyName: profile.kyc?.companyName ?? null,
    businessName: profile.kyc?.businessName ?? null,
    country: profile.kyc?.country ?? null,
    city: profile.kyc?.officeCity ?? null,
    kycSubmittedAt: profile.kyc?.submittedAt ?? null,
    kycReviewedAt: profile.kyc?.reviewedAt ?? null,
    rejectionReason: profile.kyc?.rejectionReason ?? null,
    ...(query.wallet ? { walletBalance: profile.wallet?.balanceCredits ?? 0 } : {}),
  }));

  return { items: rows, total, take: query.take, skip: query.skip };
};

export const getVendorDetail = async (vendorUserId) => {
  const profile = await vendorRepo.getVendorDetail(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor not found.');
  }
  return {
    user: profile.user,
    kycStatus: profile.kycStatus,
    kyc: profile.kyc ?? null,
    documents: stripInternalDocFields(profile.documents),
    wallet: profile.wallet ?? { balanceCredits: 0 },
    approval: buildApprovalSummary(profile.kycStatus),
  };
};

// -----------------------------------------------------------------------------
//   WRITE (SUPER_ADMIN only — role gate enforced at routes/super-admin/index.js)
// -----------------------------------------------------------------------------

export const activateVendor = async ({ vendorUserId, adminId, reason }) => {
  const result = await vendorRepo.setVendorActiveStatus({
    vendorUserId,
    isActive: true,
  });

  if (result.notFound) {
    throw ApiError.notFound('Vendor not found.');
  }
  if (result.notVendor) {
    throw ApiError.badRequest('User is not a vendor.');
  }

  // Stamp the action in server logs (Phase 1 audit). When the audit log
  // table lands in a future phase, replace this with a DB insert.
  console.log(
    `[admin-audit] ACTIVATE vendor=${vendorUserId} by admin=${adminId} reason=${reason ?? '(none)'}`,
  );

  return {
    user: result.user,
    kycStatus: result.profile?.kycStatus ?? null,
  };
};

export const deactivateVendor = async ({ vendorUserId, adminId, reason }) => {
  const result = await vendorRepo.setVendorActiveStatus({
    vendorUserId,
    isActive: false,
  });

  if (result.notFound) {
    throw ApiError.notFound('Vendor not found.');
  }
  if (result.notVendor) {
    throw ApiError.badRequest('User is not a vendor.');
  }

  console.log(
    `[admin-audit] DEACTIVATE vendor=${vendorUserId} by admin=${adminId} reason="${reason}"`,
  );

  return {
    user: result.user,
    kycStatus: result.profile?.kycStatus ?? null,
  };
};

export const grantCredits = async ({ vendorUserId, amount, notes, adminId }) => {
  // Verify the target is actually a vendor before touching the wallet.
  const profile = await vendorRepo.getVendorDetail(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor not found.');
  }

  const result = await vendorRepo.adjustWalletCredits({
    vendorUserId,
    amount,
    type: 'CREDIT_ADMIN_ADJUSTMENT',
    notes,
    adminId,
  });

  console.log(
    `[admin-audit] GRANT_CREDITS vendor=${vendorUserId} amount=${amount} by admin=${adminId} notes="${notes ?? ''}"`,
  );

  return {
    walletBalanceAfter: result.balanceAfter,
    transaction: result.ledger,
  };
};

export const revokeCredits = async ({ vendorUserId, amount, notes, adminId }) => {
  const profile = await vendorRepo.getVendorDetail(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor not found.');
  }

  const result = await vendorRepo.adjustWalletCredits({
    vendorUserId,
    amount,
    type: 'DEBIT_ADMIN_ADJUSTMENT',
    notes,
    adminId,
  });

  if (result.insufficient) {
    throw new ApiError(
      402,
      `Vendor wallet has insufficient credits to revoke ${amount}.`,
      { code: 'INSUFFICIENT_CREDITS' },
    );
  }

  console.log(
    `[admin-audit] REVOKE_CREDITS vendor=${vendorUserId} amount=${amount} by admin=${adminId} notes="${notes}"`,
  );

  return {
    walletBalanceAfter: result.balanceAfter,
    transaction: result.ledger,
  };
};
