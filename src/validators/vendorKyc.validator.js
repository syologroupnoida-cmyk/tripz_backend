import { z } from 'zod';

const trimmed = (min, max, label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters long`)
    .max(max, `${label} must not exceed ${max} characters`);

const optionalTrimmed = (max, label) =>
  z
    .string()
    .trim()
    .max(max, `${label} must not exceed ${max} characters`)
    .optional()
    .or(z.literal('').transform(() => undefined));

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v && v !== '' ? v : null));

// Coerce string numbers ("12") OR ints (12) safely. Empty strings → undefined.
const optionalIntCoerce = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  });

// "YES"/"NO"/true/false → boolean
const yesNoBoolean = z
  .union([z.boolean(), z.enum(['YES', 'NO', 'yes', 'no', 'true', 'false'])])
  .transform((v) => v === true || v === 'YES' || v === 'yes' || v === 'true');

const KYC_COMPANY_TYPES = [
  'PROPRIETORSHIP',
  'PARTNERSHIP',
  'LLP',
  'PVT_LTD',
  'PUBLIC_LTD',
  'OTHER',
];

const KYC_REFERRAL_SOURCES = [
  'REFERENCE',
  'GOOGLE',
  'SOCIAL_MEDIA',
  'ADVERTISEMENT',
  'OTHER',
];

// Accept the verbose frontend label too ("Proprietorship Firm") and map.
const COMPANY_TYPE_ALIASES = {
  'PROPRIETORSHIP FIRM': 'PROPRIETORSHIP',
  PROPRIETORSHIP: 'PROPRIETORSHIP',
  PARTNERSHIP: 'PARTNERSHIP',
  LLP: 'LLP',
  'PRIVATE LIMITED': 'PVT_LTD',
  'PVT LTD': 'PVT_LTD',
  PVT_LTD: 'PVT_LTD',
  'PUBLIC LIMITED': 'PUBLIC_LTD',
  PUBLIC_LTD: 'PUBLIC_LTD',
  OTHER: 'OTHER',
};

const companyTypeField = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return undefined;
    const key = v.trim().toUpperCase();
    return COMPANY_TYPE_ALIASES[key] || (KYC_COMPANY_TYPES.includes(key) ? key : undefined);
  });

const referralSourceField = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return undefined;
    const key = v.trim().toUpperCase();
    return KYC_REFERRAL_SOURCES.includes(key) ? key : undefined;
  });

// The wizard payload. `passthrough()` so extra fields (verifiedDocs,
// uploadedFiles, etc.) are tolerated but quietly ignored downstream.
export const submitKycSchema = z
  .object({
    // Company identity
    companyName: trimmed(2, 100, 'Company name'),
    businessName: optionalTrimmed(100, 'Business name'),
    companyType: companyTypeField,
    companySince: optionalIntCoerce,
    teamSize: optionalIntCoerce,
    companyLogo: optionalUrl,

    // Location
    country: trimmed(2, 60, 'Country'),
    officeAddress: trimmed(5, 300, 'Office address'),
    officeCity: optionalTrimmed(100, 'Office city'),
    officeState: optionalTrimmed(100, 'Office state'),

    // Business operations
    services: z.array(z.string().trim().min(1)).optional().default([]),
    destinations: z.array(z.string().trim().min(1)).optional().default([]),
    dailyLeadRequirement: optionalIntCoerce,

    // Online presence
    profileUrl: optionalUrl, // mapped to websiteUrl downstream
    facebookUrl: optionalUrl,
    instagramUrl: optionalUrl,

    // Referral
    referralSource: referralSourceField,
    otherSource: optionalTrimmed(200, 'Other source'),
    marketplaceWorked: yesNoBoolean.optional().default(false),

    // Legal declaration
    agreeTerms: z.boolean().optional().default(false),
    declareTrue: z.boolean().optional().default(false),

    // ---- Document fields (paired number + URL per doc) ----
    panNumber: optionalTrimmed(20, 'PAN number'),
    panDocument: optionalUrl,

    aadharNumber: optionalTrimmed(20, 'Aadhar number'),
    aadharDocument: optionalUrl,
  })
  .passthrough();

// ---- Per-document verification schemas ----
const docNumberField = (label, max = 30) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .toUpperCase()
    .min(2, `${label} is too short`)
    .max(max, `${label} is too long`);

export const verifyPanSchema = z
  .object({ number: docNumberField('PAN', 10) })
  .strict();

export const verifyGstinSchema = z
  .object({ number: docNumberField('GSTIN', 15) })
  .strict();

export const verifyCinSchema = z
  .object({ number: docNumberField('CIN', 21) })
  .strict();

export const aadhaarInitiateSchema = z
  .object({
    number: z
      .string({ required_error: 'Aadhaar number is required' })
      .trim()
      .regex(/^[0-9]{12}$/, 'Aadhaar must be 12 digits'),
  })
  .strict();

// The OTP is collected + validated on DigiLocker (outside our app), so the
// frontend only needs to POST the sessionId. The backend uses that to look
// up the parked Surepass client_id and fetch the verified Aadhaar details.
export const aadhaarCompleteSchema = z
  .object({
    sessionId: z
      .string({ required_error: 'sessionId is required' })
      .trim()
      .min(8, 'sessionId is invalid'),
  })
  .strict();

export const rejectKycSchema = z
  .object({
    reason: trimmed(5, 500, 'Rejection reason'),
  })
  .strict();

export const listKycQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
    // Dual-style pagination — same pattern as adminLead/vendorManagement/vendorWallet.
    take: z.coerce.number().int().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(0).optional(),
    size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .transform((q) => {
    const take = q.size ?? q.take ?? 20;
    const skip = q.page !== undefined ? q.page * take : q.skip ?? 0;
    return { status: q.status, take, skip };
  });
