import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth.js';

let io = null;

export function initSocket(server) {
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const corsOrigin = isProd && allowedOrigins.length ? allowedOrigins : (isProd ? true : ['http://localhost:5173', 'http://127.0.0.1:5173']);

  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('unauthorized'));
    }
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }
  });

  return io;
}

export function getIo() {
  return io;
}

export function emitEvent(event, data = {}) {
  if (io) {
    io.emit(event, { ...data, timestamp: Date.now() });
  }
}

export function emitToUser(userId, event, data = {}) {
  if (io && userId) {
    io.to(`user:${userId}`).emit(event, { ...data, timestamp: Date.now() });
  }
}
