import prisma from '../config/db.js';

const KYC_SELECT = {
  vendorUserId: true,
  companyName: true,
  businessName: true,
  companyType: true,
  companySinceYears: true,
  teamSize: true,
  companyLogoUrl: true,
  country: true,
  officeAddress: true,
  officeCity: true,
  officeState: true,
  services: true,
  destinations: true,
  dailyLeadRequirement: true,
  websiteUrl: true,
  facebookUrl: true,
  instagramUrl: true,
  referralSource: true,
  otherSource: true,
  marketplaceWorked: true,
  agreedTerms: true,
  declaredTrue: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedByAdminId: true,
  rejectionReason: true,
};

const DOC_SELECT = {
  id: true,
  type: true,
  documentNumber: true,
  documentUrl: true,
  isVerified: true,
  verifiedAt: true,
  verifiedByAdminId: true,
  notes: true,
  thirdPartyVerified: true,
  thirdPartyProvider: true,
  thirdPartyVerifiedAt: true,
  thirdPartyResponse: true,  // needed so /aadhaar/complete can read providerClientId
  createdAt: true,
  updatedAt: true,
};

export const findVendorProfile = async (userId) => {
  return prisma.vendorProfile.findUnique({
    where: { userId },
    include: {
      kyc: { select: KYC_SELECT },
      documents: { select: DOC_SELECT },
    },
  });
};

// Lightweight lookup used by login / /auth/me to drive the frontend's
// post-login redirect (KYC page vs dashboard).
export const findVendorKycStatus = async (userId) => {
  return prisma.vendorProfile.findUnique({
    where: { userId },
    select: { kycStatus: true },
  });
};

/**
 * Fetch a single KYC document row by (vendorUserId, type). Used by the verify
 * services to check whether a document has already been verified before making
 * an expensive third-party call.
 */
export const findKycDocument = async ({ vendorUserId, type }) => {
  return prisma.vendorKycDocument.findUnique({
    where: { vendorUserId_type: { vendorUserId, type } },
    select: DOC_SELECT,
  });
};

// ---- Per-document verification writes (used by /vendor/kyc/verify/*) ----

/**
 * Upsert a single VendorKycDocument by (vendorUserId, type).
 * Used by the verify endpoints — one row per doc type per vendor.
 */
export const upsertKycDocument = async ({
  vendorUserId,
  type,
  documentNumber,
  documentUrl,
  thirdPartyVerified,
  thirdPartyProvider,
  thirdPartyVerifiedAt,
  thirdPartyResponse,
}) => {
  const data = {
    documentNumber: documentNumber ?? null,
    documentUrl: documentUrl ?? null,
    thirdPartyVerified: Boolean(thirdPartyVerified),
    thirdPartyProvider: thirdPartyProvider ?? null,
    thirdPartyVerifiedAt: thirdPartyVerifiedAt ?? null,
    thirdPartyResponse: thirdPartyResponse ?? null,
  };
  return prisma.vendorKycDocument.upsert({
    where: { vendorUserId_type: { vendorUserId, type } },
    create: { vendorUserId, type, ...data },
    update: data,
    select: DOC_SELECT,
  });
};

/**
 * Finalize the parked Aadhaar verification — flips thirdPartyVerified from
 * false → true after the user confirms the OTP. Returns null if no AADHAR row
 * exists (caller should call sendAadhaarOtp first).
 */
export const markAadhaarVerified = async ({ vendorUserId }) => {
  const existing = await prisma.vendorKycDocument.findUnique({
    where: { vendorUserId_type: { vendorUserId, type: 'AADHAR' } },
  });
  if (!existing) return null;

  return prisma.vendorKycDocument.update({
    where: { vendorUserId_type: { vendorUserId, type: 'AADHAR' } },
    data: {
      thirdPartyVerified: true,
      thirdPartyVerifiedAt: new Date(),
    },
    select: DOC_SELECT,
  });
};

// ---- Whole-KYC writes (used by /vendor/kyc submit + admin review) ----

/**
 * Vendor submits or resubmits the company-level fields. Documents are NOT
 * touched here — they're managed independently via the verify endpoints.
 *
 * Transactionally:
 *   1. Upserts the VendorKyc main row (resets review fields on resubmit).
 *   2. Flips VendorProfile.kycStatus → SUBMITTED.
 *   3. Deactivates the User (isActive=false) — vendor can't log in again
 *      until admin approves. Existing access tokens still work until expiry
 *      (~15 min) so the vendor can see the "thank you" screen.
 *   4. Revokes all refresh tokens so the session can't be extended.
 */
export const upsertKycAndMarkSubmitted = async ({ vendorUserId, kyc }) => {
  return prisma.$transaction(async (tx) => {
    const created = await tx.vendorKyc.upsert({
      where: { vendorUserId },
      create: { vendorUserId, ...kyc },
      update: {
        ...kyc,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedByAdminId: null,
        rejectionReason: null,
      },
      select: KYC_SELECT,
    });

    const profile = await tx.vendorProfile.update({
      where: { userId: vendorUserId },
      data: { kycStatus: 'SUBMITTED' },
      select: { userId: true, kycStatus: true, updatedAt: true },
    });

    // Deactivate the account so the vendor can't log in again until admin
    // makes a decision. They'll see a clear "under review" message on login.
    await tx.user.update({
      where: { id: vendorUserId },
      data: { isActive: false },
    });

    // Revoke all refresh tokens so they can't extend the current session
    // beyond the access token's natural expiry.
    await tx.refreshToken.updateMany({
      where: { userId: vendorUserId, isRevoked: false },
      data: { isRevoked: true },
    });

    const documents = await tx.vendorKycDocument.findMany({
      where: { vendorUserId },
      select: DOC_SELECT,
    });

    return { kyc: { ...created, documents }, profile };
  });
};

// Admin approves the KYC — also re-activates the User so the vendor can
// log back in. From here on they have full marketplace access.
export const approveKyc = async ({ vendorUserId, adminId }) => {
  return prisma.$transaction(async (tx) => {
    const kyc = await tx.vendorKyc.update({
      where: { vendorUserId },
      data: {
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
        rejectionReason: null,
      },
      select: KYC_SELECT,
    });
    const profile = await tx.vendorProfile.update({
      where: { userId: vendorUserId },
      data: { kycStatus: 'APPROVED' },
      select: { userId: true, kycStatus: true, updatedAt: true },
    });
    const user = await tx.user.update({
      where: { id: vendorUserId },
      data: { isActive: true },
      select: { id: true, email: true, firstName: true, isActive: true },
    });
    const documents = await tx.vendorKycDocument.findMany({
      where: { vendorUserId },
      select: DOC_SELECT,
    });
    return { kyc: { ...kyc, documents }, profile, user };
  });
};

// Admin rejects the KYC — re-activates the User so the vendor can log
// back in, see the rejection reason, and resubmit a corrected KYC.
// (A second submission will flip isActive back to false.)
export const rejectKyc = async ({ vendorUserId, adminId, reason }) => {
  return prisma.$transaction(async (tx) => {
    const kyc = await tx.vendorKyc.update({
      where: { vendorUserId },
      data: {
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
        rejectionReason: reason,
      },
      select: KYC_SELECT,
    });
    const profile = await tx.vendorProfile.update({
      where: { userId: vendorUserId },
      data: { kycStatus: 'REJECTED' },
      select: { userId: true, kycStatus: true, updatedAt: true },
    });
    const user = await tx.user.update({
      where: { id: vendorUserId },
      data: { isActive: true },
      select: { id: true, email: true, firstName: true, isActive: true },
    });
    const documents = await tx.vendorKycDocument.findMany({
      where: { vendorUserId },
      select: DOC_SELECT,
    });
    return { kyc: { ...kyc, documents }, profile, user };
  });
};

export const listKycSubmissions = async ({ status, take, skip }) => {
  const where = status ? { kycStatus: status } : {};
  const [items, total] = await Promise.all([
    prisma.vendorProfile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      skip,
      include: {
        kyc: { select: KYC_SELECT },
        documents: { select: DOC_SELECT },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
            emailVerifiedAt: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.vendorProfile.count({ where }),
  ]);
  return { items, total };
};
