import { Router } from 'express';
import {
  authenticateUser,
  authorizeRoles,
  requireVendorType,
} from '../../middlewares/auth.middleware.js';
import vendorRoutes from './vendor.routes.js';
import walletRoutes from './wallet.routes.js';
import leadsRoutes from './leads.routes.js';
import subscriptionPlansRoutes from './subscriptionPlans.routes.js';
import subscriptionsRoutes from './subscriptions.routes.js';
import packagesRoutes from './packages.routes.js';
import travelGuideRoutes from './travelGuide.routes.js';
import propertiesRoutes from './properties.routes.js';
import propertyBookingsRoutes from './propertyBookings.routes.js';

const router = Router();

router.use(authenticateUser, authorizeRoles(['VENDOR']));

// Shared across all vendor types (travel agents + property owners + future).
router.use('/', vendorRoutes);
router.use('/wallet', walletRoutes);
router.use('/leads', leadsRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);
router.use('/subscriptions', subscriptionsRoutes);

// TRAVEL_AGENT-only features — packages + travel guides. Property owners get
// a clear 403 with { code: 'VENDOR_TYPE_MISMATCH' } if they try to access.
router.use('/packages', requireVendorType('TRAVEL_AGENT'), packagesRoutes);
router.use('/travel-guide', requireVendorType('TRAVEL_AGENT'), travelGuideRoutes);

// PROPERTY_OWNER-only features — property listings + rooms + bookings dashboard.
// (requireVendorType('PROPERTY_OWNER') is applied inside each sub-router)
router.use('/properties', propertiesRoutes);
router.use('/property-bookings', propertyBookingsRoutes);

export default router;
