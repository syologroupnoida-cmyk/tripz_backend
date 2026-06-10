import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import marketplaceRoutes from './marketplace.routes.js';

const router = Router();

router.use(authenticateUser, authorizeRoles(['VENDOR']));
router.use('/', marketplaceRoutes);

export default router;
