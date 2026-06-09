import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import vendorRoutes from './vendor.routes.js';

const router = Router();

router.use(authenticateUser, authorizeRoles(['VENDOR']));

router.use('/', vendorRoutes);
// Future: router.use('/subscription', subscriptionRoutes);
// Future: router.use('/leads', leadRoutes);

export default router;
