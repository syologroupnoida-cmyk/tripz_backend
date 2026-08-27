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

// Flip to false once the commented-out real Surepass calls below are
// restored. Read by providers/index.js to keep the boot log (and anything
// else that cares) honest about whether we're actually hitting Surepass.
export const BYPASS_MODE = true;

// -----------------------------------------------------------------------------
//   Low-level HTTP helper — Bearer auth + timeout + error mapping
// -----------------------------------------------------------------------------

const surepassFetch = async (path, body, method = 'POST') => {
  const url = `${env.SUREPASS_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.SUREPASS_TIMEOUT_MS);

  try {
    const fetchOptions = {
      method,
      headers: {
        'Authorization': `Bearer ${env.SUREPASS_TOKEN}`,
        'Content-Type': 'application/json', // ADDED THIS
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*', // KEPT ONLY ONE ACCEPT
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Origin': `https://api.trip-z.in/`, // CHANGE THIS TO YOUR REAL DOMAIN
        'Referer': 'https://api.trip-z.in/' // CHANGE THIS TO YOUR REAL DOMAIN
      },
      signal: controller.signal,
    };
    if (method !== 'GET' && body != null) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(url, fetchOptions);

    const data = await res.json().catch(() => ({}));
    console.log('this is the data', data);
    console.log('this is the response', res);

    if(res.status === 401){
    console.log('this is the response error status 401', res);

    }

      if(res.status === 403){
    console.log('this is the response error status 403', res);

    }

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

  // ================================================================
  //  BYPASS MODE — Surepass PAN verification DISABLED
  //  To re-enable: uncomment the block below and delete the bypass
  //  return statement.
  // ================================================================
  // const { data } = await surepassFetch('/pan/pan', { id_number: number });
  // const verified = Boolean(data?.success && data?.data?.pan_number);
  // return {
  //   verified,
  //   reason: verified ? null : data?.message || 'PAN not found in records.',
  //   rawResponse: data,
  //   holderName: data?.data?.full_name ?? null,
  // };

  // BYPASS: format valid → accept the document (pending admin manual review).
  // No fake holder name — admin will confirm identity offline during KYC review.
  console.log('[surepass:BYPASS] PAN verification bypassed for', number);
  return {
    verified: true,
    reason: 'Auto-accepted in bypass mode. Pending admin manual review.',
    rawResponse: { bypassed: true, mode: 'MANUAL_BYPASS', panNumber: number },
    holderName: null,
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

  // ================================================================
  //  BYPASS MODE — Surepass DigiLocker initiation DISABLED
  //  To re-enable: uncomment the block below and delete the bypass
  //  return statement.
  // ================================================================
  // const { data } = await surepassFetch('/digilocker/initialize', {
  //   data: {
  //     redirect_url: env.SUREPASS_REDIRECT_URL,
  //     expiry_minutes: 10,
  //     skip_main_screen: false,
  //     signup_flow: false,
  //     send_sms: false,
  //     send_email: false,
  //     verify_phone: false,
  //     verify_email: false,
  //   },
  // });
  //
  // // Sent = Surepass accepted the initiation (we have at minimum a client_id).
  // const providerClientId = data?.data?.client_id ?? null;
  // const sent = Boolean(data?.success && providerClientId);
  //
  // // Convert expiry_seconds → ISO date for downstream consistency.
  // const expirySeconds = data?.data?.expiry_seconds;
  // const expiresAt =
  //   typeof expirySeconds === 'number'
  //     ? new Date(Date.now() + expirySeconds * 1000).toISOString()
  //     : null;
  //
  // return {
  //   sent,
  //   reason: sent ? null : data?.message || 'Could not initiate Aadhaar validation.',
  //   providerClientId,
  //   // Opaque session token Surepass returns — store it so fetch-status / status
  //   // endpoints can include it if they require it.
  //   providerToken: data?.data?.token ?? null,
  //   // DigiLocker SDK URL. Frontend opens this URL (popup / window.location).
  //   redirectUrl: data?.data?.url ?? null,
  //   expiresAt,
  //   rawResponse: data,
  // };

  // BYPASS: format valid → return fake client_id / URL so frontend flow continues
  console.log('[surepass:BYPASS] Aadhaar initiation bypassed for', number);
  const bypassClientId = `digilocker_BYPASS_${Date.now()}`;
  return {
    sent: true,
    reason: null,
    providerClientId: bypassClientId,
    providerToken: 'BYPASS_TOKEN',
    // Frontend opens this — points straight at your callback so the flow
    // completes instantly without a real DigiLocker session.
    redirectUrl: `${env.SUREPASS_REDIRECT_URL}?bypassed=true&client_id=${bypassClientId}`,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    rawResponse: { bypassed: true, mode: 'MANUAL_BYPASS', aadhaarNumber: number },
  };
};

/**
 * GET /api/v1/digilocker/download-aadhaar/<client_id>
 *
 * Called AFTER the user finishes DigiLocker auth. Surepass returns the verified
 * Aadhaar details against the client_id we got from /digilocker/initialize.
 *
 * Note: this is a GET request, NOT POST, and the client_id goes in the URL
 * path (not the body). The prefixed form (`digilocker_xxxxx`) is what Surepass
 * expects — DON'T strip the prefix.
 *
 * Confirmed Surepass response shape:
 *   {
 *     data: {
 *       client_id: "digilocker_12345ABCDE",
 *       digilocker_metadata: {
 *         name:          "RAHUL KUMAR",
 *         gender:        "M",
 *         dob:           "1995-05-15",
 *         mobile_number: "9876543210"
 *       }
 *       // ...also typically: aadhaar_number, address, photo_link, xml_url
 *     }
 *   }
 *
 * Failure case (user hasn't completed DigiLocker yet, or session expired):
 *   { success: false, message: "..." }
 */
export const completeAadhaarVerification = async ({ providerClientId }) => {
  // ================================================================
  //  BYPASS MODE — Surepass DigiLocker complete DISABLED
  //  To re-enable: uncomment the block below and delete the bypass
  //  return statement.
  // ================================================================
  // const { data } = await surepassFetch(
  //   `/digilocker/download-aadhaar/${encodeURIComponent(providerClientId)}`,
  //   null,
  //   'GET',
  // );
  //
  // const metadata = data?.data?.digilocker_metadata ?? null;
  // const verified = Boolean(data?.data && metadata);
  //
  // return {
  //   verified,
  //   reason: verified
  //     ? null
  //     : data?.message || 'Aadhaar verification not yet complete or session expired.',
  //   holderName: metadata?.name ?? null,
  //   metadata, // pass through dob, gender, mobile_number to the caller
  //   rawResponse: data,
  // };

  // BYPASS: accept the document (pending admin manual review).
  // No fake name/dob/gender — admin will confirm the vendor's identity
  // offline against uploaded document image during KYC review.
  console.log('[surepass:BYPASS] Aadhaar complete bypassed for', providerClientId);
  return {
    verified: true,
    reason: 'Auto-accepted in bypass mode. Pending admin manual review.',
    holderName: null,
    metadata: null,
    rawResponse: { bypassed: true, mode: 'MANUAL_BYPASS', providerClientId },
  };
};
