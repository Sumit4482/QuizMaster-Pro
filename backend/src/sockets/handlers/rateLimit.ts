import { ExtendedSocket, RateLimitConfig, SocketError } from '../types/socket';
import { logger } from '@/config/logger';

/**
 * In-memory rate limiter for WebSocket events
 */
class SocketRateLimiter {
  private limits: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if request should be rate limited
   */
  public isRateLimited(
    key: string,
    windowMs: number,
    maxEvents: number
  ): { isLimited: boolean; resetTime: number; remainingEvents: number } {
    const now = Date.now();
    const limit = this.limits.get(key);

    if (!limit || now >= limit.resetTime) {
      // First request or window expired
      this.limits.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });

      return {
        isLimited: false,
        resetTime: now + windowMs,
        remainingEvents: maxEvents - 1,
      };
    }

    // Increment count
    limit.count++;

    const remainingEvents = Math.max(0, maxEvents - limit.count);
    const isLimited = limit.count > maxEvents;

    if (isLimited) {
      return {
        isLimited: true,
        resetTime: limit.resetTime,
        remainingEvents: 0,
      };
    }

    return {
      isLimited: false,
      resetTime: limit.resetTime,
      remainingEvents,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, limit] of this.limits.entries()) {
      if (now >= limit.resetTime) {
        this.limits.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }

  /**
   * Destroy the rate limiter
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.limits.clear();
  }
}

// Global rate limiter instance
const rateLimiter = new SocketRateLimiter();

/**
 * Rate limiting middleware for specific events
 */
export function rateLimitEvent(
  maxEvents: number,
  windowMs: number,
  keyGenerator?: (socket: ExtendedSocket) => string
) {
  return (
    socket: ExtendedSocket,
    eventName: string,
    payload: any,
    next: (error?: Error) => void
  ) => {
    try {
      // Generate rate limit key
      const defaultKey = `${socket.data.user.id}:${eventName}`;
      const key = keyGenerator ? keyGenerator(socket) : defaultKey;

      // Check rate limit
      const { isLimited, resetTime, remainingEvents } = rateLimiter.isRateLimited(
        key,
        windowMs,
        maxEvents
      );

      if (isLimited) {
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

        logger.warn('Rate limit exceeded for socket event', {
          socketId: socket.id,
          userId: socket.data.user?.id,
          eventName,
          key,
          maxEvents,
          windowMs,
          retryAfter,
        });

        return next(new SocketError(
          'RATE_LIMIT_EXCEEDED',
          `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          {
            maxEvents,
            windowMs,
            retryAfter,
            remainingEvents,
          }
        ));
      }

      // Add rate limit info to socket data for client awareness
      socket.emit('rate_limit_info', {
        eventName,
        remainingEvents,
        resetTime,
        windowMs,
      });

      next();
    } catch (error) {
      logger.error('Rate limit middleware error', {
        socketId: socket.id,
        eventName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      next(new SocketError('RATE_LIMIT_ERROR', 'Rate limiting failed'));
    }
  };
}

/**
 * Global rate limiting middleware (applies to all events)
 */
export function globalRateLimit(config: RateLimitConfig) {
  return (
    socket: ExtendedSocket,
    eventName: string,
    payload: any,
    next: (error?: Error) => void
  ) => {
    const key = config.keyGenerator 
      ? config.keyGenerator(socket) 
      : `${socket.data.user.id}:global`;

    const { isLimited, resetTime } = rateLimiter.isRateLimited(
      key,
      config.windowMs,
      config.maxEvents
    );

    if (isLimited) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

      logger.warn('Global rate limit exceeded', {
        socketId: socket.id,
        userId: socket.data.user?.id,
        eventName,
        retryAfter,
      });

      return next(new SocketError(
        'GLOBAL_RATE_LIMIT_EXCEEDED',
        `Global rate limit exceeded. Try again in ${retryAfter} seconds.`,
        { retryAfter }
      ));
    }

    next();
  };
}

/**
 * IP-based rate limiting
 */
export function ipRateLimit(maxEvents: number, windowMs: number) {
  return rateLimitEvent(
    maxEvents,
    windowMs,
    (socket: ExtendedSocket) => `ip:${socket.handshake.address}`
  );
}

/**
 * User-based rate limiting
 */
export function userRateLimit(maxEvents: number, windowMs: number) {
  return rateLimitEvent(
    maxEvents,
    windowMs,
    (socket: ExtendedSocket) => `user:${socket.data.user.id}`
  );
}

/**
 * Room-based rate limiting
 */
export function roomRateLimit(maxEvents: number, windowMs: number) {
  return rateLimitEvent(
    maxEvents,
    windowMs,
    (socket: ExtendedSocket) => {
      const roomIds = Array.from(socket.data.currentRooms);
      return roomIds.length > 0 
        ? `room:${roomIds[0]}:${socket.data.user.id}` 
        : `user:${socket.data.user.id}`;
    }
  );
}

/**
 * Sliding window rate limiter for more precise rate limiting
 */
class SlidingWindowRateLimiter {
  private windows: Map<string, number[]> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  public isRateLimited(
    key: string,
    windowMs: number,
    maxEvents: number
  ): { isLimited: boolean; remainingEvents: number } {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.windows.get(key) || [];
    
    // Remove old timestamps
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);
    
    // Check if adding this request would exceed the limit
    if (timestamps.length >= maxEvents) {
      return {
        isLimited: true,
        remainingEvents: 0,
      };
    }

    // Add current timestamp
    timestamps.push(now);
    this.windows.set(key, timestamps);

    return {
      isLimited: false,
      remainingEvents: maxEvents - timestamps.length,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    let cleanedCount = 0;

    for (const [key, timestamps] of this.windows.entries()) {
      const validTimestamps = timestamps.filter(timestamp => now - timestamp < maxAge);
      
      if (validTimestamps.length === 0) {
        this.windows.delete(key);
        cleanedCount++;
      } else if (validTimestamps.length < timestamps.length) {
        this.windows.set(key, validTimestamps);
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired sliding window entries`);
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.windows.clear();
  }
}

// Sliding window rate limiter for more precise control
const slidingWindowLimiter = new SlidingWindowRateLimiter();

/**
 * Sliding window rate limiting middleware
 */
export function slidingWindowRateLimit(maxEvents: number, windowMs: number) {
  return (
    socket: ExtendedSocket,
    eventName: string,
    payload: any,
    next: (error?: Error) => void
  ) => {
    const key = `${socket.data.user.id}:${eventName}`;
    const { isLimited, remainingEvents } = slidingWindowLimiter.isRateLimited(
      key,
      windowMs,
      maxEvents
    );

    if (isLimited) {
      logger.warn('Sliding window rate limit exceeded', {
        socketId: socket.id,
        userId: socket.data.user?.id,
        eventName,
        maxEvents,
        windowMs,
      });

      return next(new SocketError(
        'RATE_LIMIT_EXCEEDED',
        'Rate limit exceeded. Please slow down your requests.',
        { maxEvents, windowMs }
      ));
    }

    next();
  };
}

// Export cleanup function
export function destroyRateLimiters(): void {
  rateLimiter.destroy();
  slidingWindowLimiter.destroy();
}
