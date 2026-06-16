import { z } from 'zod';

export const UPLOAD_PURPOSES = [
  'kyc-pan',
  'kyc-aadhaar',
  'company-logo',
  'avatar',
  'favicon_icon',
  'header_logo',
  'other',
];

// Optional `name` — when provided, the file is stored at
//   tripz/<purpose>/<userId>/<name>
// (with the extension chosen automatically by Cloudinary). Useful for
// "logical" identifiers like "pan-card" or "company-logo" so the file can be
// re-uploaded under the same slot (overwrites the previous version).
// Strict format so people can't sneak path traversal or weird Unicode into
// the public_id. Cloudinary's filename rules: alphanumeric, dash, underscore.
const nameField = z
  .string()
  .trim()
  .min(1, 'name cannot be empty')
  .max(80, 'name must not exceed 80 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'name may only contain letters, numbers, dashes and underscores')
  .optional()
  // Empty string from form-data → undefined (treat as not sent)
  .or(z.literal('').transform(() => undefined));

export const uploadImageSchema = z
  .object({
    purpose: z.enum(UPLOAD_PURPOSES, {
      errorMap: () => ({
        message: `purpose must be one of: ${UPLOAD_PURPOSES.join(', ')}`,
      }),
    }),
    name: nameField,
  })
  // Multer puts non-file form fields in req.body as plain strings; passthrough
  // tolerates any other fields the frontend might attach.
  .passthrough();
