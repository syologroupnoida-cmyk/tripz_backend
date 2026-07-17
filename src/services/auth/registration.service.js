import { hashPassword } from '../../utils/password.js';
import * as userRepo from '../../repositories/user.repository.js';
import * as leadRepo from '../../repositories/lead.repository.js';
import {
  sanitizeUser,
  assertEmailAndPhoneAvailable,
  issueAndSendVerificationOtp,
} from './_helpers.js';

export const registerCustomer = async ({ firstName, lastName, email, phone, password }) => {
  await assertEmailAndPhoneAvailable({ email, phone });
  const passwordHash = await hashPassword(password);

  const user = await userRepo.createCustomer({
    firstName,
    lastName,
    email,
    phone,
    password: passwordHash,
  });

  // Auto-link any anonymous leads this customer submitted with the same email
  // BEFORE they had an account. Fast indexed lookup; counts even if zero.
  const claimedLeadsCount = await leadRepo.claimLeadsForEmail({
    userId: user.id,
    email,
  });

  const otp = await issueAndSendVerificationOtp(user);

  return {
    user: sanitizeUser(user),
    emailVerificationRequired: true,
    claimedLeadsCount,
    otp,
  };
};

export const registerAgent = async ({
  firstName,
  lastName,
  email,
  phone,
  password,
  vendorType = 'TRAVEL_AGENT',
}) => {
  await assertEmailAndPhoneAvailable({ email, phone });
  const passwordHash = await hashPassword(password);

  const user = await userRepo.createAgent({
    firstName,
    lastName,
    email,
    phone,
    password: passwordHash,
    vendorType,
  });

  const otp = await issueAndSendVerificationOtp(user);

  // sanitizeUser needs the vendorProfile fields (vendorType + kycStatus) to
  // include them in the response — pass them here since we just created it.
  return {
    user: sanitizeUser(user, {
      vendorProfile: { vendorType, kycStatus: 'PENDING' },
    }),
    emailVerificationRequired: true,
    otp,
  };
};
