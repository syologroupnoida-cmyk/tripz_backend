import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

export const hashPassword = async (plainPassword) => {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('hashPassword: plainPassword must be a non-empty string.');
  }
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
};

export const comparePassword = async (plainPassword, hashedPassword) => {
  if (!plainPassword || !hashedPassword) return false;
  return bcrypt.compare(plainPassword, hashedPassword);
};
