import { Router } from 'express';
import { authenticateUser } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import * as storyController from '../../controllers/story.controller.js';
import {
  createStorySchema,
  updateStorySchema,
  myStoriesQuerySchema,
} from '../../validators/story.validator.js';

const router = Router();

// `authenticateUser` applied per-route (not router-level) so requests to
// public paths like GET `/stories` fall through to commonRoutes without
// hitting a 401 here first.

// POST /api/v1/stories (any authenticated user creates)
router.post('/',
  authenticateUser,
  validateRequest(createStorySchema),
  storyController.createStory
);

// GET /api/v1/stories/mine (list own — includes HIDDEN ones)
router.get('/mine',
  authenticateUser,
  validateRequest(myStoriesQuerySchema, 'query'),
  storyController.listMyStories
);

// GET /api/v1/stories/mine/:id (own detail)
router.get('/mine/:id',
  authenticateUser,
  storyController.getMyStoryDetail
);

// PATCH /api/v1/stories/:id (edit own)
router.patch('/:id',
  authenticateUser,
  validateRequest(updateStorySchema),
  storyController.updateStory
);

// DELETE /api/v1/stories/:id (soft delete own)
router.delete('/:id',
  authenticateUser,
  storyController.deleteOwnStory
);

export default router;
