import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { config } from '@/config/environment';
import { logger } from '@/config/logger';
import { RequestWithCorrelation } from '@/types/common';
import { rateLimitResponse, internalServerErrorResponse } from '@/utils/response';

// Correlation ID middleware for request tracing
export function correlationId(
  req: RequestWithCorrelation,
  res: Response,
  next: NextFunction
): void {
  // Use existing correlation ID from header or generate new one
  req.correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  
  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', req.correlationId);
  
  next();
}

// Request logging middleware
export function requestLogger(
  req: RequestWithCorrelation,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Override res.end to log response
  const originalEnd = res.end;
  (res as any).end = function(chunk?: any, encoding?: any, cb?: any) {
    const responseTime = Date.now() - startTime;
    
    // Log response
    logger.info('Request completed', {
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
    });

    // Call original end method
    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
}

// Security headers middleware
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' ws: wss:;"
  );

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options
  res.setHeader('X-Frame-Options', 'DENY');

  // X-XSS-Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()'
  );

  next();
}

// Rate limiting middleware
export const createRateLimit = (windowMs?: number, max?: number) => {
  return rateLimit({
    windowMs: windowMs || config.RATE_LIMIT.WINDOW_MS,
    max: max || config.RATE_LIMIT.MAX_REQUESTS,
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
      timestamp: new Date().toISOString(),
    },
    handler: (req: RequestWithCorrelation, res: Response) => {
      const resetTime = new Date(Date.now() + (windowMs || config.RATE_LIMIT.WINDOW_MS));
      rateLimitResponse(res, resetTime, req.correlationId);
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/health/ready';
    },
  });
};

// Strict rate limiting for authentication endpoints (relaxed for testing)
export const authRateLimit = createRateLimit(60 * 1000, 100); // 100 requests per minute for testing

// Standard rate limiting for API endpoints
export const apiRateLimit = createRateLimit(); // Use default config

// Export rateLimiter as alias for apiRateLimit for backwards compatibility
export const rateLimiter = apiRateLimit;

// Request size limit middleware
export function requestSizeLimit(limit: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeLimit = parseSize(limit);
      const requestSize = parseInt(contentLength, 10);
      
      if (requestSize > sizeLimit) {
        return res.status(413).json({
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: `Request size ${requestSize} bytes exceeds limit of ${limit}`,
          },
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    next();
  };
}

// Parse size string (e.g., '10mb' -> bytes)
function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  return Math.floor(value * multipliers[unit as keyof typeof multipliers]);
}

// Error handling middleware
export function errorHandler(
  error: Error,
  req: RequestWithCorrelation,
  res: Response,
  next: NextFunction
): void {
  // Log error
  logger.error('Unhandled error', {
    correlationId: req.correlationId,
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
  });

  // Don't send error if response already sent
  if (res.headersSent) {
    return next(error);
  }

  // Handle specific error types
  if (error.name === 'ValidationError') {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
    return;
  }

  // Handle PayloadTooLargeError from body-parser
  if (error.name === 'PayloadTooLargeError' || error.message.includes('request entity too large')) {
    res.status(413).json({
      success: false,
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Request payload too large',
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
    return;
  }

  if (error.name === 'PrismaClientKnownRequestError') {
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
    return;
  }

  // Default internal server error
  internalServerErrorResponse(res, error, req.correlationId);
}

// 404 handler
export function notFoundHandler(
  req: RequestWithCorrelation,
  res: Response
): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.url} not found`,
    },
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId,
  });
}

// Health check middleware
export function healthCheck(
  req: RequestWithCorrelation,
  res: Response
): void {
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
}
