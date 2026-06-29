import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import {
  sendVendorApprovedNotice,
  sendVendorRejectedNotice,
} from '../mail/index.js';

// Vendor-facing login page. Centralized here so all KYC outcome emails point
// to the same URL — change once when the frontend route changes.
const VENDOR_LOGIN_URL = `${env.FRONTEND_URL}/vendor/login`;

/**
 * Strip the fat `thirdPartyResponse` JSONB blob before sending to clients.
 * Vendors/admins don't need the raw Surepass payload (~5-10KB per doc). The
 * summary fields stay (verified flag, provider, timestamp).
 */
const stripInternalDocFields = (documents) =>
  (documents ?? []).map(({ thirdPartyResponse, ...rest }) => rest);

export {
  verifyPan,
  verifyGstin,
  verifyCin,
  initiateAadhaarVerification,
  completeAadhaarVerification,
} from './documentVerification.service.js';

const buildVendorKycView = (profile) => ({
  kycStatus: profile.kycStatus,
  kyc: profile.kyc ?? null,
  documents: stripInternalDocFields(profile.documents),
  approval: buildApprovalSummary(profile.kycStatus),
});

/**
 * Frontend-friendly summary of where the vendor stands in the approval
 * pipeline. Derived from `kycStatus` — single source of truth in the DB.
 */
const buildApprovalSummary = (kycStatus) => {
  switch (kycStatus) {
    case 'PENDING':
      return {
        status: 'KYC_NOT_SUBMITTED',
        adminApproved: false,
        canLogin: true,
        message: 'Please complete and submit your KYC to continue.',
      };
    case 'SUBMITTED':
      return {
        status: 'PENDING_ADMIN_REVIEW',
        adminApproved: false,
        canLogin: false,
        message:
          'Your application is under review. We will email you once an admin approves your account.',
      };
    case 'APPROVED':
      return {
        status: 'APPROVED',
        adminApproved: true,
        canLogin: true,
        message: 'Your KYC is approved. You now have full marketplace access.',
      };
    case 'REJECTED':
      return {
        status: 'REJECTED',
        adminApproved: false,
        canLogin: true,
        message:
          'Your KYC was rejected. Please review the reason, fix the issues, and resubmit.',
      };
    default:
      return {
        status: 'UNKNOWN',
        adminApproved: false,
        canLogin: false,
        message: null,
      };
  }
};

/**
 * Reshape the wizard payload to ONLY the company-level fields persisted on
 * VendorKyc. Document fields (panNumber / aadhaarNumber / etc.) are handled
 * separately by the verify endpoints — they're not stored from this payload.
 */
const mapPayloadToKyc = (payload) => ({
  companyName: payload.companyName,
  businessName: payload.businessName ?? null,
  companyType: payload.companyType ?? null,
  companySinceYears: payload.companySince ?? null,
  teamSize: payload.teamSize ?? null,
  companyLogoUrl: payload.companyLogo ?? null,

  country: payload.country,
  officeAddress: payload.officeAddress,
  officeCity: payload.officeCity ?? null,
  officeState: payload.officeState ?? null,

  services: payload.services ?? [],
  destinations: payload.destinations ?? [],
  dailyLeadRequirement: payload.dailyLeadRequirement ?? null,

  websiteUrl: payload.profileUrl ?? null,
  facebookUrl: payload.facebookUrl ?? null,
  instagramUrl: payload.instagramUrl ?? null,

  referralSource: payload.referralSource ?? null,
  otherSource: payload.otherSource ?? null,
  marketplaceWorked: Boolean(payload.marketplaceWorked),

  agreedTerms: Boolean(payload.agreeTerms),
  declaredTrue: Boolean(payload.declareTrue),
});

export const getMyKycStatus = async (vendorUserId) => {
  const profile = await kycRepo.findVendorProfile(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor profile not found.');
  }
  return buildVendorKycView(profile);
};

export const submitMyKyc = async ({ vendorUserId, payload }) => {
  const profile = await kycRepo.findVendorProfile(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor profile not found.');
  }
  if (profile.kycStatus === 'APPROVED') {
    throw ApiError.forbidden(
      'Your KYC is already approved. Contact support to update business details.',
    );
  }
  if (profile.kycStatus === 'SUBMITTED') {
    throw ApiError.forbidden(
      'A KYC submission is already under review. Please wait for admin response.',
    );
  }

  // Hard checkboxes the vendor must accept before we'll accept the submission.
  if (!payload.agreeTerms || !payload.declareTrue) {
    throw ApiError.badRequest(
      'You must accept the terms and declare the information is true to submit KYC.',
      { code: 'TERMS_NOT_ACCEPTED' },
    );
  }

  // Defense in depth: require PAN to be third-party-verified before submission.
  // Frontend should disable the submit button until all required docs verify,
  // but we enforce here too.
  const panDoc = profile.documents.find((d) => d.type === 'PAN');
  if (!panDoc || !panDoc.thirdPartyVerified) {
    throw new ApiError(422, 'PAN must be verified before submitting KYC.', {
      code: 'PAN_NOT_VERIFIED',
    });
  }

  const kycFields = mapPayloadToKyc(payload);
  const { kyc, profile: updatedProfile } = await kycRepo.upsertKycAndMarkSubmitted({
    vendorUserId,
    kyc: kycFields,
  });

  return {
    kycStatus: updatedProfile.kycStatus,
    kyc,
    approval: buildApprovalSummary(updatedProfile.kycStatus),
  };
};

export const listKycForAdmin = async (query) => {
  const { items, total } = await kycRepo.listKycSubmissions(query);
  // Strip the fat thirdPartyResponse from each item's documents.
  const cleanItems = items.map((item) => ({
    ...item,
    documents: stripInternalDocFields(item.documents),
  }));
  return { items: cleanItems, total };
};

// Allowed source states for /approve:
//   SUBMITTED → APPROVED  — normal review-time approval
//   REJECTED  → APPROVED  — mistake-undo for an accidental rejection
// (NOT_SUBMITTED, IN_PROGRESS, APPROVED are blocked.)
const APPROVABLE_KYC_STATES = ['SUBMITTED', 'REJECTED'];

export const approveVendorKyc = async ({ vendorUserId, adminId }) => {
  const profile = await kycRepo.findVendorProfile(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor profile not found.');
  }
  if (!APPROVABLE_KYC_STATES.includes(profile.kycStatus)) {
    throw ApiError.badRequest(
      `Cannot approve KYC from status ${profile.kycStatus}. ` +
        `Vendor must be in one of: ${APPROVABLE_KYC_STATES.join(', ')}.`,
    );
  }
  const wasRejected = profile.kycStatus === 'REJECTED';

  const { kyc, profile: updatedProfile, user } = await kycRepo.approveKyc({
    vendorUserId,
    adminId,
  });

  // Audit trail — explicit log for the rarer "rejection undone" path so it's
  // easy to grep later if a vendor disputes the decision or trail is audited.
  if (wasRejected) {
    console.log(
      `[admin-audit] KYC_REJECTION_REVERTED_AND_APPROVED vendor=${vendorUserId} by admin=${adminId}`,
    );
  }

  // Fire-and-forget approval email. Approval still succeeds if SMTP fails —
  // admin can resend manually if needed.
  sendVendorApprovedNotice({
    to: user.email,
    firstName: user.firstName,
    loginUrl: VENDOR_LOGIN_URL,
  }).catch((err) =>
    console.error('[kyc] Failed to send vendor-approved notice:', err?.message),
  );

  return {
    kycStatus: updatedProfile.kycStatus,
    kyc,
    approval: buildApprovalSummary(updatedProfile.kycStatus),
  };
};

// Allowed source states for /reject:
//   SUBMITTED → REJECTED  — normal review-time rejection
//   APPROVED  → REJECTED  — mistake-undo for an accidental approval
// All other states (NOT_SUBMITTED, IN_PROGRESS, REJECTED) are blocked.
const REJECTABLE_KYC_STATES = ['SUBMITTED', 'APPROVED'];

export const rejectVendorKyc = async ({ vendorUserId, adminId, reason }) => {
  const profile = await kycRepo.findVendorProfile(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor profile not found.');
  }
  if (!REJECTABLE_KYC_STATES.includes(profile.kycStatus)) {
    throw ApiError.badRequest(
      `Cannot reject KYC from status ${profile.kycStatus}. ` +
        `Vendor must be in one of: ${REJECTABLE_KYC_STATES.join(', ')}.`,
    );
  }
  const wasApproved = profile.kycStatus === 'APPROVED';

  const { kyc, profile: updatedProfile, user } = await kycRepo.rejectKyc({
    vendorUserId,
    adminId,
    reason,
  });

  // Audit trail — explicit log line for the rarer "approval undone" path so it's
  // easy to grep through logs later if a vendor disputes the decision.
  if (wasApproved) {
    console.log(
      `[admin-audit] KYC_APPROVAL_REVERTED_AND_REJECTED vendor=${vendorUserId} by admin=${adminId} reason="${reason}"`,
    );
  }

  // Fire-and-forget rejection email so vendor knows to log back in and fix.
  sendVendorRejectedNotice({
    to: user.email,
    firstName: user.firstName,
    reason,
    loginUrl: VENDOR_LOGIN_URL,
  }).catch((err) =>
    console.error('[kyc] Failed to send vendor-rejected notice:', err?.message),
  );

  return {
    kycStatus: updatedProfile.kycStatus,
    kyc,
    approval: buildApprovalSummary(updatedProfile.kycStatus),
  };
};
