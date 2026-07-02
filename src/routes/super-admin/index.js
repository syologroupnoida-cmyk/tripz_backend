import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import superAdminRoutes from './superAdmin.routes.js';
import vendorsRoutes from './vendors.routes.js';
import subscriptionPlansRoutes from './subscriptionPlans.routes.js';
import subscriptionsRoutes from './subscriptions.routes.js';

const router = Router();

// Every route in this folder requires SUPER_ADMIN role.
router.use(authenticateUser, authorizeRoles(['SUPER_ADMIN']));

router.use('/', superAdminRoutes);
router.use('/vendors', vendorsRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);
router.use('/subscriptions', subscriptionsRoutes);
// Future: router.use('/lead-distribution', leadDistributionRoutes);

export default router;
