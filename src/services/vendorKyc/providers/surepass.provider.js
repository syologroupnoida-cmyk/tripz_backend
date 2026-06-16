// =============================================================================
//   Surepass provider — real KYC verification via surepass.io
// =============================================================================
//
// This file is the integration boundary for Surepass. Every function here:
//   • makes an HTTPS call to surepass.io
//   • parses Surepass's response envelope
//   • returns a normalized result the business service understands
//
// Surepass's standard response envelope:
//   {
//     success:     boolean,           // true means call succeeded — NOT that the
//                                     //   record is necessarily valid; check inner data too
//     status_code: number,
//     message:     string | null,
//     data: { client_id, ...endpoint-specific-fields }
//   }
//
// To swap providers later (Razorpay, IDfy, etc.):
//   • Write a new file like `razorpay.provider.js` exposing the same 5 exports
//     + PROVIDER_NAME.
//   • Edit `providers/index.js` to import + return the new provider.
//   • Nothing in `documentVerification.service.js` changes.
// =============================================================================

import { env } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';
import { PAN_REGEX, AADHAAR_REGEX } from './_formats.js';

export const PROVIDER_NAME = 'SUREPASS';

// -----------------------------------------------------------------------------
//   Low-level HTTP helper — Bearer auth + timeout + error mapping
// -----------------------------------------------------------------------------

const surepassFetch = async (path, body) => {
  const url = `${env.SUREPASS_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.SUREPASS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUREPASS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    console.log('this is the data', data)
    // Auth / config errors — surface loudly. A wrong token MUST NOT silently
    // degrade into "every verification fails."
    if (res.status === 401 || res.status === 403) {
      console.error('[surepass] Auth rejected by provider. Check SUREPASS_TOKEN.');
      throw ApiError.internal('Verification provider authentication failed.');
    }

    if (res.status >= 500) {
      throw new ApiError(503, 'Verification provider is temporarily unavailable.');
    }

    return { ok: res.ok, data };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(504, 'Verification provider timed out.');
    }
    if (err instanceof ApiError) throw err;
    console.error('[surepass] Network error:', err);
    console.error('[surepass] Network error:', err?.message);
    throw new ApiError(503, 'Could not reach verification provider.');
  } finally {
    clearTimeout(timeout);
  }
};

// -----------------------------------------------------------------------------
//   Public verification API (must match stub.provider.js exactly)
// -----------------------------------------------------------------------------

/**
 * POST /api/v1/pan/pan
 * Verifies a PAN against the Income Tax Department records.
 * Response data: { pan_number, full_name, category, ... }
 */
export const verifyPan = async (number) => {
  if (!PAN_REGEX.test(number)) {
    return {
      verified: false,
      reason: 'PAN must be 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F).',
      rawResponse: null,
      holderName: null,
    };
  }
  const { data } = await surepassFetch('/pan/pan', { id_number: number });
  const verified = Boolean(data?.success && data?.data?.pan_number);
  return {
    verified,
    reason: verified ? null : data?.message || 'PAN not found in records.',
    rawResponse: data,
    holderName: data?.data?.full_name ?? null,
  };
};

/**
 * POST /api/v1/digilocker/initialize
 *
 * Surepass's DigiLocker product — returns a SDK URL the user opens to
 * authenticate against DigiLocker (where OTP is sent and validated by
 * UIDAI). The `/aadhaar-validation/*` endpoints are a SEPARATE Surepass
 * product that only does a basic UIDAI existence check (no OTP, no URL).
 *
 * Request body (mirrors the Surepass dashboard's "Digilocker Via Link" form):
 *   {
 *     "data": {
 *       "redirect_url":     "https://trip-z.in/kyc/aadhaar-callback",  // REQUIRED, https only
 *       "expiry_minutes":   10,
 *       "skip_main_screen": false,
 *       "signup_flow":      false,
 *       "send_sms":         false,
 *       "send_email":       false,
 *       "verify_phone":     false,
 *       "verify_email":     false
 *     }
 *   }
 *
 * Confirmed real response shape (Surepass sandbox, 2026):
 *   {
 *     success: true,
 *     data: {
 *       client_id:      "digilocker_sHpvzgMztbgYggFYkizo",   // prefixed with "digilocker_"
 *       token:          ".eJyrVk...aivU0g.-6L3i_n...",        // opaque session token
 *       url:            "https://digilocker-sdk.notbot.in/?gateway=sandbox&type=digilocker&token=...&auth_type=web",
 *       expiry_seconds: 600
 *     }
 *   }
 *
 * Flow:
 *   1. Backend POSTs to /digilocker/initialize (this function).
 *   2. Surepass returns the DigiLocker SDK URL.
 *   3. Frontend opens that URL (popup / window.location).
 *   4. User enters their Aadhaar on DigiLocker → OTP to Aadhaar-linked phone
 *      → validates with UIDAI.
 *   5. DigiLocker redirects user to env.SUREPASS_REDIRECT_URL.
 *   6. Frontend's callback page calls /vendor/kyc/verify/aadhaar/complete.
 *   7. Backend calls /digilocker/get-aadhaar to fetch the verified details.
 *
 * The Aadhaar number is NOT sent here — DigiLocker collects it on its own UI.
 * `number` is still passed in so we can short-circuit obviously-malformed input
 * and persist it locally against the document row for the vendor's own record.
 */
export const initiateAadhaarVerification = async (number) => {
  if (!AADHAAR_REGEX.test(number)) {
    return {
      sent: false,
      reason: 'Aadhaar must be 12 digits.',
      providerClientId: null,
      providerToken: null,
      redirectUrl: null,
      expiresAt: null,
      rawResponse: null,
    };
  }
  const { data } = await surepassFetch('/digilocker/initialize', {
    data: {
      redirect_url: env.SUREPASS_REDIRECT_URL,
      expiry_minutes: 10,
      skip_main_screen: false,
      signup_flow: false,
      send_sms: false,
      send_email: false,
      verify_phone: false,
      verify_email: false,
    },
  });

  // Sent = Surepass accepted the initiation (we have at minimum a client_id).
  const providerClientId = data?.data?.client_id ?? null;
  const sent = Boolean(data?.success && providerClientId);

  // Convert expiry_seconds → ISO date for downstream consistency.
  const expirySeconds = data?.data?.expiry_seconds;
  const expiresAt =
    typeof expirySeconds === 'number'
      ? new Date(Date.now() + expirySeconds * 1000).toISOString()
      : null;

  return {
    sent,
    reason: sent ? null : data?.message || 'Could not initiate Aadhaar validation.',
    providerClientId,
    // Opaque session token Surepass returns — store it so fetch-status / status
    // endpoints can include it if they require it.
    providerToken: data?.data?.token ?? null,
    // DigiLocker SDK URL. Frontend opens this URL (popup / window.location).
    redirectUrl: data?.data?.url ?? null,
    expiresAt,
    rawResponse: data,
  };
};

/**
 * POST /api/v1/digilocker/get-aadhaar
 *
 * Called AFTER the user finishes DigiLocker auth. Surepass returns the verified
 * Aadhaar details against the client_id we got from /digilocker/initialize.
 *
 * Surepass returns client_id with a "digilocker_" prefix in the initialize
 * response (e.g., "digilocker_mdCFNcJgHgcXflyYJtRh"), but the redirect URL
 * back to your app strips the prefix (just "mdCFNcJgHgcXflyYJtRh"). Their
 * fetch endpoint typically expects the UNPREFIXED version, so we strip it
 * before sending. If your account expects the prefixed version, change the
 * `stripPrefix` arg below.
 *
 * Success response (typical):
 *   {
 *     success: true,
 *     data: {
 *       client_id, full_name, dob, gender, address, photo_link, aadhaar_number, ...
 *     }
 *   }
 *
 * Failure case (user hasn't completed DigiLocker yet, or session expired):
 *   { success: false, message: "..." }
 */
const stripDigilockerPrefix = (id) =>
  typeof id === 'string' ? id.replace(/^digilocker_/, '') : id;

export const completeAadhaarVerification = async ({ providerClientId }) => {
  const cleanClientId = stripDigilockerPrefix(providerClientId);

  const { data } = await surepassFetch('/digilocker/get-aadhaar', {
    client_id: cleanClientId,
  });

  const verified = Boolean(data?.success && data?.data);
  return {
    verified,
    reason: verified ? null : data?.message || 'Aadhaar verification not yet complete or session expired.',
    holderName: data?.data?.full_name ?? null,
    rawResponse: data,
  };
};
