import { Server, Namespace } from 'socket.io';
import { logger } from '@/config/logger';
import { connectionManager } from '../managers/connectionManager';
import { roomManager } from '../managers/roomManager';
import { GameManager } from '../managers/gameManager';
import { GameEventHandlers } from './gameHandlers';
import { OneVsOneHandlers } from './oneVsOneHandlers';
import {
  ExtendedSocket,
  EventResponse,
  CreateRoomPayload,
  JoinRoomPayload,
  SendMessagePayload,
  SocketError,
} from '../types/socket';
import { validateEventPayload } from './validation';
import { rateLimitEvent } from './rateLimit';

/**
 * Event Handlers
 * Centralized event handling for WebSocket connections
 */
class EventHandlers {
  private gameManager: GameManager | null = null;
  private gameEventHandlers: GameEventHandlers | null = null;
  private oneVsOneHandlers: OneVsOneHandlers | null = null;

  /**
   * Initialize game manager
   */
  public initializeGameManager(io: Server): void {
    this.gameManager = GameManager.getInstance(io);
    this.gameEventHandlers = new GameEventHandlers(
      io,
      this.gameManager
    );
    this.oneVsOneHandlers = new OneVsOneHandlers();
    logger.info('Game manager and 1vs1 handlers initialized for event handlers');
  }

  /**
   * Set up main event handlers for a socket connection
   */
  public setupEventHandlers(socket: ExtendedSocket, io: Server): void {
    // Initialize game manager if not already done
    if (!this.gameManager) {
      this.initializeGameManager(io);
    }

    // Connection health events
    this.setupHealthEvents(socket);
    
    // Room management events
    this.setupRoomEvents(socket, io);
    
    // Messaging events
    this.setupMessagingEvents(socket, io);
    
    // User presence events
    this.setupPresenceEvents(socket, io);

    // Game events (Phase 2.2)
    if (this.gameEventHandlers) {
      this.gameEventHandlers.setupGameEvents(socket);
    }

    // 1vs1 events
    if (this.oneVsOneHandlers) {
      this.oneVsOneHandlers.setupHandlers(socket, io);
    }

    logger.debug('Event handlers set up for socket', {
      socketId: socket.id,
      userId: socket.data.user.id,
      gameEnabled: !!this.gameEventHandlers
    });
  }

  /**
   * Set up quiz-specific event handlers
   */
  public setupQuizEventHandlers(socket: ExtendedSocket, namespace: Namespace): void {
    // Quiz gameplay events will be implemented in Phase 2.2
    socket.on('quiz:ready', this.withErrorHandling(socket, async (payload, callback) => {
      // Placeholder for quiz ready event
      callback?.(this.createSuccessResponse({ message: 'Quiz ready event received' }));
    }));

    socket.on('quiz:answer', this.withErrorHandling(socket, async (payload, callback) => {
      // Placeholder for quiz answer event
      callback?.(this.createSuccessResponse({ message: 'Quiz answer event received' }));
    }));

    logger.debug('Quiz event handlers set up for socket', {
      socketId: socket.id,
      userId: socket.data.user?.id,
    });
  }

  /**
   * Set up admin event handlers
   */
  public setupAdminEventHandlers(socket: ExtendedSocket, namespace: Namespace): void {
    socket.on('admin:rooms:list', this.withErrorHandling(socket, async (payload, callback) => {
      const rooms = roomManager.getRoomStats();
      callback?.(this.createSuccessResponse(rooms));
    }));

    socket.on('admin:connections:stats', this.withErrorHandling(socket, async (payload, callback) => {
      const stats = connectionManager.getConnectionStats();
      callback?.(this.createSuccessResponse(stats));
    }));

    socket.on('admin:room:delete', this.withErrorHandling(socket, async (payload: { roomId: string }, callback) => {
      if (!payload.roomId) {
        throw new SocketError('INVALID_PAYLOAD', 'Room ID is required');
      }

      roomManager.deleteRoom(payload.roomId);
      callback?.(this.createSuccessResponse({ message: 'Room deleted successfully' }));
    }));

    logger.debug('Admin event handlers set up for socket', {
      socketId: socket.id,
      userId: socket.data.user?.id,
    });
  }

  /**
   * Set up connection health events
   */
  private setupHealthEvents(socket: ExtendedSocket): void {
    socket.on('ping', this.withErrorHandling(socket, async (payload, callback) => {
      connectionManager.updateActivity(socket.id);
      const response = {
        pong: true,
        timestamp: Date.now(),
        serverTime: new Date().toISOString(),
      };
      
      callback?.(this.createSuccessResponse(response));
    }));

    socket.on('heartbeat', this.withErrorHandling(socket, async (payload, callback) => {
      connectionManager.updateActivity(socket.id);
      const connection = connectionManager.getConnection(socket.id);
      
      const response = {
        heartbeat: true,
        timestamp: Date.now(),
        connectionTime: connection ? Date.now() - connection.connectedAt : 0,
      };
      
      callback?.(this.createSuccessResponse(response));
    }));
  }

  /**
   * Set up room management events
   */
  private setupRoomEvents(socket: ExtendedSocket, io: Server): void {
    // Create room
    socket.on('room:create', this.withErrorHandling(socket, async (payload: CreateRoomPayload, callback) => {
        const room = roomManager.createRoom(socket.data.user, payload);
        
        // Join the creator to their own room
        socket.join(room.id);
        connectionManager.addRoomToConnection(socket.id, room.id);
        
        // Update the creator's socketId after room creation
        const creatorParticipant = room.participants.get(socket.data.user.id);
        if (creatorParticipant) {
          creatorParticipant.socketId = socket.id;
          room.participants.set(socket.data.user.id, creatorParticipant);
        }
        
        callback?.(this.createSuccessResponse(roomManager.serializeRoom(room)));
        
        // Notify the creator that they joined their own room (for consistent UI updates)
        io.to(room.id).emit('room:user_joined', {
          user: {
            id: socket.data.user.id,
            username: socket.data.user.username,
          },
          participant: room.participants.get(socket.data.user.id),
          room: roomManager.serializeRoom(room),
          timestamp: new Date().toISOString(),
          isRoomCreation: true,
        });
        
        // Broadcast to public room list if not private - only send to users NOT in this room
        if (!room.isPrivate) {
          socket.broadcast.emit('rooms:updated', { 
            type: 'created', 
            room: this.sanitizeRoomForPublic(room) 
          });
        }
      }));

    // Join room
    socket.on('room:join', this.withErrorHandling(socket, async (payload: JoinRoomPayload, callback) => {
        const room = await roomManager.joinRoom(socket.data.user, socket.id, payload);
        
        // Join socket to room
        socket.join(room.id);
        
        callback?.(this.createSuccessResponse(roomManager.serializeRoom(room)));
        
        // Notify ALL room participants (including the user who just joined)
        io.to(room.id).emit('room:user_joined', {
          user: {
            id: socket.data.user.id,
            username: socket.data.user.username,
          },
          participant: room.participants.get(socket.data.user.id),
          room: roomManager.serializeRoom(room),
          timestamp: new Date().toISOString(),
        });
        
        // Update public room list - only send to users NOT in this room
        if (!room.isPrivate) {
          socket.broadcast.emit('rooms:updated', { 
            type: 'updated', 
            room: this.sanitizeRoomForPublic(room) 
          });
        }
      }));

    // Leave room
    socket.on('room:leave', this.withErrorHandling(socket, async (payload: { roomId: string }, callback) => {
        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          throw new SocketError('ROOM_NOT_FOUND', 'Room not found');
        }

        // Leave socket room
        socket.leave(payload.roomId);
        
        // Leave room in manager
        roomManager.leaveRoom(socket.data.user.id, socket.id, payload.roomId);
        
        callback?.(this.createSuccessResponse({ message: 'Left room successfully' }));
        
        // Notify other participants
        socket.to(payload.roomId).emit('room:user_left', {
          user: {
            id: socket.data.user.id,
            username: socket.data.user.username,
          },
          timestamp: new Date().toISOString(),
        });
      }));

    // Set participant ready status
    socket.on('room:ready', this.withErrorHandling(socket, async (payload: { roomId: string, isReady: boolean }, callback) => {
        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          throw new SocketError('ROOM_NOT_FOUND', 'Room not found');
        }

        const participant = room.participants.get(socket.data.user.id);
        if (!participant) {
          throw new SocketError('NOT_IN_ROOM', 'You are not in this room');
        }

        // Update participant ready status
        participant.isReady = payload.isReady;
        participant.lastActivity = new Date();
        room.participants.set(socket.data.user.id, participant);
        room.lastActivity = new Date();

        logger.info('Participant ready status updated', {
          roomId: payload.roomId,
          userId: socket.data.user.id,
          username: socket.data.user.username,
          isReady: payload.isReady,
        });

        callback?.(this.createSuccessResponse({ 
          message: `Marked as ${payload.isReady ? 'ready' : 'not ready'}`,
          isReady: payload.isReady 
        }));

        // Notify all room participants about the ready status change
        io.to(payload.roomId).emit('room:participant_ready', {
          user: {
            id: socket.data.user.id,
            username: socket.data.user.username,
          },
          isReady: payload.isReady,
          participant: room.participants.get(socket.data.user.id),
          room: roomManager.serializeRoom(room),
          timestamp: new Date().toISOString(),
        });
      }));

    // Get public rooms
    socket.on('rooms:list', this.withErrorHandling(socket, async (payload: { limit?: number }, callback) => {
        const limit = payload?.limit || 20;
        const rooms = roomManager.getPublicRooms(Math.min(limit, 50));
        callback?.(this.createSuccessResponse(rooms));
      }));

    // Get user's rooms
    socket.on('rooms:my_rooms', this.withErrorHandling(socket, async (payload, callback) => {
        const rooms = roomManager.getUserRooms(socket.data.user.id);
        callback?.(this.createSuccessResponse(rooms));
      }));
  }

  /**
   * Set up messaging events
   */
  private setupMessagingEvents(socket: ExtendedSocket, io: Server): void {
    socket.on('message:send', this.withErrorHandling(socket, async (payload: SendMessagePayload, callback) => {
        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          throw new SocketError('ROOM_NOT_FOUND', 'Room not found');
        }

        const participant = room.participants.get(socket.data.user.id);
        if (!participant) {
          throw new SocketError('NOT_IN_ROOM', 'You are not in this room');
        }

        const message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          roomId: payload.roomId,
          userId: socket.data.user.id,
          username: socket.data.user.username,
          message: payload.message.trim(),
          type: payload.type || 'CHAT',
          timestamp: new Date(),
        };

        // Broadcast message to room
        io.to(payload.roomId).emit('message:received', message);
        
        callback?.(this.createSuccessResponse({ messageId: message.id }));

        logger.debug('Message sent to room', {
          messageId: message.id,
          roomId: payload.roomId,
          userId: socket.data.user.id,
          messageLength: message.message.length,
        });
      }));
  }

  /**
   * Set up presence events
   */
  private setupPresenceEvents(socket: ExtendedSocket, io: Server): void {
    socket.on('presence:get_online_users', this.withErrorHandling(socket, async (payload, callback) => {
        const onlineUsers = connectionManager.getOnlineUsers();
        callback?.(this.createSuccessResponse(onlineUsers));
      }));

    socket.on('presence:get_user_status', this.withErrorHandling(socket, async (payload: { userId: string }, callback) => {
        const presence = connectionManager.getUserPresence(payload.userId);
        callback?.(this.createSuccessResponse(presence));
      }));
  }

  /**
   * Error handling wrapper for event handlers
   */
  public withErrorHandling<T>(
    socket: ExtendedSocket,
    handler: (payload: T, callback?: (response: EventResponse) => void) => Promise<void> | void
  ) {
    return async (payload: T, callback?: (response: EventResponse) => void) => {
      try {
        await handler(payload, callback);
      } catch (error) {
        logger.error('Socket event error', {
          socketId: socket.id,
          userId: socket.data.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });

        let errorResponse: EventResponse;
        
        if (error instanceof SocketError) {
          errorResponse = this.createErrorResponse(error.code, error.message, error.details);
        } else if (error instanceof Error) {
          errorResponse = this.createErrorResponse('INTERNAL_ERROR', error.message);
        } else {
          errorResponse = this.createErrorResponse('UNKNOWN_ERROR', 'An unknown error occurred');
        }

        callback?.(errorResponse);
      }
    };
  }

  /**
   * Create success response
   */
  private createSuccessResponse<T>(data: T): EventResponse<T> {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create error response
   */
  private createErrorResponse(code: string, message: string, details?: any): EventResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Sanitize room data for public consumption
   */
  private sanitizeRoomForPublic(room: any) {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      currentPlayers: room.currentPlayers,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      hasPassword: !!room.password,
      status: room.status,
      createdAt: room.createdAt,
    };
  }
}

// Export singleton instance
export const eventHandlers = new EventHandlers();
