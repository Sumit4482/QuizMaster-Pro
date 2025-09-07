'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useSocket, SocketContextType } from '@/hooks/useSocketSingleton';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const SocketContext = createContext<SocketContextType | null>(null);

interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const socketContext = useSocket();
  const { user } = useAuth();
  
  // Handle connection status changes
  useEffect(() => {
    const { connectionStatus } = socketContext;
    
    if (connectionStatus.isConnected && user) {
      toast.success(`Connected as ${user.username}`, {
        id: 'socket-connection',
        duration: 2000,
      });
    } else if (connectionStatus.error && !connectionStatus.isReconnecting) {
      toast.error(`Connection failed: ${connectionStatus.error}`, {
        id: 'socket-error',
        duration: 4000,
      });
    } else if (connectionStatus.isReconnecting) {
      toast.loading(
        `Reconnecting... (attempt ${connectionStatus.reconnectAttempts})`,
        {
          id: 'socket-reconnecting',
        }
      );
    }
  }, [socketContext.connectionStatus, user]);

  // Set up global socket event handlers
  useEffect(() => {
    const { socket } = socketContext;
    if (!socket) return;

    // Room events
    const handleRoomUserJoined = (data: any) => {
      toast.success(`${data.user.username} joined the room`, {
        duration: 3000,
      });
    };

    const handleRoomUserLeft = (data: any) => {
      toast(`${data.user.username} left the room`, {
        duration: 3000,
      });
    };

    const handleRoomsUpdated = (data: any) => {
      console.log('Rooms updated:', data);
    };

    const handleMessageReceived = (data: any) => {
      // Handle room messages
      if (data.type === 'SYSTEM') {
        toast(data.message, {
          duration: 4000,
        });
      }
    };

    const handleServerShutdown = (data: any) => {
      toast.error('Server is shutting down. Please reconnect later.', {
        duration: 10000,
      });
    };

    // Register event handlers
    socket.on('room:user_joined', handleRoomUserJoined);
    socket.on('room:user_left', handleRoomUserLeft);
    socket.on('rooms:updated', handleRoomsUpdated);
    socket.on('message:received', handleMessageReceived);
    socket.on('server:shutdown', handleServerShutdown);

    // Cleanup event handlers
    return () => {
      socket.off('room:user_joined', handleRoomUserJoined);
      socket.off('room:user_left', handleRoomUserLeft);
      socket.off('rooms:updated', handleRoomsUpdated);
      socket.off('message:received', handleMessageReceived);
      socket.off('server:shutdown', handleServerShutdown);
    };
  }, [socketContext.socket]);

  return (
    <SocketContext.Provider value={socketContext}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext(): SocketContextType {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}

// Connection status indicator component
export interface ConnectionStatusProps {
  className?: string;
}

export function ConnectionStatus({ className = '' }: ConnectionStatusProps) {
  const { connectionStatus } = useSocketContext();
  
  const getStatusColor = () => {
    if (connectionStatus.isConnected) return 'bg-green-500';
    if (connectionStatus.isConnecting || connectionStatus.isReconnecting) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (connectionStatus.isConnected) {
      return `Connected`;
    }
    if (connectionStatus.isReconnecting) {
      return `Reconnecting... (${connectionStatus.reconnectAttempts})`;
    }
    if (connectionStatus.isConnecting) {
      return 'Connecting...';
    }
    return connectionStatus.error || 'Disconnected';
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {getStatusText()}
      </span>
    </div>
  );
}

// Hook for room management
export function useRoom() {
  const { emit, on, off } = useSocketContext();
  
  const createRoom = async (roomData: {
    name: string;
    maxPlayers?: number;
    isPrivate?: boolean;
    password?: string;
    settings?: any;
  }) => {
    try {
      const response = await emit('room:create', roomData);
      if (response.success) {
        toast.success('Room created successfully!');
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to create room');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create room';
      toast.error(message);
      throw error;
    }
  };

  const joinRoom = async (roomCode: string, password?: string) => {
    try {
      const response = await emit('room:join', { roomCode, password });
      if (response.success) {
        toast.success('Joined room successfully!');
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to join room');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join room';
      toast.error(message);
      throw error;
    }
  };

  const leaveRoom = async (roomId: string) => {
    try {
      const response = await emit('room:leave', { roomId });
      if (response.success) {
        toast.success('Left room successfully');
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to leave room');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to leave room';
      toast.error(message);
      throw error;
    }
  };

  const sendMessage = async (roomId: string, message: string) => {
    try {
      const response = await emit('message:send', { roomId, message });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to send message');
      }
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      toast.error(errorMessage);
      throw error;
    }
  };

  const getRooms = async (limit?: number) => {
    try {
      const response = await emit('rooms:list', { limit });
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to get rooms');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get rooms';
      console.error(message);
      return [];
    }
  };

  const getMyRooms = async () => {
    try {
      const response = await emit('rooms:my_rooms');
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to get your rooms');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get your rooms';
      console.error(message);
      return [];
    }
  };

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    getRooms,
    getMyRooms,
    on,
    off,
  };
}
