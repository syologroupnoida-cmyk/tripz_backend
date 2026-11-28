import { Router } from 'express';
import { authenticateUser } from '../../middlewares/auth.middleware.js';
import * as notificationController from '../../controllers/notification.controller.js';

const router = Router();
router.use(authenticateUser);
router.get('/', notificationController.listMyNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);

export default router;
