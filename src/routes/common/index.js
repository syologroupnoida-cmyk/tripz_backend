import { Router } from 'express';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import uploadRoutes from './upload.routes.js';
import leadRoutes from './lead.routes.js';
import subscriptionPlansRoutes from './subscriptionPlans.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/uploads', uploadRoutes);
router.use('/leads', leadRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);

export default router;
