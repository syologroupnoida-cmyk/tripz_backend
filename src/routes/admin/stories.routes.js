import { Router } from 'express';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as storyController from '../../controllers/story.controller.js';
import {
  adminStoriesQuerySchema,
  hideStorySchema,
  hideStoryQuerySchema,
} from '../../validators/story.validator.js';

const router = Router();

// GET /api/v1/admin/stories (all stories — includes HIDDEN)
router.get('/',
  validateRequest(adminStoriesQuerySchema, 'query'),
  storyController.listStoriesForAdmin
);

// PATCH /api/v1/admin/stories/:id/hide?hidden=true|false
// Single endpoint for both hide and unhide. Body's `reason` used only when hiding.
router.patch('/:id/hide',
  validateRequest(hideStoryQuerySchema, 'query'),
  validateRequest(hideStorySchema),
  storyController.adminSetStoryVisibility
);

// DELETE /api/v1/admin/stories/:id (admin delete any)
router.delete('/:id', storyController.adminDeleteStory);

export default router;
