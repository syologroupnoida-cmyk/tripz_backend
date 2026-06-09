import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import adminRoutes from './admin.routes.js';

const router = Router();

// SUPER_ADMIN can do everything ADMIN can — both roles allowed here.
router.use(authenticateUser, authorizeRoles(['SUPER_ADMIN', 'ADMIN']));

router.use('/', adminRoutes);

export default router;
