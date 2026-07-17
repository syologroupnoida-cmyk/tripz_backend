import prisma from '../config/db.js';
import { createUserWithGeneratedId } from '../utils/userId.js';

const PUBLIC_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  emailVerifiedAt: true,
  avatarUrl: true,
  authProvider: true,
  createdAt: true,
};

export const createCustomer = async ({ firstName, lastName, email, phone, password }) => {
  return createUserWithGeneratedId('CLIENT', ({ id }) =>
    prisma.user.create({
      data: {
        id,
        firstName,
        lastName,
        email,
        phone,
        password,
        role: 'CLIENT',
        authProvider: 'LOCAL',
        customerProfile: { create: {} },
      },
      select: PUBLIC_USER_SELECT,
    }),
  );
};

export const createAgent = async ({
  firstName,
  lastName,
  email,
  phone,
  password,
  vendorType = 'TRAVEL_AGENT', // Default keeps existing signup flow working.
}) => {
  return createUserWithGeneratedId('VENDOR', ({ id }) =>
    prisma.user.create({
      data: {
        id,
        firstName,
        lastName,
        email,
        phone,
        password,
        role: 'VENDOR',
        authProvider: 'LOCAL',
        // VendorProfile carries the business type (TRAVEL_AGENT / PROPERTY_OWNER / ...)
        // + kycStatus = PENDING; vendor submits KYC separately.
        vendorProfile: { create: { vendorType } },
      },
      select: PUBLIC_USER_SELECT,
    }),
  );
};

export const createAdmin = async ({ firstName, lastName, email, phone, password }) => {
  return createUserWithGeneratedId('ADMIN', ({ id }) =>
    prisma.user.create({
      data: {
        id,
        firstName,
        lastName,
        email,
        phone,
        password,
        role: 'ADMIN',
        authProvider: 'LOCAL',
        // Admins are pre-verified by SuperAdmin — no OTP flow.
        emailVerifiedAt: new Date(),
      },
      select: PUBLIC_USER_SELECT,
    }),
  );
};

// ---- Google OAuth creation ----

export const createCustomerViaGoogle = async ({
  firstName,
  lastName,
  email,
  googleId,
  avatarUrl,
}) => {
  return createUserWithGeneratedId('CLIENT', ({ id }) =>
    prisma.user.create({
      data: {
        id,
        firstName,
        lastName,
        email,
        googleId,
        avatarUrl,
        role: 'CLIENT',
        authProvider: 'GOOGLE',
        // Google already verified the email — skip the OTP flow.
        emailVerifiedAt: new Date(),
        customerProfile: { create: {} },
      },
      select: PUBLIC_USER_SELECT,
    }),
  );
};

export const createAgentViaGoogle = async ({
  firstName,
  lastName,
  email,
  googleId,
  avatarUrl,
  vendorType = 'TRAVEL_AGENT',
}) => {
  return createUserWithGeneratedId('VENDOR', ({ id }) =>
    prisma.user.create({
      data: {
        id,
        firstName,
        lastName,
        email,
        googleId,
        avatarUrl,
        role: 'VENDOR',
        authProvider: 'GOOGLE',
        emailVerifiedAt: new Date(),
        // KYC still required — vendorProfile.kycStatus defaults to PENDING.
        vendorProfile: { create: { vendorType } },
      },
      select: PUBLIC_USER_SELECT,
    }),
  );
};

// ---- Lookups ----

export const findUserByEmail = async (email) => {
  return prisma.user.findUnique({ where: { email } });
};

export const findUserByGoogleId = async (googleId) => {
  return prisma.user.findUnique({ where: { googleId } });
};

export const findUserById = async (id) => {
  return prisma.user.findUnique({
    where: { id },
    select: { ...PUBLIC_USER_SELECT, updatedAt: true },
  });
};

export const userExistsByEmail = async (email) => {
  const found = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return Boolean(found);
};

export const userExistsByPhone = async (phone) => {
  const found = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  });
  return Boolean(found);
};

// ---- Mutations ----

export const markEmailVerified = async (id) => {
  return prisma.user.update({
    where: { id },
    data: { emailVerifiedAt: new Date() },
    select: PUBLIC_USER_SELECT,
  });
};

export const updateUserPassword = async (id, passwordHash) => {
  return prisma.user.update({
    where: { id },
    data: { password: passwordHash },
    select: PUBLIC_USER_SELECT,
  });
};

/**
 * Attach a Google identity to an existing user account. Promotes LOCAL → HYBRID
 * (so the user keeps password login) and confirms email verification — Google's
 * `email_verified: true` is at least as strong as our OTP flow.
 */
export const linkGoogleAccount = async ({ userId, googleId, avatarUrl, hasPassword }) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      googleId,
      // Don't overwrite an existing avatar with null if Google returns none.
      ...(avatarUrl ? { avatarUrl } : {}),
      authProvider: hasPassword ? 'HYBRID' : 'GOOGLE',
      emailVerifiedAt: new Date(),
    },
    select: PUBLIC_USER_SELECT,
  });
};
