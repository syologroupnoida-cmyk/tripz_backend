import { Router } from 'express';
import storyRoutes from './story.routes.js';

const router = Router();

// Note: `authenticateUser` is applied per-route inside each sub-router
// (not at this router level) so that unauthenticated GETs like
// `/stories` (public browse) can fall through to `commonRoutes` when
// no authenticated route matches.
router.use('/stories', storyRoutes);

export default router;
