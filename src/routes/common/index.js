import { Router } from 'express';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import uploadRoutes from './upload.routes.js';
import leadRoutes from './lead.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/uploads', uploadRoutes);
router.use('/leads', leadRoutes);

export default router;
