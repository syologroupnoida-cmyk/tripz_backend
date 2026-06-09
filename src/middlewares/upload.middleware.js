import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const baseMulter = multer({
  storage: multer.memoryStorage(),     // file lives in RAM just long enough to stream to Cloudinary
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) return cb(null, true);
    cb(new ApiError(415, `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIMETYPES].join(', ')}`));
  },
});

/**
 * Accept a single file field named `file`. Translates multer's specific
 * errors into ApiError so they flow through our standard error handler with
 * the right HTTP codes.
 */
export const uploadSingleFile = (req, res, next) => {
  baseMulter.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const mb = (env.UPLOAD_MAX_BYTES / (1024 * 1024)).toFixed(1);
        return next(new ApiError(413, `File too large. Max ${mb} MB allowed.`));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new ApiError(400, 'Unexpected file field. Use "file" as the form field name.'));
      }
      return next(new ApiError(400, err.message));
    }

    // ApiError (from fileFilter) or unknown — let the global handler deal with it.
    return next(err);
  });
};
