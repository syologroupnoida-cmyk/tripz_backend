// =============================================================================
//   Stub provider — local mock for dev when SUREPASS_TOKEN is not configured
// =============================================================================
//
// Mirrors the public API of surepass.provider.js exactly, so the business
// service has zero idea which one it's talking to.
//
// What it does:
//   • PAN / GSTIN / CIN: format-only regex check, always "verified" if the
//     number is well-formed.
//   • Aadhaar OTP: generates its OWN 6-digit OTP, stores the hash in an
//     in-memory Map keyed by a fake providerClientId, and logs the OTP to the
//     server console so devs can complete the flow without any SMS provider.
//
// Lifetime of stub state:
//   The Map lives for the lifetime of the Node process. Restarting the server
//   discards all pending OTPs — that's fine for dev. Don't ship to prod with
//   the stub provider active (boot-time log warns about this).
// =============================================================================

import { generateOtp, hashOtp } from '../../../utils/otp.js';
import {
  PAN_REGEX,
  GSTIN_REGEX,
  CIN_REGEX,
  AADHAAR_REGEX,
} from './_formats.js';

export const PROVIDER_NAME = 'STUB';

// In-memory store: providerClientId → hashedOtp. Cleared on process restart.
const stubOtpStore = new Map();

// -----------------------------------------------------------------------------
//   Public verification API (mirror of surepass.provider.js)
// -----------------------------------------------------------------------------

export const verifyPan = async (number) => {
  if (!PAN_REGEX.test(number)) {
    return {
      verified: false,
      reason: 'PAN must be 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F).',
      rawResponse: null,
      holderName: null,
    };
  }
  return {
    verified: true,
    reason: null,
    rawResponse: { stub: true },
    holderName: 'Mock Holder (stub)',
  };
};

export const verifyGstin = async (number) => {
  if (!GSTIN_REGEX.test(number)) {
    return { verified: false, reason: 'GSTIN format is invalid.', rawResponse: null, businessName: null };
  }
  return {
    verified: true,
    reason: null,
    rawResponse: { stub: true },
    businessName: 'Mock Business (stub)',
  };
};

export const verifyCin = async (number) => {
  if (!CIN_REGEX.test(number)) {
    return { verified: false, reason: 'CIN format is invalid.', rawResponse: null, companyName: null };
  }
  return {
    verified: true,
    reason: null,
    rawResponse: { stub: true },
    companyName: 'Mock Company (stub)',
  };
};

/**
 * Stubbed equivalent of Surepass's generate-otp.
 * Instead of sending an SMS, we generate an OTP, hash + cache it under a fake
 * providerClientId, and print it to the console so the dev can read it.
 */
export const sendAadhaarOtp = async (number) => {
  if (!AADHAAR_REGEX.test(number)) {
    return { sent: false, reason: 'Aadhaar must be 12 digits.', providerClientId: null, rawResponse: null };
  }

  const otp = generateOtp();
  const providerClientId = `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  stubOtpStore.set(providerClientId, hashOtp(otp));

  // ⚠️ STUB-ONLY: print the OTP so devs can complete the flow.
  console.log(`[STUB] Aadhaar OTP for clientId ${providerClientId}: ${otp}`);

  return {
    sent: true,
    reason: null,
    providerClientId,
    rawResponse: { stub: true },
  };
};

/**
 * Stubbed equivalent of Surepass's submit-otp. Looks up the cached hash by
 * providerClientId, compares to the user's input. One-time use — successful
 * verifications remove the entry from the cache.
 */
export const confirmAadhaarOtp = async ({ providerClientId, otp }) => {
  const expected = stubOtpStore.get(providerClientId);

  if (!expected) {
    return {
      verified: false,
      reason: 'Session not found or expired.',
      rawResponse: { stub: true },
    };
  }
  if (hashOtp(otp) !== expected) {
    return { verified: false, reason: 'Invalid OTP.', rawResponse: { stub: true } };
  }

  // One-time use.
  stubOtpStore.delete(providerClientId);
  return {
    verified: true,
    reason: null,
    rawResponse: { stub: true, mock: { fullName: 'Mock User (stub)' } },
  };
};
