import { hashPassword } from '../../utils/password.js';
import * as userRepo from '../../repositories/user.repository.js';
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

  await issueAndSendVerificationOtp(user);

  return {
    user: sanitizeUser(user),
    emailVerificationRequired: true,
  };
};

export const registerAgent = async ({ firstName, lastName, email, phone, password }) => {
  await assertEmailAndPhoneAvailable({ email, phone });
  const passwordHash = await hashPassword(password);

  const user = await userRepo.createAgent({
    firstName,
    lastName,
    email,
    phone,
    password: passwordHash,
  });

  await issueAndSendVerificationOtp(user);

  return {
    user: sanitizeUser(user),
    emailVerificationRequired: true,
  };
};
