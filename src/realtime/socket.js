import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { env } from '../config/env.js';

let io = null;

const allowedOrigins = () => env.CORS_ORIGIN === '*'
  ? true
  : env.CORS_ORIGIN.split(',').map((origin) => origin.trim());

const extractToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

export const initializeSocketServer = (httpServer) => {
  if (io) return io;
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins(), credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error('Authentication required.'));
      const payload = verifyAccessToken(token);
      socket.user = { id: payload.sub, role: payload.role, email: payload.email };
      return next();
    } catch {
      return next(new Error('Invalid or expired access token.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
  });
  return io;
};

export const emitToUser = (userId, event, payload) => {
  if (!io) return false;
  io.to(`user:${userId}`).emit(event, payload);
  return true;
};

export const closeSocketServer = async () => {
  if (!io) return;
  // Disconnect clients so they do not keep graceful HTTP shutdown waiting.
  // The HTTP server itself remains owned by server.js.
  io.disconnectSockets(true);
  io = null;
};
