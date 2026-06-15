import { z } from 'zod';

export const UPLOAD_PURPOSES = [
  'kyc-pan',
  'kyc-aadhaar',
  'company-logo',
  'avatar',
  'other',
];

export const uploadImageSchema = z
  .object({
    purpose: z.enum(UPLOAD_PURPOSES, {
      errorMap: () => ({
        message: `purpose must be one of: ${UPLOAD_PURPOSES.join(', ')}`,
      }),
    }),
  })
  // Multer puts non-file form fields in req.body as plain strings; passthrough
  // tolerates any other fields the frontend might attach.
  .passthrough();
