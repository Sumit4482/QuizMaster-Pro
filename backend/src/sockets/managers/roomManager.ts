import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/config/logger';
import { connectionManager } from './connectionManager';
import {
  RoomState,
  RoomParticipant,
  RoomSettings,
  CreateRoomPayload,
  JoinRoomPayload,
  RoomListEntry,
  SocketUser,
  SocketError,
} from '../types/socket';
import { EventEmitter } from 'events';

/**
 * Room Manager
 * Handles room creation, management, and participant tracking
 */
class RoomManager extends EventEmitter {
  private rooms: Map<string, RoomState> = new Map();
  private roomCodes: Map<string, string> = new Map(); // code -> roomId mapping
  private userRooms: Map<string, Set<string>> = new Map(); // userId -> roomIds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanupRoutine();
  }

  /**
   * Generate unique room code
   */
  private generateRoomCode(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      attempts++;
    } while (this.roomCodes.has(code) && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new SocketError('ROOM_CODE_GENERATION_FAILED', 'Failed to generate unique room code');
    }

    return code;
  }

  /**
   * Create a new room
   */
  public createRoom(creator: SocketUser, payload: CreateRoomPayload): RoomState {
    // Validate input
    if (!payload.name || payload.name.trim().length === 0) {
      throw new SocketError('INVALID_ROOM_NAME', 'Room name cannot be empty');
    }

    if (payload.name.length > 100) {
      throw new SocketError('INVALID_ROOM_NAME', 'Room name cannot exceed 100 characters');
    }

    if (payload.maxPlayers && (payload.maxPlayers < 2 || payload.maxPlayers > 50)) {
      throw new SocketError('INVALID_MAX_PLAYERS', 'Maximum players must be between 2 and 50');
    }

    if (payload.isPrivate && payload.password && payload.password.length > 100) {
      throw new SocketError('INVALID_PASSWORD', 'Password cannot exceed 100 characters');
    }

    // Check if user already has too many active rooms
    const userRoomCount = this.userRooms.get(creator.id)?.size || 0;
    if (userRoomCount >= 5) {
      throw new SocketError('TOO_MANY_ROOMS', 'You can only create up to 5 rooms at a time');
    }

    const roomId = uuidv4();
    const roomCode = this.generateRoomCode();

    const defaultSettings: RoomSettings = {
      allowSpectators: true,
      allowReconnection: true,
      autoStart: false,
      questionTimeLimit: 30,
      showCorrectAnswers: true,
      allowHints: false,
      shuffleQuestions: true,
      shuffleAnswers: true,
      requireApproval: false,
    };

    const room: RoomState = {
      id: roomId,
      code: roomCode,
      name: payload.name,
      createdBy: creator.id,
      createdAt: new Date(),
      maxPlayers: payload.maxPlayers || 10,
      currentPlayers: 1,
      isPrivate: payload.isPrivate || false,
      password: payload.password,
      status: 'WAITING',
      settings: { ...defaultSettings, ...payload.settings },
      participants: new Map(),
      lastActivity: new Date(),
    };

    // Add creator as host
    const hostParticipant: RoomParticipant = {
      userId: creator.id,
      username: creator.username,
      socketId: '', // Will be set when joining
      joinedAt: new Date(),
      role: 'HOST',
      isOnline: true,
      lastActivity: new Date(),
    };

    room.participants.set(creator.id, hostParticipant);

    // Store room
    this.rooms.set(roomId, room);
    this.roomCodes.set(roomCode, roomId);

    // Track user room membership
    if (!this.userRooms.has(creator.id)) {
      this.userRooms.set(creator.id, new Set());
    }
    this.userRooms.get(creator.id)!.add(roomId);

    logger.info('Room created', {
      roomId,
      roomCode,
      createdBy: creator.id,
      name: payload.name,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
    });

    this.emit('room:created', { room, creator });
    return room;
  }

  /**
   * Join an existing room
   */
  public async joinRoom(
    user: SocketUser,
    socketId: string,
    payload: JoinRoomPayload
  ): Promise<RoomState> {
    // Validate input
    if (!payload.roomCode || payload.roomCode.length !== 6) {
      throw new SocketError('INVALID_ROOM_CODE', 'Room code must be 6 characters long');
    }

    const roomId = this.roomCodes.get(payload.roomCode.toUpperCase());
    
    if (!roomId) {
      throw new SocketError('ROOM_NOT_FOUND', 'Room not found. Please check the room code.');
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      // Clean up orphaned room code
      this.roomCodes.delete(payload.roomCode.toUpperCase());
      throw new SocketError('ROOM_NOT_FOUND', 'Room not found. Please check the room code.');
    }

    // Check if room is still accepting players
    if (room.status === 'FINISHED') {
      throw new SocketError('ROOM_FINISHED', 'This room has already finished.');
    }

    // Check if user is already in room (different socket)
    const existingParticipant = room.participants.get(user.id);
    
    // Check if room is full (unless reconnecting)
    // Only count online players for room capacity
    const onlinePlayerCount = Array.from(room.participants.values())
      .filter(p => p.isOnline).length;
    
    if (onlinePlayerCount >= room.maxPlayers && !existingParticipant) {
      throw new SocketError('ROOM_FULL', 'Room is full. Please try another room.');
    }

    // Check password for private rooms
    if (room.isPrivate && room.password) {
      if (!payload.password) {
        throw new SocketError('PASSWORD_REQUIRED', 'This room requires a password.');
      }
      if (payload.password !== room.password) {
        throw new SocketError('INVALID_PASSWORD', 'Incorrect room password.');
      }
    }

    // Handle existing participant (reconnection)
    let participant = room.participants.get(user.id);
    if (participant) {
      participant.socketId = socketId;
      participant.isOnline = true;
      participant.lastActivity = new Date();
      
      // Recalculate current players count to only count online players
      room.currentPlayers = Array.from(room.participants.values())
        .filter(p => p.isOnline).length;
      
      logger.info('User reconnected to room', {
        userId: user.id,
        username: user.username,
        roomId,
        roomCode: room.code,
        currentOnlinePlayers: room.currentPlayers,
      });
    } else {
      // New participant
      const role = room.settings.requireApproval ? 'SPECTATOR' : 'PLAYER';
      
      participant = {
        userId: user.id,
        username: user.username,
        socketId,
        joinedAt: new Date(),
        role,
        isOnline: true,
        lastActivity: new Date(),
      };

      room.participants.set(user.id, participant);
      
      // Recalculate current players count to only count online players
      room.currentPlayers = Array.from(room.participants.values())
        .filter(p => p.isOnline).length;

      logger.info('User joined room', {
        userId: user.id,
        username: user.username,
        roomId,
        roomCode: room.code,
        role,
        currentOnlinePlayers: room.currentPlayers,
      });
    }

    // Track user room membership
    if (!this.userRooms.has(user.id)) {
      this.userRooms.set(user.id, new Set());
    }
    this.userRooms.get(user.id)!.add(roomId);

    // Update room activity
    room.lastActivity = new Date();

    // Track room in connection manager
    connectionManager.addRoomToConnection(socketId, roomId);

    this.emit('room:joined', { room, user, participant });
    return room;
  }

  /**
   * Convert room state to a serializable format for Socket.io
   */
  public serializeRoom(room: RoomState): any {
    return {
      ...room,
      participants: Array.from(room.participants.entries()).reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, RoomParticipant>),
    };
  }

  /**
   * Leave a room
   */
  public leaveRoom(userId: string, socketId: string, roomId?: string): void {
    // If no room specified, leave all rooms for this user
    if (!roomId) {
      const userRoomIds = this.userRooms.get(userId);
      if (userRoomIds) {
        userRoomIds.forEach(id => this.leaveRoom(userId, socketId, id));
      }
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const participant = room.participants.get(userId);
    if (!participant) {
      return;
    }

    // Remove participant
    room.participants.delete(userId);
    room.currentPlayers = Math.max(0, room.currentPlayers - 1);

    // Remove from user room tracking
    const userRoomIds = this.userRooms.get(userId);
    if (userRoomIds) {
      userRoomIds.delete(roomId);
      if (userRoomIds.size === 0) {
        this.userRooms.delete(userId);
      }
    }

    // Remove room from connection
    connectionManager.removeRoomFromConnection(socketId, roomId);

    logger.info('User left room', {
      userId,
      roomId,
      roomCode: room.code,
      currentPlayers: room.currentPlayers,
      wasHost: participant.role === 'HOST',
    });

    // If host left, assign new host
    if (participant.role === 'HOST' && room.participants.size > 0) {
      const newHost = Array.from(room.participants.values())
        .find(p => p.role === 'PLAYER' && p.isOnline);
      
      if (newHost) {
        newHost.role = 'HOST';
        logger.info('New host assigned', {
          roomId,
          newHostId: newHost.userId,
          newHostUsername: newHost.username,
        });
      }
    }

    this.emit('room:left', { room, userId, participant });

    // Clean up empty room
    if (room.participants.size === 0) {
      this.deleteRoom(roomId);
    }
  }

  /**
   * Handle user disconnect
   */
  public handleUserDisconnect(userId: string, socketId: string): void {
    const userRoomIds = this.userRooms.get(userId);
    if (!userRoomIds) {
      return;
    }

    for (const roomId of userRoomIds) {
      const room = this.rooms.get(roomId);
      if (!room) continue;

      const participant = room.participants.get(userId);
      if (!participant) continue;

      if (room.settings.allowReconnection) {
        // Mark as offline but keep in room
        participant.isOnline = false;
        participant.lastActivity = new Date();
        
        // Update current players count to only count online players
        room.currentPlayers = Array.from(room.participants.values())
          .filter(p => p.isOnline).length;
        
        logger.info('User marked offline in room', {
          userId,
          roomId,
          roomCode: room.code,
          currentOnlinePlayers: room.currentPlayers,
        });

        this.emit('room:user_offline', { room, userId });
      } else {
        // Remove from room immediately
        this.leaveRoom(userId, socketId, roomId);
      }
    }
  }

  /**
   * Delete a room
   */
  public deleteRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    // Remove all participants from tracking
    room.participants.forEach((_, userId) => {
      const userRoomIds = this.userRooms.get(userId);
      if (userRoomIds) {
        userRoomIds.delete(roomId);
        if (userRoomIds.size === 0) {
          this.userRooms.delete(userId);
        }
      }
    });

    // Remove room mappings
    this.rooms.delete(roomId);
    this.roomCodes.delete(room.code);

    logger.info('Room deleted', {
      roomId,
      roomCode: room.code,
      name: room.name,
      participantCount: room.participants.size,
    });

    this.emit('room:deleted', { room });
  }

  /**
   * Get room by ID
   */
  public getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get room by code
   */
  public getRoomByCode(code: string): RoomState | undefined {
    const roomId = this.roomCodes.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /**
   * Get rooms for user
   */
  public getUserRooms(userId: string): RoomState[] {
    const userRoomIds = this.userRooms.get(userId);
    if (!userRoomIds) {
      return [];
    }

    return Array.from(userRoomIds)
      .map(roomId => this.rooms.get(roomId))
      .filter(Boolean) as RoomState[];
  }

  /**
   * Get public rooms list
   */
  public getPublicRooms(limit: number = 20): RoomListEntry[] {
    const publicRooms = Array.from(this.rooms.values())
      .filter(room => !room.isPrivate && room.status === 'WAITING')
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      .slice(0, limit);

    return publicRooms.map(room => ({
      id: room.id,
      code: room.code,
      name: room.name,
      currentPlayers: room.currentPlayers,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      hasPassword: !!room.password,
      status: room.status,
      createdAt: room.createdAt,
    }));
  }

  /**
   * Update room settings
   */
  public updateRoomSettings(
    roomId: string,
    hostId: string,
    settings: Partial<RoomSettings>
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new SocketError('ROOM_NOT_FOUND', 'Room not found');
    }

    const host = room.participants.get(hostId);
    if (!host || host.role !== 'HOST') {
      throw new SocketError('PERMISSION_DENIED', 'Only host can update room settings');
    }

    // Validate settings
    if (settings.questionTimeLimit && (settings.questionTimeLimit < 10 || settings.questionTimeLimit > 300)) {
      throw new SocketError('INVALID_SETTING', 'Question time limit must be between 10 and 300 seconds');
    }

    room.settings = { ...room.settings, ...settings };
    room.lastActivity = new Date();

    logger.info('Room settings updated', {
      roomId,
      hostId,
      settings,
    });

    this.emit('room:settings_updated', { room, settings });
  }

  /**
   * Update room status (for game integration)
   */
  public updateRoomStatus(roomId: string, status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'PAUSED', quizId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.warn('Attempted to update status of non-existent room', { roomId });
      return;
    }

    const oldStatus = room.status;
    room.status = status;
    room.lastActivity = new Date();

    if (quizId) {
      room.quizId = quizId;
    }

    logger.info('Room status updated', {
      roomId,
      oldStatus,
      newStatus: status,
      quizId,
    });

    this.emit('room:status_changed', { room, oldStatus, newStatus: status });
  }

  /**
   * Get active room count
   */
  public getActiveRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Get room statistics
   */
  public getRoomStats() {
    const rooms = Array.from(this.rooms.values());
    
    return {
      totalRooms: rooms.length,
      publicRooms: rooms.filter(r => !r.isPrivate).length,
      privateRooms: rooms.filter(r => r.isPrivate).length,
      waitingRooms: rooms.filter(r => r.status === 'WAITING').length,
      activeRooms: rooms.filter(r => r.status === 'IN_PROGRESS').length,
      totalParticipants: rooms.reduce((sum, r) => sum + r.currentPlayers, 0),
      averagePlayersPerRoom: rooms.length > 0 
        ? rooms.reduce((sum, r) => sum + r.currentPlayers, 0) / rooms.length 
        : 0,
    };
  }

  /**
   * Clean up inactive rooms
   */
  public cleanupInactiveRooms(): void {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    let cleanedCount = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      const timeSinceActivity = now.getTime() - room.lastActivity.getTime();
      
      if (timeSinceActivity > inactiveThreshold) {
        // Check if any participants are still online
        const hasOnlineParticipants = Array.from(room.participants.values())
          .some(p => p.isOnline);

        if (!hasOnlineParticipants) {
          this.deleteRoom(roomId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} inactive rooms`);
    }
  }

  /**
   * Start cleanup routine
   */
  private startCleanupRoutine(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveRooms();
    }, 10 * 60 * 1000); // Every 10 minutes
  }

  /**
   * Cleanup all resources
   */
  public cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.rooms.clear();
    this.roomCodes.clear();
    this.userRooms.clear();
    this.removeAllListeners();

    logger.info('Room manager cleanup completed');
  }
}

// Export singleton instance
export const roomManager = new RoomManager();
