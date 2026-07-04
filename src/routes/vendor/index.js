import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import vendorRoutes from './vendor.routes.js';
import walletRoutes from './wallet.routes.js';
import leadsRoutes from './leads.routes.js';
import subscriptionPlansRoutes from './subscriptionPlans.routes.js';
import subscriptionsRoutes from './subscriptions.routes.js';
import packagesRoutes from './packages.routes.js';

const router = Router();

router.use(authenticateUser, authorizeRoles(['VENDOR']));

router.use('/', vendorRoutes);
router.use('/wallet', walletRoutes);
router.use('/leads', leadsRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/packages', packagesRoutes);

export default router;
