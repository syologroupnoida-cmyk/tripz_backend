import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import adminRoutes from './admin.routes.js';
import vendorsRoutes from './vendors.routes.js';
import leadsRoutes from './leads.routes.js';
import subscriptionPlansRoutes from './subscriptionPlans.routes.js';
import subscriptionsRoutes from './subscriptions.routes.js';
import packagesRoutes from './packages.routes.js';
import storiesRoutes from './stories.routes.js';

const router = Router();

// SUPER_ADMIN can do everything ADMIN can — both roles allowed here.
router.use(authenticateUser, authorizeRoles(['SUPER_ADMIN', 'ADMIN']));

router.use('/', adminRoutes);
router.use('/vendors', vendorsRoutes);
router.use('/leads', leadsRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/packages', packagesRoutes);
router.use('/stories', storiesRoutes);

export default router;
