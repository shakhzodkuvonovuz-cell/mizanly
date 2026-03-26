/**
 * Shared socket context — single Socket.io connection for the entire app.
 *
 * Replaces 4 independent socket connections (risalah, conversation, call, quran-room)
 * with a single shared one.
 *
 * Benefits:
 * - One connection instead of 4 (saves bandwidth, battery, server resources)
 * - No duplicate event handling (no double notification counter)
 * - Centralized auth + reconnection logic
 * - Token refresh happens once, not 4 times
 *
 * Usage: wrap app in <SocketProvider>, consume via useSocket() hook.
 *
 * Architecture:
 * - The provider manages connection lifecycle (connect, disconnect, token refresh)
 * - Individual screens add/remove their own event listeners via the shared socket
 * - The provider handles app-wide events (new_notification) since they are not screen-specific
 * - Screens handle room membership (join/leave) on their own mount/unmount
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/services/api';
import { useStore } from '@/store';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

/**
 * Hook to access the shared socket instance and connection status.
 * Returns { socket, isConnected }.
 * socket may be null if the user is not authenticated or the connection is not yet established.
 */
export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const { getToken, isSignedIn } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const setUnreadNotifications = useStore((s) => s.setUnreadNotifications);

  // Connect when authenticated, disconnect when signed out
  useEffect(() => {
    if (!isSignedIn) {
      // User signed out — disconnect existing socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    let mounted = true;

    const connect = async () => {
      const token = await getTokenRef.current();
      if (!token || !mounted) return;

      const sock = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      });

      sock.on('connect', () => {
        if (!mounted) return;
        setIsConnected(true);
      });

      sock.on('disconnect', () => {
        if (!mounted) return;
        setIsConnected(false);
      });

      // Refresh token on auth errors (one place instead of 4)
      sock.on('connect_error', async () => {
        if (!mounted) return;
        const freshToken = await getTokenRef.current({ skipCache: true });
        if (freshToken && sock) {
          sock.auth = { token: freshToken };
        }
      });

      // App-wide notification listener — lives in the provider, not any single screen
      sock.on('new_notification', () => {
        if (!mounted) return;
        const current = useStore.getState().unreadNotifications;
        setUnreadNotifications(current + 1);
      });

      socketRef.current = sock;
      setSocket(sock);
    };

    connect();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setIsConnected(false);
    };
  }, [isSignedIn, setUnreadNotifications]);

  // Handle app state changes: disconnect on background, reconnect on foreground
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      const sock = socketRef.current;
      if (!sock) return;

      if (nextState === 'active') {
        // App came to foreground — reconnect if disconnected
        if (sock.disconnected) {
          // Refresh token before reconnecting
          const freshToken = await getTokenRef.current({ skipCache: true });
          if (freshToken) {
            sock.auth = { token: freshToken };
          }
          sock.connect();
        }
      } else if (nextState === 'background') {
        // App went to background — disconnect to save battery and server resources
        sock.disconnect();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const value: SocketContextValue = { socket, isConnected };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}
