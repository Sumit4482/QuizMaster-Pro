import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { getTokens } from '@/utils/api';

// Socket.io event types
export interface SocketResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  message?: string;
  timestamp: string;
}

export interface ConnectionStatus {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  connectionId?: string;
  reconnectAttempts: number;
  lastConnected?: Date;
  error?: string;
}

export interface SocketContextType {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
  emit: <T = any>(event: string, data?: any) => Promise<SocketResponse<T>>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler?: (...args: any[]) => void) => void;
  joinRoom: (roomCode: string, password?: string) => Promise<SocketResponse>;
  leaveRoom: (roomId: string) => Promise<SocketResponse>;
  createRoom: (roomData: any) => Promise<SocketResponse>;
}

// Global singleton socket manager to prevent multiple connections
class SocketManager {
  private static instance: SocketManager;
  private socket: Socket | null = null;
  private connectionState: ConnectionStatus = {
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    connectionId: undefined,
    reconnectAttempts: 0,
    lastConnected: undefined,
    error: undefined,
  };
  private subscribers = new Set<(status: ConnectionStatus) => void>();
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private pingIntervalId: NodeJS.Timeout | null = null;
  private maxReconnectAttempts = 5;

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  subscribe(callback: (status: ConnectionStatus) => void): () => void {
    this.subscribers.add(callback);
    // Immediately notify with current status
    callback({ ...this.connectionState });
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    const stateCopy = { ...this.connectionState };
    this.subscribers.forEach(callback => callback(stateCopy));
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  getConnectionState(): ConnectionStatus {
    return { ...this.connectionState };
  }

  connect(accessToken: string, user: any): void {
    // Prevent multiple simultaneous connection attempts
    if (this.connectionState.isConnecting || (this.socket && this.socket.connected)) {
      console.log('🔌 [SocketManager] Already connected or connecting');
      return;
    }

    console.log('🚀 [SocketManager] Initializing connection to:', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');

    this.connectionState.isConnecting = true;
    this.connectionState.error = undefined;
    this.notifySubscribers();

    // Clean up existing socket
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    this.socket = io(serverUrl, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      forceNew: false,
      multiplex: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ [SocketManager] Connected with ID:', this.socket?.id);
      this.connectionState = {
        ...this.connectionState,
        isConnected: true,
        isConnecting: false,
        isReconnecting: false,
        connectionId: this.socket?.id,
        reconnectAttempts: 0,
        lastConnected: new Date(),
        error: undefined,
      };
      this.notifySubscribers();
      this.startPingMonitoring();
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('❌ [SocketManager] Disconnected. Reason:', reason);
      this.connectionState = {
        ...this.connectionState,
        isConnected: false,
        isConnecting: false,
        error: reason === 'io server disconnect' ? 'Server disconnected' : undefined,
      };
      this.notifySubscribers();
      this.stopPingMonitoring();

      // Auto-reconnect if not intentional disconnect
      if (reason !== 'io client disconnect' && getTokens().accessToken) {
        this.attemptReconnection();
      }
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('🚫 [SocketManager] Connection error:', error.message);
      this.connectionState = {
        ...this.connectionState,
        isConnected: false,
        isConnecting: false,
        error: `Connection failed: ${error.message}`,
      };
      this.notifySubscribers();

      // Attempt reconnection on error
      if (getTokens().accessToken) {
        this.attemptReconnection();
      }
    });

    // Connection confirmation
    this.socket.on('connection:confirmed', (data: any) => {
      console.log('🎯 [SocketManager] Connection confirmed:', data);
      this.connectionState.connectionId = data.socketId;
      this.notifySubscribers();
    });

    // Generic error handling
    this.socket.on('error', (error: any) => {
      console.error('🔥 [SocketManager] Socket error:', error);
      this.connectionState.error = error.message || 'Socket error occurred';
      this.notifySubscribers();
    });
  }

  private attemptReconnection(): void {
    if (this.connectionState.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('🛑 [SocketManager] Max reconnection attempts reached');
      this.connectionState.error = 'Max reconnection attempts reached';
      this.notifySubscribers();
      return;
    }

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    const delay = Math.min(1000 * Math.pow(2, this.connectionState.reconnectAttempts), 10000);
    console.log(`🔄 [SocketManager] Attempting reconnection in ${delay}ms (attempt ${this.connectionState.reconnectAttempts + 1})`);

    this.connectionState.isReconnecting = true;
    this.connectionState.reconnectAttempts++;
    this.notifySubscribers();

    this.reconnectTimeoutId = setTimeout(() => {
      const { accessToken } = getTokens();
      if (accessToken) {
        // Get user from auth context or local storage
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        this.connect(accessToken, user);
      }
    }, delay);
  }

  private startPingMonitoring(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
    }

    this.pingIntervalId = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('ping', { timestamp: Date.now() });
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPingMonitoring(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  disconnect(): void {
    console.log('🔌 [SocketManager] Disconnecting...');
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.stopPingMonitoring();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.connectionState = {
      isConnected: false,
      isConnecting: false,
      isReconnecting: false,
      connectionId: undefined,
      reconnectAttempts: 0,
      lastConnected: undefined,
      error: undefined,
    };
    this.notifySubscribers();
  }

  emit(event: string, data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Socket operation timed out'));
      }, 10000);

      this.socket.emit(event, data, (response: any) => {
        clearTimeout(timeout);
        if (response?.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Socket operation failed'));
        }
      });
    });
  }

  on(event: string, callback: (...args: any[]) => void): void {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    this.socket?.off(event, callback);
  }
}

// Hook for using the singleton socket manager
export function useSocket(): SocketContextType {
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    connectionId: undefined,
    reconnectAttempts: 0,
    lastConnected: undefined,
    error: undefined,
  });

  const socketManager = SocketManager.getInstance();

  // Subscribe to connection status updates
  useEffect(() => {
    const unsubscribe = socketManager.subscribe(setConnectionStatus);
    return unsubscribe;
  }, [socketManager]);

  // Auto-connect when user is available
  useEffect(() => {
    const { accessToken } = getTokens();
    if (accessToken && user && !connectionStatus.isConnected && !connectionStatus.isConnecting) {
      console.log('🔄 [useSocket] Auto-connecting for user:', user.id);
      socketManager.connect(accessToken, user);
    }
  }, [user, connectionStatus.isConnected, connectionStatus.isConnecting, socketManager]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect here - let other components use the socket
      // Only disconnect when the app is actually unmounting
    };
  }, []);

  const connect = useCallback(async () => {
    const { accessToken } = getTokens();
    if (accessToken && user) {
      socketManager.connect(accessToken, user);
    }
  }, [user, socketManager]);

  const disconnect = useCallback(() => {
    socketManager.disconnect();
  }, [socketManager]);

  const emit = useCallback((event: string, data?: any) => {
    return socketManager.emit(event, data);
  }, [socketManager]);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketManager.on(event, callback);
  }, [socketManager]);

  const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
    socketManager.off(event, callback);
  }, [socketManager]);

  // Room management functions
  const joinRoom = useCallback(async (roomCode: string, password?: string) => {
    return emit('room:join', { roomCode, ...(password && { password }) });
  }, [emit]);

  const leaveRoom = useCallback(async (roomId: string) => {
    return emit('room:leave', { roomId });
  }, [emit]);

  const createRoom = useCallback(async (roomData: any) => {
    return emit('room:create', roomData);
  }, [emit]);

  return {
    socket: socketManager.getSocket(),
    connectionStatus,
    connect,
    disconnect,
    emit,
    on,
    off,
    // Room management
    joinRoom,
    leaveRoom,
    createRoom,
  };
}
