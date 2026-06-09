import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as kycRepo from '../repositories/vendorKyc.repository.js';

/**
 * Gate sensitive vendor routes behind an APPROVED KYC. Apply only to vendor
 * routes that require trust (taking leads, accepting bookings, listing trips).
 * Dashboard / profile / KYC-submission routes should stay open so the vendor
 * can finish onboarding.
 */
export const requireKycApproved = asyncHandler(async (req, _res, next) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required.');
  }
  if (req.user.role !== 'VENDOR') {
    return next();
  }

  const profile = await kycRepo.findVendorProfile(req.user.id);
  if (!profile) {
    throw ApiError.forbidden('Vendor profile not found.');
  }
  if (profile.kycStatus !== 'APPROVED') {
    throw new ApiError(
      403,
      'Your KYC must be approved before you can use this feature.',
      { code: 'KYC_REQUIRED', kycStatus: profile.kycStatus },
    );
  }
  return next();
});
