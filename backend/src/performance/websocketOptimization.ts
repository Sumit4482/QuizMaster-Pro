import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../utils/logger';
import { CacheService } from '../infrastructure/cache/cacheService';
import { AdvancedRateLimiting } from '../security/advancedRateLimiting';

export interface WebSocketConnection {
  id: string;
  socket: WebSocket;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Set<string>;
  metadata: Record<string, any>;
  messageCount: number;
  bytesReceived: number;
  bytesSent: number;
  isAlive: boolean;
  roomId?: string;
}

export interface MessageQueue {
  connectionId: string;
  messages: QueuedMessage[];
  processing: boolean;
  lastProcessed: Date;
}

export interface QueuedMessage {
  id: string;
  type: string;
  data: any;
  priority: number;
  timestamp: Date;
  attempts: number;
  maxAttempts: number;
}

export interface WebSocketPool {
  id: string;
  connections: Map<string, WebSocketConnection>;
  messageQueues: Map<string, MessageQueue>;
  subscriptions: Map<string, Set<string>>; // topic -> connection IDs
  rooms: Map<string, Set<string>>; // room -> connection IDs
  stats: {
    totalConnections: number;
    activeConnections: number;
    messagesPerSecond: number;
    bytesPerSecond: number;
    averageLatency: number;
    errorRate: number;
  };
}

export interface WebSocketConfig {
  maxConnections: number;
  maxConnectionsPerIP: number;
  connectionTimeout: number;
  heartbeatInterval: number;
  messageQueueSize: number;
  compressionEnabled: boolean;
  rateLimiting: {
    messagesPerSecond: number;
    bytesPerSecond: number;
    burstSize: number;
  };
  clustering: {
    enabled: boolean;
    redisChannel: string;
  };
}

export class WebSocketOptimization {
  private pools: Map<string, WebSocketPool> = new Map();
  private cacheService: CacheService;
  private rateLimiting: AdvancedRateLimiting;
  private config: WebSocketConfig;
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;

  constructor(
    cacheService: CacheService,
    rateLimiting: AdvancedRateLimiting,
    config: WebSocketConfig
  ) {
    this.cacheService = cacheService;
    this.rateLimiting = rateLimiting;
    this.config = config;

    this.startHeartbeat();
    this.startCleanup();
    this.startMetricsCollection();

    logger.info('WebSocket Optimization service initialized', {
      component: 'WebSocketOptimization',
      config: {
        maxConnections: config.maxConnections,
        compressionEnabled: config.compressionEnabled,
        clusteringEnabled: config.clustering.enabled
      }
    });
  }

  /**
   * Create optimized WebSocket server
   */
  createOptimizedServer(server: any, path: string = '/ws'): WebSocket.Server {
    const wss = new WebSocket.Server({
      server,
      path,
      perMessageDeflate: this.config.compressionEnabled ? {
        zlibDeflateOptions: {
          threshold: 1024,
          concurrencyLimit: 10,
        },
        clientMaxNoCompressMask: 0,
        clientMaxWindowBits: 15,
        serverMaxNoCompressMask: 0,
        serverMaxWindowBits: 15,
        serverNoContextTakeover: false,
        clientNoContextTakeover: false,
        threshold: 1024,
        concurrencyLimit: 10,
        chunkSize: 1024,
      } : false,
      maxPayload: 16 * 1024 * 1024 // 16MB
    });

    // Create pool for this server
    const poolId = `pool_${Date.now()}`;
    const pool: WebSocketPool = {
      id: poolId,
      connections: new Map(),
      messageQueues: new Map(),
      subscriptions: new Map(),
      rooms: new Map(),
      stats: {
        totalConnections: 0,
        activeConnections: 0,
        messagesPerSecond: 0,
        bytesPerSecond: 0,
        averageLatency: 0,
        errorRate: 0
      }
    };

    this.pools.set(poolId, pool);

    // Handle new connections
    wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
      await this.handleNewConnection(pool, ws, request);
    });

    wss.on('error', (error) => {
      logger.error('WebSocket server error', {
        component: 'WebSocketOptimization',
        poolId,
        error: error.message
      });
    });

    logger.info('WebSocket server created', {
      component: 'WebSocketOptimization',
      poolId,
      path
    });

    return wss;
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleNewConnection(pool: WebSocketPool, ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      const ipAddress = this.extractIPAddress(request);
      const userAgent = request.headers['user-agent'];

      // Check connection limits
      if (pool.connections.size >= this.config.maxConnections) {
        ws.close(1013, 'Server capacity exceeded');
        return;
      }

      // Check IP-based connection limits
      const ipConnections = Array.from(pool.connections.values())
        .filter(conn => conn.ipAddress === ipAddress).length;

      if (ipConnections >= this.config.maxConnectionsPerIP) {
        ws.close(1013, 'Too many connections from this IP');
        return;
      }

      // Rate limiting check
      const rateLimitKey = `websocket:${ipAddress}`;
      const rateLimitInfo = await this.rateLimiting.checkLimit('websocket', rateLimitKey);
      
      if (rateLimitInfo.isBlocked) {
        ws.close(1013, 'Rate limit exceeded');
        return;
      }

      // Create connection object
      const connectionId = this.generateConnectionId();
      const connection: WebSocketConnection = {
        id: connectionId,
        socket: ws,
        ipAddress,
        userAgent,
        connectedAt: new Date(),
        lastActivity: new Date(),
        subscriptions: new Set(),
        metadata: {},
        messageCount: 0,
        bytesReceived: 0,
        bytesSent: 0,
        isAlive: true
      };

      // Add to pool
      pool.connections.set(connectionId, connection);
      pool.stats.totalConnections++;
      pool.stats.activeConnections++;

      // Create message queue
      pool.messageQueues.set(connectionId, {
        connectionId,
        messages: [],
        processing: false,
        lastProcessed: new Date()
      });

      // Set up connection event handlers
      this.setupConnectionHandlers(pool, connection);

      // Send welcome message
      this.sendMessage(connection, {
        type: 'connection_established',
        data: {
          connectionId,
          serverTime: new Date().toISOString(),
          compressionEnabled: this.config.compressionEnabled
        }
      });

      logger.info('New WebSocket connection established', {
        component: 'WebSocketOptimization',
        connectionId,
        ipAddress,
        totalConnections: pool.connections.size
      });

    } catch (error) {
      logger.error('Failed to handle new WebSocket connection', {
        component: 'WebSocketOptimization',
        error: error instanceof Error ? error.message : String(error)
      });
      
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Setup event handlers for a WebSocket connection
   */
  private setupConnectionHandlers(pool: WebSocketPool, connection: WebSocketConnection): void {
    const { socket, id } = connection;

    // Handle incoming messages
    socket.on('message', async (data: WebSocket.Data) => {
      try {
        await this.handleIncomingMessage(pool, connection, data);
      } catch (error) {
        logger.error('Error handling WebSocket message', {
          component: 'WebSocketOptimization',
          connectionId: id,
          error: error instanceof Error ? error.message : String(error)
        });
        
        this.sendMessage(connection, {
          type: 'error',
          data: { message: 'Message processing failed' }
        });
      }
    });

    // Handle connection close
    socket.on('close', (code: number, reason: Buffer) => {
      this.handleConnectionClose(pool, connection, code, reason.toString());
    });

    // Handle connection errors
    socket.on('error', (error: Error) => {
      logger.error('WebSocket connection error', {
        component: 'WebSocketOptimization',
        connectionId: id,
        error: error.message
      });
      
      pool.stats.errorRate++;
    });

    // Handle pong responses (heartbeat)
    socket.on('pong', () => {
      connection.isAlive = true;
      connection.lastActivity = new Date();
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleIncomingMessage(
    pool: WebSocketPool, 
    connection: WebSocketConnection, 
    data: WebSocket.Data
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Convert data to string
      const messageStr = data.toString();
      const messageSize = Buffer.byteLength(messageStr, 'utf8');

      // Update connection stats
      connection.messageCount++;
      connection.bytesReceived += messageSize;
      connection.lastActivity = new Date();

      // Rate limiting check
      const rateLimitKey = `websocket_messages:${connection.ipAddress}`;
      if (connection.messageCount % 10 === 0) { // Check every 10 messages
        const rateLimitInfo = await this.rateLimiting.checkLimit('websocket', rateLimitKey);
        
        if (rateLimitInfo.isBlocked) {
          this.sendMessage(connection, {
            type: 'rate_limit_exceeded',
            data: { message: 'Message rate limit exceeded' }
          });
          return;
        }
      }

      // Parse message
      let message: any;
      try {
        message = JSON.parse(messageStr);
      } catch (error) {
        throw new Error('Invalid JSON message format');
      }

      // Validate message structure
      if (!message.type || typeof message.type !== 'string') {
        throw new Error('Message must have a valid type');
      }

      // Process message based on type
      await this.processMessage(pool, connection, message);

      // Update performance metrics
      const processingTime = Date.now() - startTime;
      pool.stats.averageLatency = (pool.stats.averageLatency + processingTime) / 2;

    } catch (error) {
      logger.warn('Failed to process WebSocket message', {
        component: 'WebSocketOptimization',
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error)
      });

      this.sendMessage(connection, {
        type: 'message_error',
        data: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Process specific message types
   */
  private async processMessage(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    message: any
  ): Promise<void> {
    switch (message.type) {
      case 'auth':
        await this.handleAuthentication(pool, connection, message.data);
        break;

      case 'subscribe':
        await this.handleSubscription(pool, connection, message.data);
        break;

      case 'unsubscribe':
        await this.handleUnsubscription(pool, connection, message.data);
        break;

      case 'join_room':
        await this.handleJoinRoom(pool, connection, message.data);
        break;

      case 'leave_room':
        await this.handleLeaveRoom(pool, connection, message.data);
        break;

      case 'send_message':
        await this.handleSendMessage(pool, connection, message.data);
        break;

      case 'ping':
        this.sendMessage(connection, { type: 'pong', data: { timestamp: Date.now() } });
        break;

      case 'batch_messages':
        await this.handleBatchMessages(pool, connection, message.data);
        break;

      default:
        logger.warn('Unknown message type', {
          component: 'WebSocketOptimization',
          connectionId: connection.id,
          messageType: message.type
        });
        
        this.sendMessage(connection, {
          type: 'unknown_message_type',
          data: { type: message.type }
        });
    }
  }

  /**
   * Handle authentication
   */
  private async handleAuthentication(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    data: any
  ): Promise<void> {
    try {
      // Validate authentication data
      if (!data.token && !data.sessionId) {
        throw new Error('Authentication token or session ID required');
      }

      // Authenticate user (simplified - would integrate with actual auth system)
      const userId = await this.authenticateUser(data.token || data.sessionId);
      
      if (!userId) {
        throw new Error('Authentication failed');
      }

      connection.userId = userId;
      connection.sessionId = data.sessionId;
      connection.metadata.authenticated = true;

      // Cache user connection
      await this.cacheService.set(
        `websocket_user:${userId}`,
        connection.id,
        { namespace: 'websocket', ttl: 3600 }
      );

      this.sendMessage(connection, {
        type: 'auth_success',
        data: { 
          userId,
          connectionId: connection.id,
          timestamp: new Date().toISOString()
        }
      });

      logger.info('WebSocket authentication successful', {
        component: 'WebSocketOptimization',
        connectionId: connection.id,
        userId
      });

    } catch (error) {
      this.sendMessage(connection, {
        type: 'auth_error',
        data: { 
          error: error instanceof Error ? error.message : 'Authentication failed'
        }
      });
    }
  }

  /**
   * Handle subscription to topics
   */
  private async handleSubscription(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    data: any
  ): Promise<void> {
    try {
      const { topics } = data;
      
      if (!Array.isArray(topics)) {
        throw new Error('Topics must be an array');
      }

      for (const topic of topics) {
        if (typeof topic !== 'string') continue;

        connection.subscriptions.add(topic);

        // Add to pool subscriptions
        if (!pool.subscriptions.has(topic)) {
          pool.subscriptions.set(topic, new Set());
        }
        pool.subscriptions.get(topic)!.add(connection.id);
      }

      this.sendMessage(connection, {
        type: 'subscription_success',
        data: { 
          topics: Array.from(connection.subscriptions),
          timestamp: new Date().toISOString()
        }
      });

      logger.debug('WebSocket subscription successful', {
        component: 'WebSocketOptimization',
        connectionId: connection.id,
        topics
      });

    } catch (error) {
      this.sendMessage(connection, {
        type: 'subscription_error',
        data: { 
          error: error instanceof Error ? error.message : 'Subscription failed'
        }
      });
    }
  }

  /**
   * Handle unsubscription from topics
   */
  private async handleUnsubscription(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    data: any
  ): Promise<void> {
    try {
      const { topics } = data;
      
      if (!Array.isArray(topics)) {
        throw new Error('Topics must be an array');
      }

      for (const topic of topics) {
        if (typeof topic !== 'string') continue;

        connection.subscriptions.delete(topic);

        // Remove from pool subscriptions
        const topicSubscriptions = pool.subscriptions.get(topic);
        if (topicSubscriptions) {
          topicSubscriptions.delete(connection.id);
          if (topicSubscriptions.size === 0) {
            pool.subscriptions.delete(topic);
          }
        }
      }

      this.sendMessage(connection, {
        type: 'unsubscription_success',
        data: { 
          topics,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.sendMessage(connection, {
        type: 'unsubscription_error',
        data: { 
          error: error instanceof Error ? error.message : 'Unsubscription failed'
        }
      });
    }
  }

  /**
   * Handle joining a room
   */
  private async handleJoinRoom(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    data: any
  ): Promise<void> {
    try {
      const { roomId } = data;
      
      if (!roomId || typeof roomId !== 'string') {
        throw new Error('Valid room ID required');
      }

      connection.roomId = roomId;

      // Add to pool rooms
      if (!pool.rooms.has(roomId)) {
        pool.rooms.set(roomId, new Set());
      }
      pool.rooms.get(roomId)!.add(connection.id);

      this.sendMessage(connection, {
        type: 'room_joined',
        data: { 
          roomId,
          timestamp: new Date().toISOString()
        }
      });

      // Notify other room members
      await this.broadcastToRoom(pool, roomId, {
        type: 'user_joined_room',
        data: {
          userId: connection.userId,
          connectionId: connection.id,
          roomId,
          timestamp: new Date().toISOString()
        }
      }, connection.id);

      logger.debug('WebSocket joined room', {
        component: 'WebSocketOptimization',
        connectionId: connection.id,
        roomId
      });

    } catch (error) {
      this.sendMessage(connection, {
        type: 'room_join_error',
        data: { 
          error: error instanceof Error ? error.message : 'Failed to join room'
        }
      });
    }
  }

  /**
   * Handle leaving a room
   */
  private async handleLeaveRoom(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    data: any
  ): Promise<void> {
    try {
      const roomId = data.roomId || connection.roomId;
      
      if (!roomId) {
        throw new Error('No room to leave');
      }

      // Remove from room
      const roomConnections = pool.rooms.get(roomId);
      if (roomConnections) {
        roomConnections.delete(connection.id);
        if (roomConnections.size === 0) {
          pool.rooms.delete(roomId);
        }
      }

      connection.roomId = undefined;

      this.sendMessage(connection, {
        type: 'room_left',
        data: { 
          roomId,
          timestamp: new Date().toISOString()
        }
      });

      // Notify other room members
      await this.broadcastToRoom(pool, roomId, {
        type: 'user_left_room',
        data: {
          userId: connection.userId,
          connectionId: connection.id,
          roomId,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.sendMessage(connection, {
        type: 'room_leave_error',
        data: { 
          error: error instanceof Error ? error.message : 'Failed to leave room'
        }
      });
    }
  }

  /**
   * Handle sending messages
   */
  private async handleSendMessage(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    data: any
  ): Promise<void> {
    try {
      const { target, targetId, message } = data;

      switch (target) {
        case 'user':
          await this.sendMessageToUser(pool, targetId, message, connection.id);
          break;

        case 'room':
          await this.broadcastToRoom(pool, targetId, message, connection.id);
          break;

        case 'topic':
          await this.broadcastToTopic(pool, targetId, message, connection.id);
          break;

        default:
          throw new Error('Invalid message target');
      }

      this.sendMessage(connection, {
        type: 'message_sent',
        data: { 
          target,
          targetId,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.sendMessage(connection, {
        type: 'message_send_error',
        data: { 
          error: error instanceof Error ? error.message : 'Failed to send message'
        }
      });
    }
  }

  /**
   * Handle batch messages for better performance
   */
  private async handleBatchMessages(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    data: any
  ): Promise<void> {
    try {
      const { messages } = data;
      
      if (!Array.isArray(messages)) {
        throw new Error('Messages must be an array');
      }

      const results = [];
      
      for (const message of messages) {
        try {
          await this.processMessage(pool, connection, message);
          results.push({ success: true, messageId: message.id });
        } catch (error) {
          results.push({ 
            success: false, 
            messageId: message.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      this.sendMessage(connection, {
        type: 'batch_results',
        data: { results }
      });

    } catch (error) {
      this.sendMessage(connection, {
        type: 'batch_error',
        data: { 
          error: error instanceof Error ? error.message : 'Batch processing failed'
        }
      });
    }
  }

  /**
   * Send message to a specific user
   */
  private async sendMessageToUser(pool: WebSocketPool, userId: string, message: any, senderId?: string): Promise<void> {
    try {
      // Find user's connection
      const targetConnection = Array.from(pool.connections.values())
        .find(conn => conn.userId === userId);

      if (!targetConnection) {
        // User not connected, could queue message or store for later
        logger.warn('Target user not connected', {
          component: 'WebSocketOptimization',
          userId,
          senderId
        });
        return;
      }

      this.sendMessage(targetConnection, {
        type: 'direct_message',
        data: {
          from: senderId,
          message,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Failed to send message to user', {
        component: 'WebSocketOptimization',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Broadcast message to all connections in a room
   */
  private async broadcastToRoom(pool: WebSocketPool, roomId: string, message: any, excludeConnectionId?: string): Promise<void> {
    try {
      const roomConnections = pool.rooms.get(roomId);
      if (!roomConnections) return;

      for (const connectionId of roomConnections) {
        if (connectionId === excludeConnectionId) continue;

        const connection = pool.connections.get(connectionId);
        if (connection) {
          this.queueMessage(pool, connection, {
            id: this.generateMessageId(),
            type: 'room_message',
            data: {
              roomId,
              message,
              timestamp: new Date().toISOString()
            },
            priority: 5,
            timestamp: new Date(),
            attempts: 0,
            maxAttempts: 3
          });
        }
      }

      // Process message queues
      await this.processMessageQueues(pool);

    } catch (error) {
      logger.error('Failed to broadcast to room', {
        component: 'WebSocketOptimization',
        roomId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Broadcast message to all subscribers of a topic
   */
  private async broadcastToTopic(pool: WebSocketPool, topic: string, message: any, excludeConnectionId?: string): Promise<void> {
    try {
      const topicSubscriptions = pool.subscriptions.get(topic);
      if (!topicSubscriptions) return;

      for (const connectionId of topicSubscriptions) {
        if (connectionId === excludeConnectionId) continue;

        const connection = pool.connections.get(connectionId);
        if (connection) {
          this.queueMessage(pool, connection, {
            id: this.generateMessageId(),
            type: 'topic_message',
            data: {
              topic,
              message,
              timestamp: new Date().toISOString()
            },
            priority: 3,
            timestamp: new Date(),
            attempts: 0,
            maxAttempts: 3
          });
        }
      }

      // Process message queues
      await this.processMessageQueues(pool);

    } catch (error) {
      logger.error('Failed to broadcast to topic', {
        component: 'WebSocketOptimization',
        topic,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Queue message for batched delivery
   */
  private queueMessage(pool: WebSocketPool, connection: WebSocketConnection, message: QueuedMessage): void {
    const queue = pool.messageQueues.get(connection.id);
    if (!queue) return;

    queue.messages.push(message);

    // Limit queue size
    if (queue.messages.length > this.config.messageQueueSize) {
      queue.messages.shift(); // Remove oldest message
    }
  }

  /**
   * Process message queues for batched delivery
   */
  private async processMessageQueues(pool: WebSocketPool): Promise<void> {
    for (const [connectionId, queue] of pool.messageQueues.entries()) {
      if (queue.processing || queue.messages.length === 0) continue;

      const connection = pool.connections.get(connectionId);
      if (!connection || connection.socket.readyState !== WebSocket.OPEN) continue;

      queue.processing = true;

      try {
        // Sort messages by priority (higher number = higher priority)
        queue.messages.sort((a, b) => b.priority - a.priority);

        // Send messages in batches
        const batchSize = 10;
        while (queue.messages.length > 0) {
          const batch = queue.messages.splice(0, batchSize);
          
          for (const message of batch) {
            try {
              this.sendMessage(connection, message);
            } catch (error) {
              // Retry logic
              if (message.attempts < message.maxAttempts) {
                message.attempts++;
                queue.messages.push(message);
              } else {
                logger.warn('Message delivery failed after max attempts', {
                  component: 'WebSocketOptimization',
                  connectionId,
                  messageId: message.id
                });
              }
            }
          }

          // Small delay between batches to prevent overwhelming the connection
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        queue.lastProcessed = new Date();
      } finally {
        queue.processing = false;
      }
    }
  }

  /**
   * Send message to a specific connection
   */
  private sendMessage(connection: WebSocketConnection, message: any): void {
    if (connection.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      const messageSize = Buffer.byteLength(messageStr, 'utf8');

      connection.socket.send(messageStr);
      connection.bytesSent += messageSize;
      connection.lastActivity = new Date();

    } catch (error) {
      logger.error('Failed to send WebSocket message', {
        component: 'WebSocketOptimization',
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(
    pool: WebSocketPool,
    connection: WebSocketConnection,
    code: number,
    reason: string
  ): void {
    try {
      // Remove from pool
      pool.connections.delete(connection.id);
      pool.messageQueues.delete(connection.id);
      pool.stats.activeConnections = Math.max(0, pool.stats.activeConnections - 1);

      // Clean up subscriptions
      for (const topic of connection.subscriptions) {
        const topicSubscriptions = pool.subscriptions.get(topic);
        if (topicSubscriptions) {
          topicSubscriptions.delete(connection.id);
          if (topicSubscriptions.size === 0) {
            pool.subscriptions.delete(topic);
          }
        }
      }

      // Clean up room membership
      if (connection.roomId) {
        const roomConnections = pool.rooms.get(connection.roomId);
        if (roomConnections) {
          roomConnections.delete(connection.id);
          if (roomConnections.size === 0) {
            pool.rooms.delete(connection.roomId);
          }
        }

        // Notify room members
        this.broadcastToRoom(pool, connection.roomId, {
          type: 'user_left_room',
          data: {
            userId: connection.userId,
            connectionId: connection.id,
            roomId: connection.roomId,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Clear user cache
      if (connection.userId) {
        this.cacheService.del(`websocket_user:${connection.userId}`, 'websocket');
      }

      logger.info('WebSocket connection closed', {
        component: 'WebSocketOptimization',
        connectionId: connection.id,
        userId: connection.userId,
        code,
        reason,
        duration: Date.now() - connection.connectedAt.getTime(),
        messageCount: connection.messageCount,
        bytesReceived: connection.bytesReceived,
        bytesSent: connection.bytesSent
      });

    } catch (error) {
      logger.error('Error handling connection close', {
        component: 'WebSocketOptimization',
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const pool of this.pools.values()) {
        for (const connection of pool.connections.values()) {
          if (!connection.isAlive) {
            // Connection appears to be dead
            connection.socket.terminate();
            continue;
          }

          // Check for idle connections
          const idleTime = Date.now() - connection.lastActivity.getTime();
          if (idleTime > this.config.connectionTimeout) {
            connection.socket.close(1000, 'Connection timeout');
            continue;
          }

          // Send ping
          connection.isAlive = false;
          connection.socket.ping();
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Start cleanup routine
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      for (const pool of this.pools.values()) {
        // Clean up dead connections
        const deadConnections: string[] = [];
        
        for (const [connectionId, connection] of pool.connections.entries()) {
          if (connection.socket.readyState === WebSocket.CLOSED || 
              connection.socket.readyState === WebSocket.CLOSING) {
            deadConnections.push(connectionId);
          }
        }

        for (const connectionId of deadConnections) {
          const connection = pool.connections.get(connectionId);
          if (connection) {
            this.handleConnectionClose(pool, connection, 1006, 'Connection cleanup');
          }
        }

        // Clean up empty message queues
        for (const [connectionId, queue] of pool.messageQueues.entries()) {
          if (!pool.connections.has(connectionId)) {
            pool.messageQueues.delete(connectionId);
          }
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      for (const [poolId, pool] of this.pools.entries()) {
        // Calculate messages per second
        const totalMessages = Array.from(pool.connections.values())
          .reduce((sum, conn) => sum + conn.messageCount, 0);
        
        // Calculate bytes per second
        const totalBytes = Array.from(pool.connections.values())
          .reduce((sum, conn) => sum + conn.bytesReceived + conn.bytesSent, 0);

        pool.stats.messagesPerSecond = totalMessages / 60; // Approximate
        pool.stats.bytesPerSecond = totalBytes / 60; // Approximate

        // Store metrics in cache
        await this.cacheService.set(
          `websocket_metrics:${poolId}`,
          pool.stats,
          { namespace: 'websocket', ttl: 300 }
        );
      }
    }, 60000); // Every minute
  }

  /**
   * Authenticate user (simplified)
   */
  private async authenticateUser(token: string): Promise<string | null> {
    try {
      // In a real implementation, this would validate JWT tokens or session IDs
      // For now, return a mock user ID if token is provided
      return token ? `user_${token.substring(0, 8)}` : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract IP address from request
   */
  private extractIPAddress(request: IncomingMessage): string {
    return (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           request.socket.remoteAddress ||
           'unknown';
  }

  /**
   * Generate connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get pool statistics
   */
  getPoolStats(poolId?: string): Map<string, WebSocketPool> | WebSocketPool | null {
    if (poolId) {
      return this.pools.get(poolId) || null;
    }
    return this.pools;
  }

  /**
   * Get overall WebSocket statistics
   */
  getOverallStats(): {
    totalPools: number;
    totalConnections: number;
    totalActiveConnections: number;
    totalMessagesPerSecond: number;
    totalBytesPerSecond: number;
    averageLatency: number;
  } {
    let totalConnections = 0;
    let totalActiveConnections = 0;
    let totalMessagesPerSecond = 0;
    let totalBytesPerSecond = 0;
    let totalLatency = 0;
    let poolCount = 0;

    for (const pool of this.pools.values()) {
      totalConnections += pool.stats.totalConnections;
      totalActiveConnections += pool.stats.activeConnections;
      totalMessagesPerSecond += pool.stats.messagesPerSecond;
      totalBytesPerSecond += pool.stats.bytesPerSecond;
      totalLatency += pool.stats.averageLatency;
      poolCount++;
    }

    return {
      totalPools: this.pools.size,
      totalConnections,
      totalActiveConnections,
      totalMessagesPerSecond,
      totalBytesPerSecond,
      averageLatency: poolCount > 0 ? totalLatency / poolCount : 0
    };
  }

  /**
   * Shutdown WebSocket optimization service
   */
  shutdown(): void {
    // Clear timers
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);

    // Close all connections
    for (const pool of this.pools.values()) {
      for (const connection of pool.connections.values()) {
        connection.socket.close(1001, 'Server shutdown');
      }
    }

    logger.info('WebSocket Optimization service shutdown', {
      component: 'WebSocketOptimization',
      poolsShutdown: this.pools.size
    });
  }
}

export default WebSocketOptimization;

