import { ApiError } from '../../utils/ApiError.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import {
  sendVendorApprovedNotice,
  sendVendorRejectedNotice,
} from '../mail/index.js';

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

export const approveVendorKyc = async ({ vendorUserId, adminId }) => {
  const profile = await kycRepo.findVendorProfile(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor profile not found.');
  }
  if (profile.kycStatus !== 'SUBMITTED') {
    throw ApiError.badRequest(
      `Cannot approve KYC from status ${profile.kycStatus}. Vendor must have a SUBMITTED submission.`,
    );
  }
  const { kyc, profile: updatedProfile, user } = await kycRepo.approveKyc({
    vendorUserId,
    adminId,
  });

  // Fire-and-forget approval email. Approval still succeeds if SMTP fails —
  // admin can resend manually if needed.
  sendVendorApprovedNotice({
    to: user.email,
    firstName: user.firstName,
  }).catch((err) =>
    console.error('[kyc] Failed to send vendor-approved notice:', err?.message),
  );

  return {
    kycStatus: updatedProfile.kycStatus,
    kyc,
    approval: buildApprovalSummary(updatedProfile.kycStatus),
  };
};

export const rejectVendorKyc = async ({ vendorUserId, adminId, reason }) => {
  const profile = await kycRepo.findVendorProfile(vendorUserId);
  if (!profile) {
    throw ApiError.notFound('Vendor profile not found.');
  }
  if (profile.kycStatus !== 'SUBMITTED') {
    throw ApiError.badRequest(
      `Cannot reject KYC from status ${profile.kycStatus}. Vendor must have a SUBMITTED submission.`,
    );
  }
  const { kyc, profile: updatedProfile, user } = await kycRepo.rejectKyc({
    vendorUserId,
    adminId,
    reason,
  });

  // Fire-and-forget rejection email so vendor knows to log back in and fix.
  sendVendorRejectedNotice({
    to: user.email,
    firstName: user.firstName,
    reason,
  }).catch((err) =>
    console.error('[kyc] Failed to send vendor-rejected notice:', err?.message),
  );

  return {
    kycStatus: updatedProfile.kycStatus,
    kyc,
    approval: buildApprovalSummary(updatedProfile.kycStatus),
  };
};
