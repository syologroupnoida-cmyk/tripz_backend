import { Router } from 'express';
import { authenticateUser } from '../../middlewares/auth.middleware.js';
import { uploadSingleFile } from '../../middlewares/upload.middleware.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { uploadImageSchema } from '../../validators/upload.validator.js';
import * as uploadController from '../../controllers/upload.controller.js';

const router = Router();

// Order matters:
//   1. authenticateUser  → require a logged-in user
//   2. uploadSingleFile  → multer parses multipart/form-data into req.file + req.body
//   3. validateRequest   → Zod validates purpose (now available in req.body)
//   4. controller        → uploads to Cloudinary, returns URL

router.post(
  '/image',
  authenticateUser,
  uploadSingleFile,
  validateRequest(uploadImageSchema),
  uploadController.uploadImage,
);

export default router;
