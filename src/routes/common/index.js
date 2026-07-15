import { Router } from 'express';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import uploadRoutes from './upload.routes.js';
import leadRoutes from './lead.routes.js';
import subscriptionPlansRoutes from './subscriptionPlans.routes.js';
import packagesRoutes from './packages.routes.js';
import travelGuideRoutes from './travelGuide.routes.js';
import storyRoutes from './story.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/uploads', uploadRoutes);
router.use('/leads', leadRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);
router.use('/packages', packagesRoutes);
router.use('/travel-guide', travelGuideRoutes);
router.use('/stories', storyRoutes);

export default router;
