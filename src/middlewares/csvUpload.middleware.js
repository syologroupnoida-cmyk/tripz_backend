import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = file.mimetype === 'text/csv'
      || file.mimetype === 'application/vnd.ms-excel'
      || file.originalname.toLowerCase().endsWith('.csv');
    callback(allowed ? null : new ApiError(415, 'Only CSV files are supported.'), allowed);
  },
});

export const uploadOfferCsv = (req, res, next) => {
  csvUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      return next(new ApiError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.message));
    }
    return next(error);
  });
};
