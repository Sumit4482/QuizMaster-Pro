import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { correlationIdMiddleware } from '../../middleware/correlationId';
import { loggingMiddleware } from '../../middleware/logging';
import { errorHandler } from '../../middleware/errorHandler';
import userRoutes from './userRoutes';
import { logger } from '../../utils/logger';
import { ServiceDiscovery } from '../../gateway/serviceDiscovery';

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 3001;
const SERVICE_NAME = 'user-service';

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
app.use('/api/users', userRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/users/health',
      register: 'POST /api/users/register',
      login: 'POST /api/users/login',
      refreshToken: 'POST /api/users/refresh-token',
      logout: 'POST /api/users/logout',
      profile: 'GET /api/users/profile/:userId',
      updateProfile: 'PUT /api/users/profile/:userId',
      changePassword: 'POST /api/users/change-password/:userId',
      stats: 'GET /api/users/stats/:userId',
      deleteAccount: 'DELETE /api/users/account/:userId'
    }
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
    version: '1.0.0'
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
    timestamp: new Date().toISOString()
  });
});

async function startUserService(): Promise<void> {
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
        description: 'User authentication and profile management service',
        capabilities: ['authentication', 'user-management', 'profile-management'],
        tags: ['auth', 'users', 'profiles']
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
  startUserService().catch((error) => {
    logger.error('Failed to start User Service', {
      component: SERVICE_NAME,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}

export { app, startUserService };
export default app;

