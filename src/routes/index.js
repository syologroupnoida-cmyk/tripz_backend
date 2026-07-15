import { Router } from 'express';

import commonRoutes from './common/index.js';
import authenticatedRoutes from './authenticated/index.js';
import superAdminRoutes from './super-admin/index.js';
import adminRoutes from './admin/index.js';
import vendorRoutes from './vendor/index.js';
import clientRoutes from './client/index.js';
import marketplaceRoutes from './marketplace/index.js';

const router = Router();

// Shared authenticated features (any role) — MUST be mounted before
// commonRoutes so that specific paths like `/stories/mine` are matched
// before commonRoutes' catch-all `/stories/:slug`.
// Auth is applied per-route inside so public GETs still fall through.
router.use('/', authenticatedRoutes);

// Public + shared endpoints (health, auth — used by every role)
router.use('/', commonRoutes);

// Panel-scoped routers (role guards applied inside each)
router.use('/super-admin', superAdminRoutes);
router.use('/admin', adminRoutes);
router.use('/vendor', vendorRoutes);
router.use('/client', clientRoutes);
router.use('/marketplace', marketplaceRoutes);

export default router;
