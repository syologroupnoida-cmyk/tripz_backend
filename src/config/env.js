import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z
      .string({ required_error: 'DATABASE_URL is required' })
      .url('DATABASE_URL must be a valid connection string'),

    JWT_ACCESS_SECRET: z
      .string({ required_error: 'JWT_ACCESS_SECRET is required' })
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),

    JWT_REFRESH_SECRET: z
      .string({ required_error: 'JWT_REFRESH_SECRET is required' })
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    BCRYPT_SALT_ROUNDS: z.coerce
      .number()
      .int()
      .min(10, 'BCRYPT_SALT_ROUNDS must be at least 10 for security')
      .max(15, 'BCRYPT_SALT_ROUNDS above 15 is too slow for production')
      .default(12),

    CORS_ORIGIN: z.string().default('*'),

    // ---- Email / SMTP ----
    SMTP_HOST: z.string({ required_error: 'SMTP_HOST is required' }).min(1),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default('false'),
    SMTP_USER: z.string({ required_error: 'SMTP_USER is required' }).min(1),
    SMTP_PASS: z.string({ required_error: 'SMTP_PASS is required' }).min(1),
    MAIL_FROM_NAME: z.string().default('Tripz'),
    MAIL_FROM_ADDRESS: z
      .string({ required_error: 'MAIL_FROM_ADDRESS is required' })
      .email('MAIL_FROM_ADDRESS must be a valid email'),

    // ---- OTP policy ----
    OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),

    // ---- Google OAuth ----
    GOOGLE_CLIENT_ID: z
      .string({ required_error: 'GOOGLE_CLIENT_ID is required' })
      .min(10, 'GOOGLE_CLIENT_ID looks invalid'),

    // ---- Cloudinary (file uploads) ----
    CLOUDINARY_CLOUD_NAME: z.string({ required_error: 'CLOUDINARY_CLOUD_NAME is required' }).min(1),
    CLOUDINARY_API_KEY: z.string({ required_error: 'CLOUDINARY_API_KEY is required' }).min(1),
    CLOUDINARY_API_SECRET: z.string({ required_error: 'CLOUDINARY_API_SECRET is required' }).min(1),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024), // 5 MB

    // ---- Surepass (KYC verification) ----
    // SUREPASS_TOKEN is intentionally OPTIONAL. When unset → backend runs in
    // STUB mode (mock responses, server-console OTPs). When set → real
    // Surepass HTTPS calls. Sandbox & live use the same base URL — the token
    // value determines which mode you hit.
    SUREPASS_TOKEN: z.string().min(10).optional(),
    SUREPASS_BASE_URL: z.string().url().default('https://kyc-api.surepass.io/api/v1'),
    SUREPASS_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  })
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values',
    path: ['JWT_REFRESH_SECRET'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  console.error('[env] Invalid environment variables:');
  for (const [key, messages] of Object.entries(fieldErrors)) {
    console.error(`  - ${key}: ${messages.join(', ')}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
