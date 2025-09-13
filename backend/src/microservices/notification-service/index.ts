import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { correlationIdMiddleware } from '../../middleware/correlationId';
import { loggingMiddleware } from '../../middleware/logging';
import { errorHandler } from '../../middleware/errorHandler';
import notificationRoutes from './notificationRoutes';
import { logger } from '../../utils/logger';
import { ServiceDiscovery } from '../../gateway/serviceDiscovery';

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3006;
const SERVICE_NAME = 'notification-service';

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
app.use('/api/notifications', notificationRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/notifications/health',
      sendMessage: 'POST /api/notifications/messages/send',
      getMessages: 'GET /api/notifications/messages/:conversationId?',
      getNotifications: 'GET /api/notifications/notifications',
      markAsRead: 'PATCH /api/notifications/notifications/:notificationId/read',
      updatePreferences: 'PATCH /api/notifications/preferences',
      sendNotification: 'POST /api/notifications/send [ADMIN]',
      sendBulkNotifications: 'POST /api/notifications/send/bulk [ADMIN]'
    },
    features: [
      'Multi-channel notifications (email, push, in-app, SMS)',
      'Real-time messaging between users',
      'Bulk notification sending',
      'User preference management',
      'Conversation management',
      'Delivery tracking and status',
      'Priority-based routing',
      'Quiet hours support'
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

async function startNotificationService(): Promise<void> {
  try {
    const serviceDiscovery = ServiceDiscovery.getInstance();
    
    const server = app.listen(PORT, () => {
      logger.info(`${SERVICE_NAME} started successfully`, {
        component: SERVICE_NAME,
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid
      });
    });

    const serviceInfo = {
      name: SERVICE_NAME,
      version: '1.0.0',
      host: process.env.SERVICE_HOST || 'localhost',
      port: Number(PORT),
      protocol: 'http',
      healthCheckPath: '/health',
      metadata: {
        description: 'Multi-channel notification and messaging service',
        capabilities: [
          'push-notifications',
          'email-notifications',
          'sms-notifications',
          'in-app-messaging',
          'real-time-chat',
          'bulk-messaging',
          'preference-management'
        ],
        tags: ['notifications', 'messaging', 'communication', 'real-time']
      }
    };

    await serviceDiscovery.register(serviceInfo);
    logger.info('Service registered with discovery', { component: SERVICE_NAME });

    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully`, { component: SERVICE_NAME });

      try {
        await serviceDiscovery.unregister(SERVICE_NAME);
        server.close(() => {
          logger.info('HTTP server closed', { component: SERVICE_NAME });
          process.exit(0);
        });

        setTimeout(() => {
          logger.error('Could not close connections in time, forcefully shutting down', { component: SERVICE_NAME });
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

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        component: SERVICE_NAME,
        error: error.message,
        stack: error.stack
      });
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
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

if (require.main === module) {
  startNotificationService().catch((error) => {
    logger.error('Failed to start Notification Service', {
      component: SERVICE_NAME,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}

export { app, startNotificationService };
export default app;

