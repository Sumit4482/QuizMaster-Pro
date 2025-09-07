import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { config } from '@/config/environment';
import { logger } from '@/config/logger';
import { authenticateSocket } from './middleware/socketAuth';
import { connectionManager } from './managers/connectionManager';
import { roomManager } from './managers/roomManager';
import { eventHandlers } from './handlers';
import { SocketUser } from './types/socket';

export class SocketServer {
  private io: Server;
  private httpServer: HttpServer;

  constructor(httpServer: HttpServer) {
    this.httpServer = httpServer;
    this.io = new Server(httpServer, {
      cors: {
        origin: config.CORS_ORIGIN.split(',').map(origin => origin.trim()),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1024 * 1024, // 1MB
      cleanupEmptyChildNamespaces: true,
    });

    this.setupMiddleware();
    this.setupConnectionHandling();
    this.setupNamespaces();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(authenticateSocket);

    // Rate limiting middleware
    this.io.use((socket, next) => {
      const now = Date.now();
      const windowMs = 60000; // 1 minute
      const maxEvents = 100; // 100 events per minute

      if (!socket.data.rateLimitWindow) {
        socket.data.rateLimitWindow = now;
        socket.data.eventCount = 0;
      }

      // Reset window if expired
      if (now - socket.data.rateLimitWindow > windowMs) {
        socket.data.rateLimitWindow = now;
        socket.data.eventCount = 0;
      }

      // Check rate limit
      if (socket.data.eventCount >= maxEvents) {
        logger.warn('Rate limit exceeded for socket', {
          socketId: socket.id,
          userId: socket.data.user?.id,
          eventCount: socket.data.eventCount,
        });
        return next(new Error('Rate limit exceeded'));
      }

      next();
    });

    // Logging middleware
    this.io.use((socket, next) => {
      logger.debug('Socket connection attempt', {
        socketId: socket.id,
        userId: socket.data.user?.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
      });
      next();
    });
  }

  private setupConnectionHandling(): void {
    this.io.on('connection', (socket) => {
      const user: SocketUser = socket.data.user;

      logger.info('User connected via WebSocket', {
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        ip: socket.handshake.address,
      });

      // Register connection with connection manager
      connectionManager.addConnection(socket, user);

      // Set up event handlers
      eventHandlers.setupEventHandlers(socket, this.io);

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('User disconnected from WebSocket', {
          socketId: socket.id,
          userId: user.id,
          username: user.username,
          reason,
          connectedTime: Date.now() - socket.data.connectedAt,
        });

        // Clean up connection
        connectionManager.removeConnection(socket.id);
        roomManager.handleUserDisconnect(user.id, socket.id);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        logger.error('Socket error', {
          socketId: socket.id,
          userId: user.id,
          error: error.message,
          stack: error.stack,
        });
      });

      // Track connection time
      socket.data.connectedAt = Date.now();

      // Send connection confirmation
      socket.emit('connection:confirmed', {
        socketId: socket.id,
        timestamp: new Date().toISOString(),
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    });
  }

  private setupNamespaces(): void {
    // Quiz namespace for quiz-specific events
    const quizNamespace = this.io.of('/quiz');
    
    quizNamespace.use(authenticateSocket);
    quizNamespace.on('connection', (socket) => {
      logger.debug('User connected to quiz namespace', {
        socketId: socket.id,
        userId: socket.data.user?.id,
      });

      eventHandlers.setupQuizEventHandlers(socket, quizNamespace);
    });

    // Admin namespace for administrative functions
    const adminNamespace = this.io.of('/admin');
    
    adminNamespace.use(authenticateSocket);
    adminNamespace.use((socket, next) => {
      const user: SocketUser = socket.data.user;
      if (user.role !== 'ADMIN') {
        return next(new Error('Admin access required'));
      }
      next();
    });
    
    adminNamespace.on('connection', (socket) => {
      logger.debug('Admin connected to admin namespace', {
        socketId: socket.id,
        userId: socket.data.user?.id,
      });

      eventHandlers.setupAdminEventHandlers(socket, adminNamespace);
    });
  }

  private setupErrorHandling(): void {
    this.io.engine.on('connection_error', (err) => {
      logger.error('Socket.IO connection error', {
        error: err.message,
        code: err.code,
        context: err.context,
        type: err.type,
      });
    });

    // Handle server errors
    this.io.on('error', (error) => {
      logger.error('Socket.IO server error', {
        error: error.message,
        stack: error.stack,
      });
    });
  }

  public getIO(): Server {
    return this.io;
  }

  public getQuizNamespace() {
    return this.io.of('/quiz');
  }

  public getAdminNamespace() {
    return this.io.of('/admin');
  }

  public getConnectionCount(): number {
    return connectionManager.getConnectionCount();
  }

  public getActiveRooms(): number {
    return roomManager.getActiveRoomCount();
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Socket.IO server');
    
    // Notify all connected clients
    this.io.emit('server:shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });

    // Give clients time to receive the message
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close all connections
    this.io.close();
    
    // Clean up managers
    connectionManager.cleanup();
    roomManager.cleanup();

    logger.info('Socket.IO server shutdown complete');
  }
}

export let socketServer: SocketServer | null = null;

export function initializeSocketServer(httpServer: HttpServer): SocketServer {
  if (socketServer) {
    logger.warn('Socket server already initialized');
    return socketServer;
  }

  socketServer = new SocketServer(httpServer);
  logger.info('Socket.IO server initialized');
  return socketServer;
}

export function getSocketServer(): SocketServer {
  if (!socketServer) {
    throw new Error('Socket server not initialized');
  }
  return socketServer;
}
