// =============================================================================
//   Provider picker — chooses Surepass vs. Stub at process start
// =============================================================================
//
// Importers (the business service) get a single `provider` object exposing
// the unified verification interface. They never check env or know which
// concrete provider they're calling — that's the whole point.
//
// To add a new provider (Razorpay, IDfy, Zoop, etc.):
//   1. Create `<name>.provider.js` exporting the same 5 functions + PROVIDER_NAME.
//   2. Add a corresponding env var (e.g., RAZORPAY_KYC_TOKEN).
//   3. Update the selection logic below.
//
// To switch the active provider in production:
//   Set the env var. No code changes here.
// =============================================================================

import { env } from '../../../config/env.js';
import * as surepass from './surepass.provider.js';
import * as stub from './stub.provider.js';
import pc from 'picocolors';

// Selection rule: if SUREPASS_TOKEN is configured, use Surepass; else stub.
// Future: add `process.env.KYC_PROVIDER === 'razorpay' ? razorpay : ...` here.
const active = env.SUREPASS_TOKEN ? surepass : stub;

export const provider = active;
export const PROVIDER_NAME = active.PROVIDER_NAME;

/**
 * Called once at boot to print which mode the process is in. Loud warning if
 * the stub is active so it can't be shipped to prod silently.
 */
export const logKycVerificationMode = () => {
  if (PROVIDER_NAME === 'SUREPASS' && active.BYPASS_MODE) {
    console.log(
    pc.dim('[kyc] Verification mode: ') +
      pc.yellow('MANUAL') +
      pc.dim(' (SurePass not integrated — decisions go through admin review only)'),
  );
  } else if (PROVIDER_NAME === 'SUREPASS') {
    console.log(`[kyc] Document verification: LIVE via Surepass (${env.SUREPASS_BASE_URL})`);
  } else {
    console.warn(
      '[kyc] Document verification: STUB MODE — no SUREPASS_TOKEN set. ' +
        'Verifications return mock results. Do NOT use in production.',
    );
  }
};
