import { Router } from 'express';
import * as blogController from '../../controllers/blog.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { publicBlogsQuerySchema } from '../../validators/blog.validator.js';

const router = Router();

// Public endpoints: only active, non-deleted blogs are returned.
router.get('/', validateRequest(publicBlogsQuerySchema, 'query'), blogController.listBlogsPublic);
router.get('/:slug', blogController.getBlogPublic);

export default router;
