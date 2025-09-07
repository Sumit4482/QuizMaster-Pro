import { Socket } from 'socket.io';
import { logger } from '@/config/logger';
import { SocketUser, ConnectionInfo, ExtendedSocket, UserPresence } from '../types/socket';
import { EventEmitter } from 'events';

/**
 * Connection Manager
 * Handles WebSocket connection lifecycle, tracking, and management
 */
class ConnectionManager extends EventEmitter {
  private connections: Map<string, ConnectionInfo> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startHeartbeat();
    this.startCleanupRoutine();
  }

  /**
   * Add a new connection
   */
  public addConnection(socket: ExtendedSocket, user: SocketUser): void {
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      userId: user.id,
      username: user.username,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      rooms: new Set(),
    };

    // Store connection info
    this.connections.set(socket.id, connectionInfo);

    // Track user connections (a user might have multiple connections)
    if (!this.userConnections.has(user.id)) {
      this.userConnections.set(user.id, new Set());
    }
    this.userConnections.get(user.id)!.add(socket.id);

    logger.info('Connection registered', {
      socketId: socket.id,
      userId: user.id,
      totalConnections: this.connections.size,
      userConnections: this.userConnections.get(user.id)!.size,
    });

    // Set up connection monitoring
    this.setupConnectionMonitoring(socket);

    // Emit connection event
    this.emit('connection:added', { socket, user, connectionInfo });
  }

  /**
   * Remove a connection
   */
  public removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    
    if (!connection) {
      logger.warn('Attempted to remove non-existent connection', { socketId });
      return;
    }

    const { userId, username, connectedAt, rooms } = connection;
    const connectedTime = Date.now() - connectedAt;

    // Remove from connections
    this.connections.delete(socketId);

    // Remove from user connections
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    logger.info('Connection removed', {
      socketId,
      userId,
      username,
      connectedTime,
      roomsCount: rooms.size,
      totalConnections: this.connections.size,
    });

    // Emit disconnection event
    this.emit('connection:removed', { socketId, userId, connectedTime, rooms });
  }

  /**
   * Update connection activity
   */
  public updateActivity(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }

  /**
   * Add room to connection
   */
  public addRoomToConnection(socketId: string, roomId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.rooms.add(roomId);
      logger.debug('Room added to connection', { socketId, roomId });
    }
  }

  /**
   * Remove room from connection
   */
  public removeRoomFromConnection(socketId: string, roomId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.rooms.delete(roomId);
      logger.debug('Room removed from connection', { socketId, roomId });
    }
  }

  /**
   * Get connection info by socket ID
   */
  public getConnection(socketId: string): ConnectionInfo | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Get all connections for a user
   */
  public getUserConnections(userId: string): ConnectionInfo[] {
    const socketIds = this.userConnections.get(userId);
    if (!socketIds) {
      return [];
    }

    return Array.from(socketIds)
      .map(socketId => this.connections.get(socketId))
      .filter(Boolean) as ConnectionInfo[];
  }

  /**
   * Check if user is online
   */
  public isUserOnline(userId: string): boolean {
    const userSockets = this.userConnections.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  /**
   * Get user presence information
   */
  public getUserPresence(userId: string): UserPresence | null {
    const connections = this.getUserConnections(userId);
    
    if (connections.length === 0) {
      return null;
    }

    // Get the most recent connection
    const mostRecentConnection = connections.reduce((latest, current) => 
      current.lastActivity > latest.lastActivity ? current : latest
    );

    const isIdle = Date.now() - mostRecentConnection.lastActivity > 5 * 60 * 1000; // 5 minutes

    return {
      userId,
      username: mostRecentConnection.username,
      isOnline: true,
      lastSeen: new Date(mostRecentConnection.lastActivity),
      status: isIdle ? 'IDLE' : 'ONLINE',
    };
  }

  /**
   * Get all online users
   */
  public getOnlineUsers(): UserPresence[] {
    const onlineUsers: UserPresence[] = [];
    
    for (const userId of this.userConnections.keys()) {
      const presence = this.getUserPresence(userId);
      if (presence) {
        onlineUsers.push(presence);
      }
    }

    return onlineUsers;
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats() {
    const now = Date.now();
    const connections = Array.from(this.connections.values());
    
    const activeConnections = connections.filter(
      conn => now - conn.lastActivity < 30000 // Active within 30 seconds
    ).length;

    const totalRooms = new Set(
      connections.flatMap(conn => Array.from(conn.rooms))
    ).size;

    return {
      totalConnections: this.connections.size,
      uniqueUsers: this.userConnections.size,
      activeConnections,
      totalRooms,
      averageConnectionTime: connections.length > 0 
        ? connections.reduce((sum, conn) => sum + (now - conn.connectedAt), 0) / connections.length
        : 0,
    };
  }

  /**
   * Get connection count
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connections in room
   */
  public getConnectionsInRoom(roomId: string): ConnectionInfo[] {
    return Array.from(this.connections.values()).filter(
      connection => connection.rooms.has(roomId)
    );
  }

  /**
   * Clean up stale connections
   */
  public cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    let cleanedCount = 0;

    for (const [socketId, connection] of this.connections.entries()) {
      if (now - connection.lastActivity > staleThreshold) {
        this.removeConnection(socketId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} stale connections`);
    }
  }

  /**
   * Setup connection monitoring for a socket
   */
  private setupConnectionMonitoring(socket: ExtendedSocket): void {
    // Track activity on any event
    const originalEmit = socket.emit.bind(socket);
    socket.emit = (event: string, ...args: any[]) => {
      this.updateActivity(socket.id);
      return originalEmit(event, ...args);
    };

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      this.updateActivity(socket.id);
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle explicit heartbeat events
    socket.on('heartbeat', () => {
      this.updateActivity(socket.id);
      socket.emit('heartbeat:ack', { timestamp: Date.now() });
    });
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const stats = this.getConnectionStats();
      logger.debug('Connection heartbeat', stats);
    }, 30000); // Every 30 seconds
  }

  /**
   * Start cleanup routine
   */
  private startCleanupRoutine(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup all resources
   */
  public cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.connections.clear();
    this.userConnections.clear();
    this.removeAllListeners();

    logger.info('Connection manager cleanup completed');
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
