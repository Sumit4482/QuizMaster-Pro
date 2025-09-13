import { createServer } from 'http';
import { config, validateEnvironment } from './config/environment';
import { logger } from './config/logger';
import { connectRedis, disconnectRedis } from './config/redis';
import { disconnectDatabase } from './config/database';
import { createApp } from './app';
import { initializeSocketServer, socketServer } from './sockets/socketServer';
import { InitializationService } from './services/initializationService';

// Global error handlers
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason,
  });
  process.exit(1);
});

async function startServer(): Promise<void> {
  try {
    // Validate environment variables
    validateEnvironment();
    logger.info('Environment validation successful');

    // Connect to Redis (optional for testing)
    try {
      await connectRedis();
      logger.info('Redis connection established');
    } catch (error) {
      logger.warn('Redis connection failed - continuing without Redis:', error instanceof Error ? error.message : error);
    }

    // Initialize advanced AI services
    try {
      const initService = InitializationService.getInstance();
      await initService.initializeAdvancedAiServices();
      logger.info('Advanced AI services initialized');
    } catch (error) {
      logger.warn('Advanced AI services initialization failed - continuing without advanced features:', error instanceof Error ? error.message : error);
    }

    // Create Express application
    const app = createApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.io server
    const socketIoServer = initializeSocketServer(httpServer);

    // Start HTTP server
    const server = httpServer.listen(config.PORT, () => {
      logger.info(`Server started successfully`, {
        port: config.PORT,
        environment: config.NODE_ENV,
        corsOrigin: config.CORS_ORIGIN,
        logLevel: config.LOG_LEVEL,
        websocketEnabled: true,
      });

      // Log available endpoints
      logger.info('Available endpoints:', {
        health: `http://localhost:${config.PORT}/health`,
        api: `http://localhost:${config.PORT}/api`,
        auth: `http://localhost:${config.PORT}/api/auth`,
        websocket: `ws://localhost:${config.PORT}`,
        socketio: `http://localhost:${config.PORT}/socket.io/`,
      });

      // Log WebSocket statistics
      logger.info('WebSocket server initialized:', {
        connections: socketIoServer.getConnectionCount(),
        activeRooms: socketIoServer.getActiveRooms(),
      });
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} signal received: closing HTTP server and WebSocket connections`);
      
      try {
        // Shutdown Socket.io server first
        if (socketServer) {
          await socketServer.shutdown();
          logger.info('WebSocket server closed');
        }
      } catch (error) {
        logger.error('Error shutting down WebSocket server:', error);
      }
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Disconnect from Redis
          await disconnectRedis();
          logger.info('Redis connection closed');
          
          // Disconnect from database
          await disconnectDatabase();
          logger.info('Database connection closed');
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle server errors
    server.on('error', (error: Error) => {
      if (error.message.includes('EADDRINUSE')) {
        logger.error(`Port ${config.PORT} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
