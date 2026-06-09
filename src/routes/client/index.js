import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import clientRoutes from './client.routes.js';

const router = Router();

router.use(authenticateUser, authorizeRoles(['CLIENT']));

router.use('/', clientRoutes);
// Future: router.use('/trip-requests', tripRequestRoutes);

export default router;
