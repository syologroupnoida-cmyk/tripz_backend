import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../../middlewares/auth.middleware.js';
import clientRoutes from './client.routes.js';
import clientLeadsRoutes from './leads.routes.js';
import propertyBookingsRoutes from './propertyBookings.routes.js';
import offersRoutes from './offers.routes.js';

const router = Router();

router.use(authenticateUser, authorizeRoles(['CLIENT']));

router.use('/', clientRoutes);
router.use('/leads', clientLeadsRoutes);
router.use('/property-bookings', propertyBookingsRoutes);
router.use('/offers', offersRoutes);
// Future: router.use('/trip-requests', tripRequestRoutes);

export default router;
