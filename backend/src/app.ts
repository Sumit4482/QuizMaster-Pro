import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { config } from './config/environment';
import { logger } from './config/logger';

// Middleware imports
import {
  correlationId,
  requestLogger,
  securityHeaders,
  apiRateLimit,
  errorHandler,
  notFoundHandler,
} from './middleware/common';

// Route imports
import authRoutes from './routes/authRoutes';
import healthRoutes from './routes/healthRoutes';

export function createApp(): Application {
  const app = express();

  // Trust proxy (for proper IP detection behind load balancer)
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // Allow embedding for development
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "https:"],
      },
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: config.CORS_ORIGIN.split(',').map(origin => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Correlation-ID',
    ],
    exposedHeaders: ['X-Correlation-ID'],
  }));

  // Compression middleware
  app.use(compression());

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Custom middleware
  app.use(correlationId);
  app.use(securityHeaders);

  // HTTP request logging (only in development)
  if (config.NODE_ENV === 'development') {
    app.use(morgan('combined', {
      stream: {
        write: (message: string) => {
          logger.info(message.trim(), { component: 'http' });
        }
      }
    }));
  }

  app.use(requestLogger);

  // Rate limiting for API routes (disabled in development)
  if (config.NODE_ENV === 'production') {
    app.use('/api', apiRateLimit);
  }

  // Health check routes (before rate limiting)
  app.use('/health', healthRoutes);

  // API routes
  app.use('/api/auth', authRoutes);

  // API documentation endpoint
  app.get('/api', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'QuizMaster Pro API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Backend API for QuizMaster Pro - Industry-Level Multiplayer Quiz Platform',
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
        documentation: {
          health: '/health',
          auth: '/api/auth',
        },
        status: 'operational',
      },
      correlationId: (req as any).correlationId,
    });
  });

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        message: 'QuizMaster Pro API Server',
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
        endpoints: {
          api: '/api',
          health: '/health',
          auth: '/api/auth',
        },
      },
      correlationId: (req as any).correlationId,
    });
  });

  // Error handling middleware (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
