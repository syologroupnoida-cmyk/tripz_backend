import { Router } from 'express';
import * as adminDashboardController from '../../controllers/adminDashboard.controller.js';

const router = Router();

// GET /api/v1/admin/dashboard/stats
router.get('/stats', adminDashboardController.getDashboardStats);

export default router;
