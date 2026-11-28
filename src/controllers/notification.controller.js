import * as notificationService from '../services/notification/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const listMyNotifications = asyncHandler(async (req, res) => {
  const requestedTake = Number.parseInt(req.query.take, 10);
  const data = await notificationService.listMyNotifications({
    userId: req.user.id,
    cursor: req.query.cursor || undefined,
    unreadOnly: req.query.unreadOnly === 'true',
    take: Number.isInteger(requestedTake) ? Math.min(Math.max(requestedTake, 1), 50) : 20,
  });
  return sendSuccess(res, { message: 'Notifications retrieved.', data });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const data = await notificationService.getUnreadCount({ userId: req.user.id });
  return sendSuccess(res, { message: 'Unread count retrieved.', data });
});

export const markRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markNotificationRead({
    userId: req.user.id,
    notificationId: req.params.id,
  });
  return sendSuccess(res, { message: 'Notification marked as read.', data });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllNotificationsRead({ userId: req.user.id });
  return sendSuccess(res, { message: 'All notifications marked as read.', data });
});
