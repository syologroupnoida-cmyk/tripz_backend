import { ApiError } from '../../utils/ApiError.js';
import * as notificationRepo from '../../repositories/notification.repository.js';
import { emitToUser } from '../../realtime/socket.js';

export const createNotification = async ({
  userId, category, type, title, message, actionUrl,
  entityType, entityId, metadata, eventKey,
}) => {
  try {
    const notification = await notificationRepo.createNotification({
      userId, category, type, title, message,
      actionUrl: actionUrl ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? undefined,
      eventKey: eventKey ?? null,
    });
    emitToUser(userId, 'notification:new', notification);
    return notification;
  } catch (error) {
    // An event key makes webhook/retry-driven creation idempotent.
    if (eventKey && error?.code === 'P2002') return null;
    throw error;
  }
};

export const createNotificationQuietly = (data) => {
  Promise.resolve(createNotification(data)).catch((error) => {
    console.error('[notification] creation failed:', error?.message ?? error);
  });
};

export const listMyNotifications = ({ userId, cursor, unreadOnly = false, take = 20 }) =>
  notificationRepo.listNotifications({ userId, cursor, unreadOnly, take });

export const getUnreadCount = async ({ userId }) => ({
  count: await notificationRepo.countUnread({ userId }),
});

export const markNotificationRead = async ({ userId, notificationId }) => {
  const result = await notificationRepo.markRead({ userId, notificationId });
  if (result.count === 0) {
    const exists = await notificationRepo.existsForUser({ userId, notificationId });
    if (!exists) throw ApiError.notFound('Notification not found.');
  }
  return { id: notificationId, read: true };
};

export const markAllNotificationsRead = async ({ userId }) => ({
  updatedCount: (await notificationRepo.markAllRead({ userId })).count,
});
