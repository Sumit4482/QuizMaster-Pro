import winston from 'winston';
import { config } from './environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, correlationId, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]`;
    
    if (correlationId) {
      log += ` [${correlationId}]`;
    }
    
    log += `: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Console transport with colors for development
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    logFormat
  ),
});

// File transports for production
const errorFileTransport = new winston.transports.File({
  filename: 'logs/error.log',
  level: 'error',
  format: logFormat,
});

const combinedFileTransport = new winston.transports.File({
  filename: 'logs/combined.log',
  format: logFormat,
});

// Create logger
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  transports: [
    // Always log to console in development
    ...(config.NODE_ENV === 'development' ? [consoleTransport] : []),
    // Log to files in production
    ...(config.NODE_ENV === 'production' ? [errorFileTransport, combinedFileTransport] : []),
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
    ...(config.NODE_ENV === 'development' ? [consoleTransport] : []),
  ],
  // Handle unhandled rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
    ...(config.NODE_ENV === 'development' ? [consoleTransport] : []),
  ],
});

// Create logs directory if it doesn't exist
import { mkdirSync } from 'fs';
try {
  mkdirSync('logs', { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Request logger middleware helper
export function createRequestLogger() {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, meta }: any) => {
      const { method, url, status, responseTime, ip, userAgent, correlationId } = (meta as any) || {};
      
      let log = `${timestamp} [${level.toUpperCase()}]`;
      
      if (correlationId) {
        log += ` [${correlationId}]`;
      }
      
      log += `: ${method} ${url} ${status} - ${responseTime}ms`;
      log += ` - ${ip}`;
      
      if (userAgent) {
        log += ` - ${userAgent}`;
      }
      
      return log;
    })
  );
}

// Add correlation ID to logs
export function addCorrelationId(correlationId: string) {
  return logger.child({ correlationId });
}
