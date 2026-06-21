import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import superAdminRoutes from './superAdmin.routes.js';
import vendorsRoutes from './vendors.routes.js';

const router = Router();

// Every route in this folder requires SUPER_ADMIN role.
router.use(authenticateUser, authorizeRoles(['SUPER_ADMIN']));

router.use('/', superAdminRoutes);
router.use('/vendors', vendorsRoutes);
// Future: router.use('/vendor-plans', vendorPlanRoutes);
// Future: router.use('/lead-distribution', leadDistributionRoutes);

export default router;
