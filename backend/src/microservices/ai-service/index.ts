import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { correlationIdMiddleware } from '../../middleware/correlationId';
import { loggingMiddleware } from '../../middleware/logging';
import { errorHandler } from '../../middleware/errorHandler';
import aiRoutes from './aiRoutes';
import { logger } from '../../utils/logger';
import { ServiceDiscovery } from '../../gateway/serviceDiscovery';

const app = express();
const PORT = process.env.AI_SERVICE_PORT || 3004;
const SERVICE_NAME = 'ai-service';

// Security and performance middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parsing middleware - larger limits for AI content processing
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Core middleware
app.use(correlationIdMiddleware);
app.use(loggingMiddleware);

// Routes
app.use('/api/ai', aiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/ai/health',
      capabilities: 'GET /api/ai/capabilities',
      statistics: 'GET /api/ai/statistics',
      generateQuestions: 'POST /api/ai/generate/questions',
      moderateContent: 'POST /api/ai/moderate',
      verifyFacts: 'POST /api/ai/verify-facts',
      enhanceContent: 'POST /api/ai/enhance',
      batchProcess: 'POST /api/ai/batch'
    },
    features: [
      'AI-powered question generation',
      'Advanced content moderation',
      'Real-time fact verification',
      'Content enhancement and translation',
      'Multi-provider AI support',
      'Batch processing capabilities',
      'Quality scoring and assessment',
      'Educational content optimization'
    ],
    aiProviders: [
      'OpenAI GPT-3.5/GPT-4',
      'Anthropic Claude',
      'Google PaLM/Gemini',
      'Custom fine-tuned models'
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
    aiProviders: {
      openai: 'operational',
      anthropic: 'operational',
      google: 'operational'
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
      'GET /api/ai/capabilities',
      'GET /api/ai/statistics',
      'POST /api/ai/generate/questions',
      'POST /api/ai/moderate',
      'POST /api/ai/verify-facts',
      'POST /api/ai/enhance',
      'POST /api/ai/batch'
    ],
    documentation: 'https://api.quizmaster.dev/ai/docs'
  });
});

async function startAiService(): Promise<void> {
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
        description: 'AI-powered content generation, moderation, and enhancement service',
        capabilities: [
          'question-generation',
          'content-moderation',
          'fact-verification',
          'content-enhancement',
          'language-translation',
          'quality-assessment',
          'batch-processing'
        ],
        tags: ['ai', 'nlp', 'content', 'moderation', 'generation'],
        aiProviders: ['openai', 'anthropic', 'google'],
        features: {
          questionGeneration: {
            maxBatchSize: 20,
            supportedTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY'],
            supportedDifficulties: ['EASY', 'MEDIUM', 'HARD', 'EXPERT'],
            qualityScoring: true
          },
          contentModeration: {
            realTime: true,
            biasDetection: true,
            toxicityFiltering: true,
            educationalSuitability: true
          },
          factVerification: {
            sourceVerification: true,
            credibilityScoring: true,
            multiSourceValidation: true
          },
          contentEnhancement: {
            supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'],
            styleAdaptation: true,
            readabilityOptimization: true
          }
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
  startAiService().catch((error) => {
    logger.error('Failed to start AI Service', {
      component: SERVICE_NAME,
      error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
  });
}

export { app, startAiService };
export default app;

