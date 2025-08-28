import { Router } from 'express';
import { Request, Response } from 'express';
import { checkDatabaseConnection } from '@/config/database';
import { checkRedisConnection } from '@/config/redis';
import { config } from '@/config/environment';
import { RequestWithCorrelation } from '@/types/common';

const router = Router();

// Basic health check
router.get('/', (req: RequestWithCorrelation, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
    },
    correlationId: req.correlationId,
  });
});

// Detailed health check
router.get('/detailed', async (req: RequestWithCorrelation, res: Response) => {
  const startTime = Date.now();

  try {
    // Check database connection
    const dbStart = Date.now();
    const isDatabaseHealthy = await checkDatabaseConnection();
    const dbResponseTime = Date.now() - dbStart;

    // Check Redis connection
    const redisStart = Date.now();
    const isRedisHealthy = await checkRedisConnection();
    const redisResponseTime = Date.now() - redisStart;

    // Calculate overall status
    const isHealthy = isDatabaseHealthy && isRedisHealthy;
    const statusCode = isHealthy ? 200 : 503;

    const totalResponseTime = Date.now() - startTime;

    res.status(statusCode).json({
      success: true,
      data: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        responseTime: `${totalResponseTime}ms`,
        services: {
          database: {
            status: isDatabaseHealthy ? 'connected' : 'disconnected',
            responseTime: `${dbResponseTime}ms`,
          },
          redis: {
            status: isRedisHealthy ? 'connected' : 'disconnected',
            responseTime: `${redisResponseTime}ms`,
          },
        },
        memory: {
          used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
          total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
          external: Math.round((process.memoryUsage().external / 1024 / 1024) * 100) / 100,
        },
      },
      correlationId: req.correlationId,
    });
  } catch (error) {
    const totalResponseTime = Date.now() - startTime;
    
    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        responseTime: `${totalResponseTime}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      correlationId: req.correlationId,
    });
  }
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req: RequestWithCorrelation, res: Response) => {
  try {
    // Quick checks for essential services
    const isDatabaseReady = await checkDatabaseConnection();
    const isRedisReady = await checkRedisConnection();

    const isReady = isDatabaseReady && isRedisReady;

    res.status(isReady ? 200 : 503).json({
      success: true,
      data: {
        ready: isReady,
        timestamp: new Date().toISOString(),
        services: {
          database: isDatabaseReady ? 'ready' : 'not ready',
          redis: isRedisReady ? 'ready' : 'not ready',
        },
      },
      correlationId: req.correlationId,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        ready: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      correlationId: req.correlationId,
    });
  }
});

// Liveness probe (for Kubernetes)
router.get('/live', (req: RequestWithCorrelation, res: Response) => {
  // Simple liveness check - just return 200 if the server is running
  res.status(200).json({
    success: true,
    data: {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    correlationId: req.correlationId,
  });
});

export default router;
