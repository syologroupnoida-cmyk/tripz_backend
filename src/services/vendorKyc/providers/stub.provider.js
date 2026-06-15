// =============================================================================
//   Stub provider — local mock for dev when SUREPASS_TOKEN is not configured
// =============================================================================
//
// Mirrors the public API of surepass.provider.js exactly, so the business
// service has zero idea which one it's talking to.
//
// What it does:
//   • PAN: format-only regex check, always "verified" if the number is
//     well-formed.
//   • Aadhaar: simulates the DigiLocker handoff — initiate returns a fake
//     redirect URL + client_id; complete auto-returns mock verified data
//     against any client_id that initiate handed out.
//
// Lifetime of stub state:
//   The session Set lives for the lifetime of the Node process. Restarting
//   the server discards all pending sessions — fine for dev. Don't ship to
//   prod with the stub provider active (boot-time log warns about this).
// =============================================================================

import { PAN_REGEX, AADHAAR_REGEX } from './_formats.js';

export const PROVIDER_NAME = 'STUB';

// Tracks which fake client_ids are "in progress". Cleared on process restart.
const stubOtpStore = new Set();

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

/**
 * Stubbed equivalent of Surepass's /digilocker/initialize. Returns a fake
 * redirect URL + client_id so the rest of the flow has something to chew on.
 * The stub's "complete" step auto-verifies any client_id that this function
 * issued — no real OTP exchange needed.
 */
export const initiateAadhaarVerification = async (number) => {
  if (!AADHAAR_REGEX.test(number)) {
    return {
      sent: false,
      reason: 'Aadhaar must be 12 digits.',
      providerClientId: null,
      redirectUrl: null,
      expiresAt: null,
      rawResponse: null,
    };
  }

  const providerClientId = `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  stubOtpStore.add(providerClientId);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const redirectUrl = `https://stub-digilocker.local/auth?client_id=${providerClientId}`;

  console.log(`[STUB] DigiLocker simulated session: clientId=${providerClientId}`);
  console.log(`[STUB] (simulated redirect URL: ${redirectUrl})`);

  return {
    sent: true,
    reason: null,
    providerClientId,
    redirectUrl,
    expiresAt,
    rawResponse: { stub: true },
  };
};

/**
 * Stubbed equivalent of Surepass's /digilocker/get-aadhaar. The DigiLocker
 * flow handles the OTP outside the app, so the stub just verifies that the
 * initiate session existed and auto-returns mock data.
 */
export const completeAadhaarVerification = async ({ providerClientId }) => {
  if (!stubOtpStore.has(providerClientId)) {
    return {
      verified: false,
      reason: 'Session not found or expired.',
      holderName: null,
      rawResponse: { stub: true },
    };
  }

  // One-time use.
  stubOtpStore.delete(providerClientId);
  return {
    verified: true,
    reason: null,
    holderName: 'Mock User (stub)',
    rawResponse: { stub: true, mock: { fullName: 'Mock User (stub)' } },
  };
};
