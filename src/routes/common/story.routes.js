import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as storyController from '../../controllers/story.controller.js';
import { publicStoriesQuerySchema } from '../../validators/story.validator.js';

const router = Router();

// GET /api/v1/stories (public — no auth)
router.get('/',
  validateRequest(publicStoriesQuerySchema, 'query'),
  storyController.listStoriesPublic
);

// GET /api/v1/stories/:slug (public detail by SEO slug)
router.get('/:slug', storyController.getStoryBySlugPublic);

export default router;
