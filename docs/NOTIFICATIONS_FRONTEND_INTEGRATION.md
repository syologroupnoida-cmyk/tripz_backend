# Tripz Notifications: Frontend Integration

The notification system uses both REST and Socket.IO:

- REST is the source of truth for notification history, unread state, and recovery after reconnecting.
- Socket.IO delivers new notifications immediately while the user is online.
- The existing email system continues to deliver important transactional messages.

## 1. Install the client

```bash
npm install socket.io-client
```

## 2. REST endpoints

Every request requires `Authorization: Bearer <accessToken>`.

```text
GET   /api/v1/notifications?take=20&unreadOnly=false
GET   /api/v1/notifications/unread-count
PATCH /api/v1/notifications/:id/read
PATCH /api/v1/notifications/read-all
```

`GET /notifications` uses cursor pagination. Pass the returned `data.nextCursor` as `cursor` to load the next page.

## 3. Create one authenticated socket

Use the API origin, not the `/api/v1` REST prefix. For example, if REST uses
`http://localhost:4000/api/v1`, Socket.IO connects to `http://localhost:4000`.

```js
import { io } from 'socket.io-client';

export const createNotificationSocket = ({ apiOrigin, accessToken }) => {
  const socket = io(apiOrigin, {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  return socket;
};
```

The backend verifies the JWT and automatically joins the socket to the private
room for that token's user. The frontend must never send or choose a user ID.

## 4. Initial synchronization and live events

Fetch REST data after login and after every socket reconnect. This recovers
events that occurred while the browser was offline.

```js
const loadNotificationState = async () => {
  const [listResponse, countResponse] = await Promise.all([
    api.get('/notifications?take=20&unreadOnly=false'),
    api.get('/notifications/unread-count'),
  ]);

  notificationStore.setItems(listResponse.data.data.items);
  notificationStore.setNextCursor(listResponse.data.data.nextCursor);
  notificationStore.setUnreadCount(countResponse.data.data.count);
};

const socket = createNotificationSocket({ apiOrigin, accessToken });

socket.on('connect', loadNotificationState);

socket.on('notification:new', (notification) => {
  // De-duplicate by notification.id because reconnect synchronization and a
  // live event can arrive close together.
  notificationStore.prependIfMissing(notification);
  notificationStore.incrementUnreadCount();
});

socket.on('connect_error', (error) => {
  console.error('Notification socket failed:', error.message);
});
```

## 5. Mark notifications as read

```js
const markNotificationRead = async (id) => {
  await api.patch(`/notifications/${id}/read`);
  notificationStore.markRead(id);
  notificationStore.decrementUnreadCountSafely();
};

const markAllNotificationsRead = async () => {
  await api.patch('/notifications/read-all');
  notificationStore.markAllRead();
  notificationStore.setUnreadCount(0);
};
```

## 6. Token refresh and logout

Socket.IO does not automatically receive a newly refreshed JWT. Reconnect it
with the new token:

```js
const reconnectWithToken = (socket, newAccessToken) => {
  socket.auth = { token: newAccessToken };
  socket.disconnect().connect();
};
```

Disconnect on logout so the previous user's private events cannot remain open:

```js
socket.removeAllListeners();
socket.disconnect();
```

Create only one socket per logged-in browser session. Do not create a socket in
every notification component render.

## 7. Notification object

```json
{
  "id": "notification-uuid",
  "category": "BOOKING",
  "type": "BOOKING_CONFIRMED",
  "title": "Booking confirmed",
  "message": "Your booking at Example Property is confirmed.",
  "actionUrl": "/client/property-bookings/booking-id",
  "entityType": "PROPERTY_BOOKING",
  "entityId": "booking-id",
  "metadata": null,
  "readAt": null,
  "createdAt": "2026-11-28T10:00:00.000Z"
}
```

Use `actionUrl` for click navigation. Treat unknown `type` values as normal
generic notifications so future backend types do not break the UI.
