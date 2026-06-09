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
 * Transactionally: upserts the VendorKyc main row (resets review fields on
 * resubmit) and flips VendorProfile.kycStatus → SUBMITTED.
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

    const documents = await tx.vendorKycDocument.findMany({
      where: { vendorUserId },
      select: DOC_SELECT,
    });

    return { kyc: { ...created, documents }, profile };
  });
};

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
    const documents = await tx.vendorKycDocument.findMany({
      where: { vendorUserId },
      select: DOC_SELECT,
    });
    return { kyc: { ...kyc, documents }, profile };
  });
};

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
    const documents = await tx.vendorKycDocument.findMany({
      where: { vendorUserId },
      select: DOC_SELECT,
    });
    return { kyc: { ...kyc, documents }, profile };
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
