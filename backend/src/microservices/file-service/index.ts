import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { correlationIdMiddleware } from '../../middleware/correlationId';
import { loggingMiddleware } from '../../middleware/logging';
import { errorHandler } from '../../middleware/errorHandler';
import fileRoutes from './fileRoutes';
import { logger } from '../../utils/logger';
import { ServiceDiscovery } from '../../gateway/serviceDiscovery';

const app = express();
const PORT = process.env.FILE_SERVICE_PORT || 3007;
const SERVICE_NAME = 'file-service';

// Security and performance middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parsing middleware with larger limits for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Core middleware
app.use(correlationIdMiddleware);
app.use(loggingMiddleware);

// Routes
app.use('/api/files', fileRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/files/health',
      upload: 'POST /api/files/upload',
      download: 'GET /api/files/download/:fileId',
      getFile: 'GET /api/files/:fileId',
      searchFiles: 'GET /api/files/search',
      deleteFile: 'DELETE /api/files/:fileId',
      generateSignedUrl: 'POST /api/files/signed-url',
      getStatistics: 'GET /api/files/statistics [ADMIN]'
    },
    features: [
      'Multi-format file upload and storage',
      'Image processing and thumbnail generation',
      'File compression and optimization',
      'Secure file access and download',
      'Advanced file search and filtering',
      'CDN integration and caching',
      'Signed URL generation',
      'File versioning and backup',
      'Storage analytics and monitoring'
    ],
    supportedFormats: {
      images: ['JPEG', 'PNG', 'GIF', 'WebP'],
      documents: ['PDF', 'TXT', 'JSON'],
      audio: ['MP3', 'WAV'],
      video: ['MP4', 'WebM']
    },
    limits: {
      maxFileSize: '10MB',
      maxFilesPerUpload: 1,
      allowedMimeTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain', 'application/json',
        'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm'
      ]
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
    version: '1.0.0',
    storage: {
      available: true,
      uploadDir: process.env.UPLOAD_DIR || './uploads'
    }
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
      'POST /api/files/upload',
      'GET /api/files/download/:fileId',
      'GET /api/files/search',
      'GET /api/files/:fileId',
      'DELETE /api/files/:fileId',
      'POST /api/files/signed-url',
      'GET /api/files/statistics'
    ]
  });
});

async function startFileService(): Promise<void> {
  try {
    const serviceDiscovery = ServiceDiscovery.getInstance();
    
    const server = app.listen(PORT, () => {
      logger.info(`${SERVICE_NAME} started successfully`, {
        component: SERVICE_NAME,
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        uploadDir: process.env.UPLOAD_DIR || './uploads',
        maxFileSize: process.env.MAX_FILE_SIZE || '10485760'
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
        description: 'File storage, processing, and CDN service',
        capabilities: [
          'file-upload',
          'file-download',
          'file-processing',
          'image-optimization',
          'thumbnail-generation',
          'file-search',
          'signed-urls',
          'storage-analytics'
        ],
        tags: ['files', 'storage', 'cdn', 'media', 'assets'],
        features: {
          storage: {
            maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
            supportedFormats: ['images', 'documents', 'audio', 'video'],
            compression: true,
            thumbnails: true
          },
          processing: {
            imageResize: true,
            compression: true,
            metadataExtraction: true,
            formatConversion: false
          },
          delivery: {
            cdn: true,
            signedUrls: true,
            streaming: true,
            caching: true
          }
        }
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
  startFileService().catch((error) => {
    logger.error('Failed to start File Service', {
      component: SERVICE_NAME,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}

export { app, startFileService };
export default app;

