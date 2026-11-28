import prisma from '../config/db.js';

const publicSelect = {
  id: true,
  category: true,
  type: true,
  title: true,
  message: true,
  actionUrl: true,
  entityType: true,
  entityId: true,
  metadata: true,
  readAt: true,
  createdAt: true,
};

export const createNotification = (data) => prisma.notification.create({
  data,
  select: publicSelect,
});

export const listNotifications = async ({ userId, cursor, unreadOnly, take }) => {
  const items = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: publicSelect,
  });
  const hasMore = items.length > take;
  if (hasMore) items.pop();
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
};

export const countUnread = ({ userId }) => prisma.notification.count({
  where: { userId, readAt: null },
});

export const markRead = ({ userId, notificationId }) => prisma.notification.updateMany({
  where: { id: notificationId, userId, readAt: null },
  data: { readAt: new Date() },
});

export const markAllRead = ({ userId }) => prisma.notification.updateMany({
  where: { userId, readAt: null },
  data: { readAt: new Date() },
});

export const existsForUser = ({ userId, notificationId }) => prisma.notification.findFirst({
  where: { id: notificationId, userId },
  select: { id: true },
});
