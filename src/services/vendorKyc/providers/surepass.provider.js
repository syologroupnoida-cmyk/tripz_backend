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
import {
  PAN_REGEX,
  GSTIN_REGEX,
  CIN_REGEX,
  AADHAAR_REGEX,
} from './_formats.js';

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
 * POST /api/v1/corporate/gstin
 * Verifies a GSTIN against the GST portal.
 * Response data: { gstin, business_name, legal_name, status, ... }
 */
export const verifyGstin = async (number) => {
  if (!GSTIN_REGEX.test(number)) {
    return { verified: false, reason: 'GSTIN format is invalid.', rawResponse: null, businessName: null };
  }
  const { data } = await surepassFetch('/corporate/gstin', { id_number: number });
  const verified = Boolean(data?.success && data?.data?.gstin);
  return {
    verified,
    reason: verified ? null : data?.message || 'GSTIN not found.',
    rawResponse: data,
    businessName: data?.data?.business_name ?? null,
  };
};

/**
 * POST /api/v1/corporate/company-details
 * Verifies a CIN against the MCA registry.
 * Response data: { cin, company_name, status, ... }
 */
export const verifyCin = async (number) => {
  if (!CIN_REGEX.test(number)) {
    return { verified: false, reason: 'CIN format is invalid.', rawResponse: null, companyName: null };
  }
  const { data } = await surepassFetch('/corporate/company-details', { id_number: number });
  const verified = Boolean(data?.success && data?.data?.cin);
  return {
    verified,
    reason: verified ? null : data?.message || 'CIN not found.',
    rawResponse: data,
    companyName: data?.data?.company_name ?? null,
  };
};

/**
 * POST /api/v1/aadhaar-v2/generate-otp
 * Triggers Surepass to send an OTP via SMS to the user's Aadhaar-linked phone.
 * Response data: { client_id, otp_sent: true }.
 * We MUST pass the returned client_id to confirm-otp later.
 */
export const sendAadhaarOtp = async (number) => {
  if (!AADHAAR_REGEX.test(number)) {
    return {
      sent: false,
      reason: 'Aadhaar must be 12 digits.',
      providerClientId: null,
      rawResponse: null,
    };
  }
  const { data } = await surepassFetch('/aadhaar-v2/generate-otp', { id_number: number });
  const sent = Boolean(data?.success && data?.data?.client_id);
  return {
    sent,
    reason: sent ? null : data?.message || 'Could not send Aadhaar OTP.',
    providerClientId: data?.data?.client_id ?? null,
    rawResponse: data,
  };
};

/**
 * POST /api/v1/aadhaar-v2/submit-otp
 * Verifies the OTP the user typed against the session referenced by client_id.
 * Surepass verifies against UIDAI; we never see the actual OTP value.
 * Response data: { client_id, full_name, dob, address, ... }
 */
export const confirmAadhaarOtp = async ({ providerClientId, otp }) => {
  const { data } = await surepassFetch('/aadhaar-v2/submit-otp', {
    client_id: providerClientId,
    otp,
  });
  const verified = Boolean(data?.success && data?.data);
  return {
    verified,
    reason: verified ? null : data?.message || 'Invalid OTP or session expired.',
    rawResponse: data,
  };
};
