import { ApiError } from '../../utils/ApiError.js';
import * as leadRepo from '../../repositories/lead.repository.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';

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

export const submitLead = async ({ payload, customerUserId = null }) => {
  if (!payload?.lead) {
    throw ApiError.badRequest('Missing `lead` payload.');
  }

  const { top, requirements } = splitLeadPayload(payload.lead);
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
    createdAt: lead.createdAt,
    message: isDirect
      ? 'Thanks! Your inquiry has been received and is being reviewed. The vendor will reach out once it is approved.'
      : 'Thanks! Your inquiry has been received and is being reviewed. Verified vendors will reach out once it is approved.',
  };
};
