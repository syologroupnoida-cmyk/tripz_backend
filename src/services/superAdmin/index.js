import { hashPassword } from '../../utils/password.js';
import { ApiError } from '../../utils/ApiError.js';
import * as userRepo from '../../repositories/user.repository.js';

export const createAdminAccount = async ({ firstName, lastName, email, phone, password }) => {
  if (await userRepo.userExistsByEmail(email)) {
    throw ApiError.conflict('An account with this email already exists.');
  }
  if (await userRepo.userExistsByPhone(phone)) {
    throw ApiError.conflict('An account with this phone number already exists.');
  }

  const passwordHash = await hashPassword(password);

  const admin = await userRepo.createAdmin({
    firstName,
    lastName,
    email,
    phone,
    password: passwordHash,
  });

  return { admin };
};
