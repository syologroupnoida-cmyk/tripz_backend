import { Router } from 'express';
import * as blogController from '../../controllers/blog.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import {
  createBlogQuerySchema,
  createBlogSchema,
  listBlogsQuerySchema,
  updateBlogSchema,
} from '../../validators/blog.validator.js';

const router = Router();

router.get('/', validateRequest(listBlogsQuerySchema, 'query'), blogController.listBlogs);
router.post(
  '/',
  validateRequest(createBlogQuerySchema, 'query'),
  validateRequest(createBlogSchema),
  blogController.createBlog,
);
router.get('/:id', blogController.getBlog);
router.patch('/:id', validateRequest(updateBlogSchema), blogController.updateBlog);
router.delete('/:id', blogController.deleteBlog);

export default router;
