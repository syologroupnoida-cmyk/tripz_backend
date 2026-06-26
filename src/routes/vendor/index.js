import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import vendorRoutes from './vendor.routes.js';
import walletRoutes from './wallet.routes.js';
import leadsRoutes from './leads.routes.js';

const router = Router();

router.use(authenticateUser, authorizeRoles(['VENDOR']));

router.use('/', vendorRoutes);
router.use('/wallet', walletRoutes);
router.use('/leads', leadsRoutes);

export default router;
