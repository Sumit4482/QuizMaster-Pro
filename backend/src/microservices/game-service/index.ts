import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { correlationIdMiddleware } from '../../middleware/correlationId';
import { loggingMiddleware } from '../../middleware/logging';
import { errorHandler } from '../../middleware/errorHandler';
import gameRoutes from './gameRoutes';
import { logger } from '../../utils/logger';
import { ServiceDiscovery } from '../../gateway/serviceDiscovery';

const app = express();
const PORT = process.env.GAME_SERVICE_PORT || 3003;
const SERVICE_NAME = 'game-service';

// Security and performance middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Core middleware
app.use(correlationIdMiddleware);
app.use(loggingMiddleware);

// Routes
app.use('/api/games', gameRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/games/health',
      searchPublic: 'GET /api/games/search/public',
      statistics: 'GET /api/games/statistics',
      getGame: 'GET /api/games/:gameId',
      leaderboard: 'GET /api/games/:gameId/leaderboard',
      createGame: 'POST /api/games/create',
      joinGame: 'POST /api/games/:gameId/join',
      leaveGame: 'POST /api/games/:gameId/leave',
      startGame: 'POST /api/games/:gameId/start',
      endGame: 'POST /api/games/:gameId/end',
      submitAnswer: 'POST /api/games/:gameId/questions/:questionId/answer'
    },
    features: [
      'Real-time multiplayer games',
      'Room-based game management',
      'Live leaderboards',
      'Flexible game configuration',
      'Player reconnection support',
      'Game statistics and analytics',
      'Public and private games',
      'Multiple difficulty levels'
    ]
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0',
    database: 'connected', // This would be dynamic in real implementation
    redis: 'connected' // This would be dynamic in real implementation
  });
});

// Error handling middleware
app.use(errorHandler);

// Handle 404 errors
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    service: SERVICE_NAME,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /api/games/search/public',
      'GET /api/games/statistics',
      'GET /api/games/:gameId',
      'GET /api/games/:gameId/leaderboard',
      'POST /api/games/create',
      'POST /api/games/:gameId/join',
      'POST /api/games/:gameId/leave',
      'POST /api/games/:gameId/start',
      'POST /api/games/:gameId/end',
      'POST /api/games/:gameId/questions/:questionId/answer'
    ]
  });
});

async function startGameService(): Promise<void> {
  try {
    // Initialize service discovery
    const serviceDiscovery = ServiceDiscovery.getInstance();
    
    // Start the server
    const server = app.listen(PORT, () => {
      logger.info(`${SERVICE_NAME} started successfully`, {
        component: SERVICE_NAME,
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid
      });
    });

    // Register with service discovery
    const serviceInfo = {
      name: SERVICE_NAME,
      version: '1.0.0',
      host: process.env.SERVICE_HOST || 'localhost',
      port: Number(PORT),
      protocol: 'http',
      healthCheckPath: '/health',
      metadata: {
        description: 'Real-time multiplayer game management and room orchestration service',
        capabilities: [
          'game-room-management',
          'multiplayer-gameplay',
          'real-time-leaderboards',
          'player-matching',
          'game-state-management',
          'reconnection-handling'
        ],
        tags: ['games', 'multiplayer', 'realtime', 'rooms'],
        features: {
          maxPlayersPerGame: 100,
          supportedGameModes: ['public', 'private', 'password-protected'],
          realTimeFeatures: ['live-scoring', 'instant-feedback', 'live-leaderboards'],
          gameTypes: ['quiz', 'trivia', 'knowledge-challenge']
        }
      }
    };

    await serviceDiscovery.register(serviceInfo);
    logger.info('Service registered with discovery', {
      component: SERVICE_NAME,
      serviceInfo
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully`, {
        component: SERVICE_NAME
      });

      try {
        // Unregister from service discovery
        await serviceDiscovery.unregister(SERVICE_NAME);
        logger.info('Service unregistered from discovery', {
          component: SERVICE_NAME
        });

        // Close server
        server.close(() => {
          logger.info('HTTP server closed', {
            component: SERVICE_NAME
          });
          process.exit(0);
        });

        // Force close after timeout
        setTimeout(() => {
          logger.error('Could not close connections in time, forcefully shutting down', {
            component: SERVICE_NAME
          });
          process.exit(1);
        }, 10000);

      } catch (error) {
        logger.error('Error during graceful shutdown', {
          component: SERVICE_NAME,
          error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
      }
    };

    // Handle termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        component: SERVICE_NAME,
        error: error.message,
        stack: error.stack
      });
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', {
        component: SERVICE_NAME,
        reason: reason instanceof Error ? reason.message : String(reason)
      });
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    logger.error(`Failed to start ${SERVICE_NAME}`, {
      component: SERVICE_NAME,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  }
}

// Start the service if this file is run directly
if (require.main === module) {
  startGameService().catch((error) => {
    logger.error('Failed to start Game Service', {
      component: SERVICE_NAME,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}

export { app, startGameService };
export default app;

