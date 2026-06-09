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

// Re-export the mode logger so server.js can find it where it always has.
export { logKycVerificationMode } from './providers/index.js';

// -----------------------------------------------------------------------------
//   Instant verifications (PAN / GSTIN / CIN)
// -----------------------------------------------------------------------------

export const verifyPan = async ({ vendorUserId, number }) => {
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
  return { document, holderName: result.holderName };
};

export const verifyGstin = async ({ vendorUserId, number }) => {
  const result = await provider.verifyGstin(number);
  if (!result.verified) {
    throw new ApiError(422, result.reason || 'GSTIN verification failed.', {
      code: 'DOCUMENT_VERIFICATION_FAILED',
      type: 'GSTIN',
    });
  }
  const document = await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'GSTIN',
    documentNumber: number,
    thirdPartyVerified: true,
    thirdPartyProvider: PROVIDER_NAME,
    thirdPartyVerifiedAt: new Date(),
    thirdPartyResponse: result.rawResponse,
  });
  return { document, businessName: result.businessName };
};

export const verifyCin = async ({ vendorUserId, number }) => {
  const result = await provider.verifyCin(number);
  if (!result.verified) {
    throw new ApiError(422, result.reason || 'CIN verification failed.', {
      code: 'DOCUMENT_VERIFICATION_FAILED',
      type: 'CIN',
    });
  }
  const document = await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'CIN',
    documentNumber: number,
    thirdPartyVerified: true,
    thirdPartyProvider: PROVIDER_NAME,
    thirdPartyVerifiedAt: new Date(),
    thirdPartyResponse: result.rawResponse,
  });
  return { document, companyName: result.companyName };
};

// -----------------------------------------------------------------------------
//   Aadhaar — two-step OTP flow
//
// We delegate OTP delivery + verification to the provider. The provider owns
// the OTP value itself (Surepass sends real SMS; stub generates locally).
//
// We keep an EmailOtp row purely for OUR concerns:
//   • per-user rate limiting (attempts counter)
//   • TTL (expiresAt) so stale sessions don't linger forever
//   The codeHash field is not meaningful here — we don't compare against it.
// -----------------------------------------------------------------------------

export const sendAadhaarOtp = async ({ vendorUserId, number }) => {
  const result = await provider.sendAadhaarOtp(number);
  if (!result.sent) {
    throw new ApiError(422, result.reason || 'Could not initiate Aadhaar verification.', {
      code: 'AADHAAR_OTP_SEND_FAILED',
    });
  }

  // Park the (still unverified) Aadhaar on the document row, plus the
  // provider's client_id so confirm-otp can find it later.
  await kycRepo.upsertKycDocument({
    vendorUserId,
    type: 'AADHAR',
    documentNumber: number,
    thirdPartyVerified: false,
    thirdPartyProvider: PROVIDER_NAME,
    thirdPartyVerifiedAt: null,
    thirdPartyResponse: {
      providerClientId: result.providerClientId,
      providerSentAt: new Date().toISOString(),
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

  return { sessionId: session.id, expiresAt: session.expiresAt };
};

export const confirmAadhaarOtp = async ({ vendorUserId, sessionId, otp }) => {
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

  // 3. Let the provider verify (Surepass calls UIDAI; stub compares its in-memory hash).
  const result = await provider.confirmAadhaarOtp({ providerClientId, otp });
  if (!result.verified) {
    await otpRepo.incrementOtpAttempts(active.id);
    throw ApiError.unauthorized(result.reason || 'Invalid OTP.');
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
    },
  });
  const document = await kycRepo.markAadhaarVerified({ vendorUserId });

  return { document };
};
