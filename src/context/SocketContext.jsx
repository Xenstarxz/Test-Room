import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';
import { getToken } from '../api/client.js';

const SocketContext = createContext({
  socket: null,
  connected: false,
  subscribe: () => {},
});

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const isProd = import.meta.env.PROD;
    const socketUrl = isProd ? window.location.origin : 'http://localhost:3001';
    const token = getToken();

    const socketInstance = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
    });

    socketInstance.on('NOTIFICATION_NEW', (data) => {
      if (data?.message) {
        showToast(`🔔 ${data.message}`, 'info');
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user?.id]);

  const subscribe = (event, callback) => {
    if (!socket) return () => {};
    socket.on(event, callback);
    return () => {
      socket.off(event, callback);
    };
  };

  return (
    <SocketContext.Provider value={{ socket, connected, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
