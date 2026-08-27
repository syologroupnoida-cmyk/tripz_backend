import { ApiError } from '../../utils/ApiError.js';
import * as leadRepo from '../../repositories/lead.repository.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import * as packageRepo from '../../repositories/package.repository.js';
import * as subscriptionRepo from '../../repositories/subscription.repository.js';

// Fallback when the package's owning vendor has no active subscription at
// inquiry time. Should be rare (Phase 2B cron will pause packages whose
// owners' subs have lapsed), but we still charge SOMETHING so a mis-configured
// vendor doesn't get free direct leads.
const FALLBACK_DIRECT_LEAD_PRICE = 5;

/**
 * Validate that a `targetVendorId` (when supplied) points to a real, eligible
 * vendor. Eligibility = role VENDOR + isActive + KYC approved. Direct leads
 * targeted at non-eligible vendors are rejected at submission so the customer
 * isn't silently mismatched.
 */
const assertTargetVendorEligible = async (vendorUserId) => {
  const user = await userRepo.findUserById(vendorUserId);
  if (!user || user.role !== 'VENDOR') {
    throw ApiError.badRequest('Target vendor not found.', {
      code: 'TARGET_VENDOR_NOT_FOUND',
    });
  }
  if (!user.isActive) {
    throw ApiError.badRequest('Target vendor is not currently accepting leads.', {
      code: 'TARGET_VENDOR_INACTIVE',
    });
  }
  const profile = await kycRepo.findVendorKycStatus(vendorUserId);
  if (!profile || profile.kycStatus !== 'APPROVED') {
    throw ApiError.badRequest(
      'Target vendor has not completed KYC and cannot receive direct leads yet.',
      { code: 'TARGET_VENDOR_KYC_PENDING' },
    );
  }
};

/**
 * Split the incoming wizard payload into:
 *   - Top-level relational columns (destination/departureCity/travelDate/email/phone/budget)
 *   - A `requirements` JSONB blob for everything else.
 *
 * Anything not explicitly destructured into a top-level column ends up in
 * the JSONB blob unchanged — this is the "hybrid data" strategy.
 *
 * `travelDate` arrives as a string from the form; we try to parse it to a
 * Date here. Unparseable / empty → null. Bad input never crashes the request.
 */
const parseTravelDate = (raw) => {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
};

const splitLeadPayload = (form) => {
  const {
    destination,
    departureCity,
    travelDate,
    email,
    phone,
    budget,
    ...requirements
  } = form;

  return {
    top: {
      destination,
      departureCity:
        typeof departureCity === 'string' && departureCity.trim() !== ''
          ? departureCity.trim()
          : null,
      travelDate: parseTravelDate(travelDate),
      email,
      phone,
      budget, // already normalized to Int | null by the validator
    },
    requirements,
  };
};

/**
 * Resolve the direct-lead-cost this package's owner charges. Reads the vendor's
 * active subscription; falls back to a constant if the owner is between subs.
 */
const resolveDirectLeadPrice = async (vendorUserId) => {
  const sub = await subscriptionRepo.findActiveSubscriptionForVendor(vendorUserId);
  const isExpired = sub && new Date(sub.expiresAt) < new Date();
  if (!sub || isExpired) return FALLBACK_DIRECT_LEAD_PRICE;
  const price = sub.plan?.directLeadPriceCredits;
  return Number.isFinite(price) && price >= 0 ? price : FALLBACK_DIRECT_LEAD_PRICE;
};

export const submitLead = async ({ payload, customerUserId = null }) => {
  if (!payload?.lead) {
    throw ApiError.badRequest('Missing `lead` payload.');
  }

  const { top, requirements } = splitLeadPayload(payload.lead);

  // ----- Phase 2C — package inquiry flow (highest priority) -----
  // If `packageId` is set, this is a customer inquiring from a package detail
  // page. Auto-APPROVED. Backend derives targetVendorId and journey endpoints from
  // the package itself; any client-sent values are overridden to prevent
  // spoofing.
  if (payload.packageId) {
    const pkg = await packageRepo.getPackageById(payload.packageId);
    if (!pkg || pkg.status !== 'APPROVED') {
      throw ApiError.badRequest('This package is not available for inquiry.', {
        code: 'PACKAGE_NOT_AVAILABLE',
      });
    }

    const priceInCredits = await resolveDirectLeadPrice(pkg.vendorUserId);

    const lead = await leadRepo.createLead({
      ...top,
      departureCity: pkg.departureCity, // authoritative — don't trust client
      destination: pkg.destination, // authoritative — don't trust client
      customerUserId,
      requirements,
      packageId: pkg.id,
      targetVendorId: pkg.vendorUserId,
      status: 'ACTIVE', // auto-approve; no admin review for package inquiries
      priceInCredits,
      maxUnlocks: 1, // direct lead = only the target vendor can unlock
    });

    return {
      leadId: lead.id,
      status: lead.status,
      isDirect: true,
      fromPackage: true,
      createdAt: lead.createdAt,
      message: 'Inquiry sent to the vendor. They will contact you shortly.',
    };
  }

  // ----- Admin-assigned direct lead (existing flow) -----
  const targetVendorId = payload.targetVendorId ?? null;
  const isDirect = Boolean(targetVendorId);

  if (isDirect) {
    await assertTargetVendorEligible(targetVendorId);
  }

  const lead = await leadRepo.createLead({
    ...top,
    customerUserId,
    requirements,
    targetVendorId,
    // Direct leads are exclusive — only the target vendor can ever unlock,
    // so cap at 1 regardless of the global default.
    maxUnlocks: isDirect ? 1 : undefined,
  });

  return {
    leadId: lead.id,
    status: lead.status,
    isDirect,
    fromPackage: false,
    createdAt: lead.createdAt,
    message: isDirect
      ? 'Thanks! Your inquiry has been received and is being reviewed. The vendor will reach out once it is approved.'
      : 'Thanks! Your inquiry has been received and is being reviewed. Verified vendors will reach out once it is approved.',
  };
};
