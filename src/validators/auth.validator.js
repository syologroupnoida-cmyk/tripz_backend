import { z } from 'zod';

export const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VENDOR', 'CLIENT'];

// Public-facing role names (in the payload) → internal Prisma UserRole.
export const PUBLIC_ROLE_TO_INTERNAL = {
  customer: 'CLIENT',
  agent: 'VENDOR',
};

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password must not exceed 72 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const nameField = z
  .string({ required_error: 'Required' })
  .trim()
  .min(2, 'Must be at least 2 characters long')
  .max(40, 'Must not exceed 40 characters');

const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Invalid email address');

const phoneField = z
  .string({ required_error: 'Phone is required' })
  .trim()
  .regex(/^\d{10,15}$/, 'Phone must be 10 to 15 digits');

export const registerSchema = z
  .object({
    firstName: nameField,
    lastName: nameField,
    email: emailField,
    phone: phoneField,
    password: passwordSchema,
    role: z.enum(['customer', 'agent'], {
      errorMap: () => ({ message: 'Role must be either "customer" or "agent"' }),
    }),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailField,
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required'),
  })
  .strict();

// refreshToken is optional in the body — web clients send it via httpOnly cookie,
// mobile/API clients send it in the JSON body. Controller enforces "one or the other".
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(20, 'Refresh token is invalid').optional(),
  })
  .strict();

export const logoutSchema = refreshTokenSchema;

export const verifyEmailSchema = z
  .object({
    email: emailField,
    otp: z
      .string({ required_error: 'OTP is required' })
      .trim()
      .regex(/^\d+$/, 'OTP must contain only digits')
      .min(4, 'OTP is too short')
      .max(10, 'OTP is too long'),
  })
  .strict();

export const resendOtpSchema = z
  .object({
    email: emailField,
  })
  .strict();

// ---- Password reset (OTP-based, mirrors verification flow) ----
export const forgotPasswordSchema = z
  .object({
    email: emailField,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    email: emailField,
    otp: z
      .string({ required_error: 'OTP is required' })
      .trim()
      .regex(/^\d+$/, 'OTP must contain only digits')
      .min(4, 'OTP is too short')
      .max(10, 'OTP is too long'),
    newPassword: passwordSchema,
  })
  .strict();

// ---- Google OAuth login ----
// `role` is only required when creating a brand-new account; existing users
// just send the token. Server enforces the "role required for new signup" rule.
export const googleLoginSchema = z
  .object({
    token: z
      .string({ required_error: 'Google ID token is required' })
      .min(20, 'Google token is invalid'),
    role: z.enum(['customer', 'agent']).optional(),
  })
  // .strict() rejects extra fields — we tolerate extras because frontend may
  // ship email/picture/etc for debugging. We always ignore them server-side.
  .passthrough();

// ---- Admin creation (SuperAdmin only) ----
export const createAdminSchema = z
  .object({
    firstName: nameField,
    lastName: nameField,
    email: emailField,
    phone: phoneField,
    password: passwordSchema,
  })
  .strict();
