// =============================================================================
//   Vendor KYC — document verification (business logic)
// =============================================================================
//
// Pure business logic. Doesn't know which provider it's talking to — it just
// calls `provider.verifyXxx(...)` and trusts the result. The actual HTTPS
// calls (or stub mocks) live under `./providers/`.
//
// Responsibilities here:
//   • Validate vendor state (don't accept submissions from suspended users etc)
//   • Persist successful verifications to VendorKycDocument
//   • Manage local OTP sessions (rate-limit + expiry) — see Aadhaar flow below
//
// Responsibilities elsewhere:
//   • Provider integration / mocking → ./providers/
//   • HTTP shape / route gating → controllers + routes
//   • Schema validation → validators
// =============================================================================

import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import * as kycRepo from '../../repositories/vendorKyc.repository.js';
import * as otpRepo from '../../repositories/emailOtp.repository.js';
import { otpExpiry } from '../../utils/otp.js';
import { provider, PROVIDER_NAME } from './providers/index.js';
import { GSTIN_REGEX, CIN_REGEX } from './providers/_formats.js';

// Re-export the mode logger so server.js can find it where it always has.
export { logKycVerificationMode } from './providers/index.js';

// -----------------------------------------------------------------------------
//   Instant verifications (PAN)
// -----------------------------------------------------------------------------

export const verifyPan = async ({ vendorUserId, number }) => {
  // Idempotency: if this PAN was already verified for this vendor, return
  // the cached result. Each Surepass call costs credits — re-verifying the
  // same successful number is a waste. A DIFFERENT number (vendor edited
  // their PAN) always triggers a fresh call.
  const existing = await kycRepo.findKycDocument({ vendorUserId, type: 'PAN' });
  if (
    existing?.thirdPartyVerified &&
    existing.documentNumber === number
  ) {
    return {
      document: existing,
      holderName:
        existing.thirdPartyResponse?.data?.full_name ??
        existing.thirdPartyResponse?.holderName ??
        null,
      alreadyVerified: true,
    };
  }

  const result = await provider.verifyPan(number);
  if (!result.verified) {
    throw new ApiError(422, result.reason || 'PAN verification failed.', {
      code: 'DOCUMENT_VERIFICATION_FAILED',
      type: 'PAN',
    });
  }
  const document = await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'PAN',
    documentNumber: number,
    thirdPartyVerified: true,
    thirdPartyProvider: PROVIDER_NAME,
    thirdPartyVerifiedAt: new Date(),
    thirdPartyResponse: result.rawResponse,
  });
  return { document, holderName: result.holderName, alreadyVerified: false };
};

// -----------------------------------------------------------------------------
//   GSTIN / CIN — format-only verification (no third-party call, no credits)
//
// We do not hit Surepass for these. The vendor types the number, we validate
// the format, mark `thirdPartyVerified=true` so the doc passes the submission
// gate, but use the provider name "FORMAT_ONLY" so admins know to manually
// verify the uploaded certificate during KYC review.
// -----------------------------------------------------------------------------

const FORMAT_ONLY_PROVIDER = 'FORMAT_ONLY';

export const verifyGstin = async ({ vendorUserId, number }) => {
  if (!GSTIN_REGEX.test(number)) {
    throw new ApiError(422, 'GSTIN format is invalid.', {
      code: 'DOCUMENT_VERIFICATION_FAILED',
      type: 'GSTIN',
    });
  }
  // Idempotency: skip the DB write if already verified with the same number.
  const existing = await kycRepo.findKycDocument({ vendorUserId, type: 'GSTIN' });
  if (existing?.thirdPartyVerified && existing.documentNumber === number) {
    return { document: existing, alreadyVerified: true };
  }
  const document = await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'GSTIN',
    documentNumber: number,
    thirdPartyVerified: true,
    thirdPartyProvider: FORMAT_ONLY_PROVIDER,
    thirdPartyVerifiedAt: new Date(),
    thirdPartyResponse: {
      method: 'format-check',
      note: 'Format validated only; admin must manually verify the uploaded certificate.',
    },
  });
  return { document, alreadyVerified: false };
};

export const verifyCin = async ({ vendorUserId, number }) => {
  if (!CIN_REGEX.test(number)) {
    throw new ApiError(422, 'CIN format is invalid.', {
      code: 'DOCUMENT_VERIFICATION_FAILED',
      type: 'CIN',
    });
  }
  const existing = await kycRepo.findKycDocument({ vendorUserId, type: 'CIN' });
  if (existing?.thirdPartyVerified && existing.documentNumber === number) {
    return { document: existing, alreadyVerified: true };
  }
  const document = await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'CIN',
    documentNumber: number,
    thirdPartyVerified: true,
    thirdPartyProvider: FORMAT_ONLY_PROVIDER,
    thirdPartyVerifiedAt: new Date(),
    thirdPartyResponse: {
      method: 'format-check',
      note: 'Format validated only; admin must manually verify the uploaded certificate.',
    },
  });
  return { document, alreadyVerified: false };
};

// -----------------------------------------------------------------------------
//   Aadhaar — DigiLocker-backed two-step flow
//
// Surepass's DigiLocker product hands off OTP delivery + UIDAI validation to
// DigiLocker's own UI. Our backend's job is:
//   • initiate the session (this returns a DigiLocker SDK URL),
//   • park the client_id so we can fetch the result later,
//   • after the user finishes on DigiLocker, pull the verified Aadhaar data.
//
// We keep an EmailOtp row purely for OUR concerns:
//   • per-user rate limiting (attempts counter)
//   • TTL (expiresAt) so stale sessions don't linger forever
//   The codeHash field is not meaningful here — DigiLocker owns the OTP.
// -----------------------------------------------------------------------------

export const initiateAadhaarVerification = async ({ vendorUserId, number }) => {
  // Idempotency: if this Aadhaar was already verified for this vendor, skip
  // the DigiLocker session entirely. No Surepass credits used. The frontend
  // sees `alreadyVerified: true` and can skip showing the DigiLocker UI.
  // A DIFFERENT number (vendor changed Aadhaar) starts a fresh session.
  const existing = await kycRepo.findKycDocument({ vendorUserId, type: 'AADHAR' });
  if (
    existing?.thirdPartyVerified &&
    existing.documentNumber === number
  ) {
    return {
      sessionId: null,
      expiresAt: null,
      redirectUrl: null,
      alreadyVerified: true,
      holderName:
        existing.thirdPartyResponse?.metadata?.name ??
        existing.thirdPartyResponse?.holderName ??
        null,
    };
  }

  const result = await provider.initiateAadhaarVerification(number);
  if (!result.sent) {
    throw new ApiError(422, result.reason || 'Could not initiate Aadhaar verification.', {
      code: 'AADHAAR_OTP_SEND_FAILED',
    });
  }

  // Park the (still unverified) Aadhaar on the document row, plus the
  // provider's client_id + token so confirm-otp can find them later. Also save
  // the DigiLocker URL (new Surepass flow) for audit / debugging.
  await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'AADHAR',
    documentNumber: number,
    thirdPartyVerified: false,
    thirdPartyProvider: PROVIDER_NAME,
    thirdPartyVerifiedAt: null,
    thirdPartyResponse: {
      providerClientId: result.providerClientId,
      providerToken: result.providerToken ?? null,
      providerSentAt: new Date().toISOString(),
      redirectUrl: result.redirectUrl ?? null,
      providerExpiresAt: result.expiresAt ?? null,
      raw: result.rawResponse,
    },
  });

  // Local session for rate-limiting + expiry. codeHash is a sentinel — the
  // provider is the source of truth for the actual OTP comparison.
  await otpRepo.invalidateActiveOtps({ userId: vendorUserId, purpose: 'AADHAAR_VERIFICATION' });
  const session = await otpRepo.createEmailOtp({
    userId: vendorUserId,
    codeHash: 'managed-by-provider',
    purpose: 'AADHAAR_VERIFICATION',
    expiresAt: otpExpiry(),
  });

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    // New DigiLocker flow: frontend should open this URL so the user can
    // authenticate on DigiLocker (where the OTP is sent + verified). Null
    // for legacy accounts still using Surepass's own OTP flow — in that
    // case the user just types the OTP into your form as before.
    redirectUrl: result.redirectUrl ?? null,
    alreadyVerified: false,
  };
};

export const completeAadhaarVerification = async ({ vendorUserId, sessionId }) => {
  // 1. Validate the local session.
  const active = await otpRepo.findOtpById(sessionId);
  if (!active || active.userId !== vendorUserId || active.purpose !== 'AADHAAR_VERIFICATION') {
    throw ApiError.unauthorized('Invalid or expired session. Please request a new OTP.');
  }
  if (active.consumedAt) {
    throw ApiError.unauthorized('OTP already used. Please request a new one.');
  }
  if (active.expiresAt.getTime() < Date.now()) {
    throw ApiError.unauthorized('OTP expired. Please request a new one.');
  }
  if (active.attempts >= env.OTP_MAX_ATTEMPTS) {
    await otpRepo.consumeOtp(active.id);
    throw ApiError.unauthorized('Too many incorrect attempts. Please request a new OTP.');
  }

  // 2. Find the provider's client_id we parked at send-otp time.
  const profile = await kycRepo.findVendorProfile(vendorUserId);
  const aadhaarDoc = profile?.documents?.find((d) => d.type === 'AADHAR');
  const providerClientId = aadhaarDoc?.thirdPartyResponse?.providerClientId;
  if (!providerClientId) {
    throw ApiError.badRequest(
      'No pending Aadhaar verification found. Please send the OTP first.',
    );
  }

  // 3. Let the provider fetch the verified Aadhaar from Surepass. DigiLocker
  //    has already collected and validated the OTP outside our app, so the
  //    provider only needs the client_id we parked at initiate-time.
  const result = await provider.completeAadhaarVerification({
    providerClientId,
  });
  if (!result.verified) {
    await otpRepo.incrementOtpAttempts(active.id);
    throw ApiError.unauthorized(result.reason || 'Aadhaar verification failed or still pending.');
  }

  // 4. Burn the session, flip the document to verified, stamp the raw response
  //    onto the doc for admin audit.
  await otpRepo.consumeOtp(active.id);
  await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'AADHAR',
    documentNumber: aadhaarDoc.documentNumber,
    thirdPartyVerified: true,
    thirdPartyProvider: PROVIDER_NAME,
    thirdPartyVerifiedAt: new Date(),
    thirdPartyResponse: {
      ...(aadhaarDoc.thirdPartyResponse ?? {}),
      confirmation: result.rawResponse,
      holderName: result.holderName ?? null,
      metadata: result.metadata ?? null,
    },
  });
  const document = await kycRepo.markAadhaarVerified({ vendorUserId });

  return {
    document,
    holderName: result.holderName ?? null,
    metadata: result.metadata ?? null, // { name, dob, gender, mobile_number }
  };
};
