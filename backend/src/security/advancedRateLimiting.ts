import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../infrastructure/cache/cacheService';
import { logger } from '../utils/logger';

export interface RateLimitRule {
  id: string;
  name: string;
  description: string;
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
  message?: string;
  headers?: boolean; // Include rate limit headers in response
  store?: 'memory' | 'redis';
  slidingWindow?: boolean; // Use sliding window instead of fixed window
  burstLimit?: number; // Allow burst requests
  queueRequests?: boolean; // Queue requests when limit is reached
}

export interface RateLimitInfo {
  totalHits: number;
  remainingPoints: number;
  msBeforeNext: number;
  isBlocked: boolean;
}

export interface RateLimitStats {
  rule: string;
  totalRequests: number;
  blockedRequests: number;
  blockRate: number;
  averageRequestsPerMinute: number;
  topClientIPs: Array<{ ip: string; requests: number }>;
  lastReset: Date;
}

export interface SecurityEvent {
  type: 'rate_limit_exceeded' | 'suspicious_activity' | 'potential_attack';
  clientId: string;
  ipAddress: string;
  userAgent?: string;
  endpoint: string;
  requestCount: number;
  timeWindow: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  blocked: boolean;
}

export class AdvancedRateLimiting {
  private cacheService: CacheService;
  private rules: Map<string, RateLimitRule> = new Map();
  private stats: Map<string, RateLimitStats> = new Map();
  private securityEvents: SecurityEvent[] = [];
  private memoryStore: Map<string, { count: number; resetTime: number; requests: Array<number> }> = new Map();

  constructor(cacheService: CacheService) {
    this.cacheService = cacheService;
    this.initializeDefaultRules();
    this.startCleanupInterval();

    logger.info('Advanced Rate Limiting service initialized', {
      component: 'AdvancedRateLimiting',
      rules: this.rules.size
    });
  }

  /**
   * Initialize default rate limiting rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: RateLimitRule[] = [
      {
        id: 'global',
        name: 'Global Rate Limit',
        description: 'General rate limit for all endpoints',
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000,
        headers: true,
        store: 'redis',
        slidingWindow: true
      },
      {
        id: 'auth',
        name: 'Authentication Rate Limit',
        description: 'Strict rate limit for authentication endpoints',
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5,
        headers: true,
        store: 'redis',
        message: 'Too many authentication attempts. Please try again later.',
        onLimitReached: (req, res) => {
          logger.warn('Authentication rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
        }
      },
      {
        id: 'api',
        name: 'API Rate Limit',
        description: 'Rate limit for API endpoints',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100,
        headers: true,
        store: 'redis',
        slidingWindow: true,
        burstLimit: 120
      },
      {
        id: 'websocket',
        name: 'WebSocket Rate Limit',
        description: 'Rate limit for WebSocket connections',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 200,
        store: 'memory',
        keyGenerator: (req) => `ws:${req.ip}:${req.get('sec-websocket-key')}`
      },
      {
        id: 'file_upload',
        name: 'File Upload Rate Limit',
        description: 'Rate limit for file upload endpoints',
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10,
        headers: true,
        store: 'redis',
        condition: (req) => req.path.includes('/upload')
      },
      {
        id: 'password_reset',
        name: 'Password Reset Rate Limit',
        description: 'Rate limit for password reset requests',
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 3,
        headers: true,
        store: 'redis',
        condition: (req) => req.path.includes('/password/reset')
      },
      {
        id: 'search',
        name: 'Search Rate Limit',
        description: 'Rate limit for search operations',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30,
        headers: true,
        store: 'redis',
        condition: (req) => req.path.includes('/search') || req.query.q
      },
      {
        id: 'ai_generation',
        name: 'AI Generation Rate Limit',
        description: 'Rate limit for AI-powered question generation',
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 50,
        headers: true,
        store: 'redis',
        condition: (req) => req.path.includes('/ai/') || req.path.includes('/generate')
      }
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
      this.initializeRuleStats(rule.id);
    });
  }

  /**
   * Initialize statistics for a rule
   */
  private initializeRuleStats(ruleId: string): void {
    this.stats.set(ruleId, {
      rule: ruleId,
      totalRequests: 0,
      blockedRequests: 0,
      blockRate: 0,
      averageRequestsPerMinute: 0,
      topClientIPs: [],
      lastReset: new Date()
    });
  }

  /**
   * Add custom rate limiting rule
   */
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.id, rule);
    this.initializeRuleStats(rule.id);

    logger.info('Rate limiting rule added', {
      component: 'AdvancedRateLimiting',
      ruleId: rule.id,
      name: rule.name
    });
  }

  /**
   * Remove rate limiting rule
   */
  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    this.stats.delete(ruleId);

    if (removed) {
      logger.info('Rate limiting rule removed', {
        component: 'AdvancedRateLimiting',
        ruleId
      });
    }

    return removed;
  }

  /**
   * Create middleware for a specific rule
   */
  createMiddleware(ruleId: string): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rate limiting rule not found: ${ruleId}`);
    }

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Check if rule condition applies
        if (rule.condition && !rule.condition(req)) {
          next();
          return;
        }

        // Generate key for this request
        const key = rule.keyGenerator ? rule.keyGenerator(req) : `${ruleId}:${req.ip}`;
        
        // Check rate limit
        const limitInfo = await this.checkLimit(ruleId, key, req);

        // Update statistics
        this.updateStats(ruleId, req.ip, limitInfo.isBlocked);

        // Add rate limit headers if enabled
        if (rule.headers) {
          res.set({
            'X-RateLimit-Limit': rule.maxRequests.toString(),
            'X-RateLimit-Remaining': Math.max(0, limitInfo.remainingPoints).toString(),
            'X-RateLimit-Reset': new Date(Date.now() + limitInfo.msBeforeNext).toISOString()
          });
        }

        // Handle rate limit exceeded
        if (limitInfo.isBlocked) {
          // Log security event
          await this.logSecurityEvent({
            type: 'rate_limit_exceeded',
            clientId: key,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            requestCount: limitInfo.totalHits,
            timeWindow: rule.windowMs,
            severity: this.calculateSeverity(limitInfo.totalHits, rule.maxRequests),
            timestamp: new Date(),
            blocked: true
          });

          // Call custom handler if provided
          if (rule.onLimitReached) {
            rule.onLimitReached(req, res);
          }

          // Send rate limit response
          res.status(429).json({
            error: 'Rate limit exceeded',
            message: rule.message || 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(limitInfo.msBeforeNext / 1000),
            limit: rule.maxRequests,
            window: rule.windowMs / 1000
          });
          return;
        }

        // Proceed to next middleware
        next();
      } catch (error) {
        logger.error('Rate limiting middleware error', {
          component: 'AdvancedRateLimiting',
          ruleId,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Don't block requests on rate limiter errors
        next();
      }
    };
  }

  /**
   * Check rate limit for a key
   */
  async checkLimit(ruleId: string, key: string, req?: Request): Promise<RateLimitInfo> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rate limiting rule not found: ${ruleId}`);
    }

    if (rule.store === 'memory') {
      return this.checkMemoryLimit(rule, key);
    } else {
      return this.checkRedisLimit(rule, key);
    }
  }

  /**
   * Check rate limit using memory store
   */
  private checkMemoryLimit(rule: RateLimitRule, key: string): RateLimitInfo {
    const now = Date.now();
    let record = this.memoryStore.get(key);

    if (!record || now > record.resetTime) {
      // Initialize or reset record
      record = {
        count: 0,
        resetTime: now + rule.windowMs,
        requests: []
      };
      this.memoryStore.set(key, record);
    }

    if (rule.slidingWindow) {
      // Sliding window: filter out old requests
      const windowStart = now - rule.windowMs;
      record.requests = record.requests.filter(timestamp => timestamp > windowStart);
      record.count = record.requests.length;
    }

    // Add current request
    record.count++;
    if (rule.slidingWindow) {
      record.requests.push(now);
    }

    const isBlocked = record.count > rule.maxRequests;
    const remainingPoints = Math.max(0, rule.maxRequests - record.count);
    const msBeforeNext = rule.slidingWindow 
      ? (record.requests[0] || now) + rule.windowMs - now
      : record.resetTime - now;

    return {
      totalHits: record.count,
      remainingPoints,
      msBeforeNext: Math.max(0, msBeforeNext),
      isBlocked
    };
  }

  /**
   * Check rate limit using Redis store
   */
  private async checkRedisLimit(rule: RateLimitRule, key: string): Promise<RateLimitInfo> {
    const cacheKey = `rate_limit:${key}`;
    
    try {
      if (rule.slidingWindow) {
        return await this.checkRedisSlidingWindow(rule, cacheKey);
      } else {
        return await this.checkRedisFixedWindow(rule, cacheKey);
      }
    } catch (error) {
      logger.error('Redis rate limit check failed', {
        component: 'AdvancedRateLimiting',
        key: cacheKey,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return permissive result on Redis errors
      return {
        totalHits: 0,
        remainingPoints: rule.maxRequests,
        msBeforeNext: 0,
        isBlocked: false
      };
    }
  }

  /**
   * Check Redis sliding window rate limit
   */
  private async checkRedisSlidingWindow(rule: RateLimitRule, cacheKey: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const windowStart = now - rule.windowMs;

    // Use Redis sorted set to maintain sliding window
    const redisClient = this.cacheService.getCacheService().client;
    
    // Remove old entries
    await redisClient.zremrangebyscore(cacheKey, 0, windowStart);
    
    // Count current entries
    const currentCount = await redisClient.zcard(cacheKey);
    
    // Add current request
    await redisClient.zadd(cacheKey, now, `${now}-${Math.random()}`);
    await redisClient.expire(cacheKey, Math.ceil(rule.windowMs / 1000));
    
    const totalHits = currentCount + 1;
    const isBlocked = totalHits > rule.maxRequests;
    const remainingPoints = Math.max(0, rule.maxRequests - totalHits);
    
    // Calculate time until oldest request expires
    const oldestRequest = await redisClient.zrange(cacheKey, 0, 0, 'WITHSCORES');
    const msBeforeNext = oldestRequest.length > 0 
      ? Math.max(0, (parseInt(oldestRequest[1]) + rule.windowMs) - now)
      : rule.windowMs;

    return {
      totalHits,
      remainingPoints,
      msBeforeNext,
      isBlocked
    };
  }

  /**
   * Check Redis fixed window rate limit
   */
  private async checkRedisFixedWindow(rule: RateLimitRule, cacheKey: string): Promise<RateLimitInfo> {
    const windowKey = `${cacheKey}:${Math.floor(Date.now() / rule.windowMs)}`;
    
    // Increment counter
    const currentCount = await this.cacheService.getCacheService().client.incr(windowKey);
    
    // Set expiry on first request
    if (currentCount === 1) {
      await this.cacheService.getCacheService().client.expire(windowKey, Math.ceil(rule.windowMs / 1000));
    }
    
    const isBlocked = currentCount > rule.maxRequests;
    const remainingPoints = Math.max(0, rule.maxRequests - currentCount);
    const ttl = await this.cacheService.getCacheService().client.ttl(windowKey);
    const msBeforeNext = ttl > 0 ? ttl * 1000 : rule.windowMs;

    return {
      totalHits: currentCount,
      remainingPoints,
      msBeforeNext,
      isBlocked
    };
  }

  /**
   * Update statistics for a rule
   */
  private updateStats(ruleId: string, clientIP: string, isBlocked: boolean): void {
    const stats = this.stats.get(ruleId);
    if (!stats) return;

    stats.totalRequests++;
    
    if (isBlocked) {
      stats.blockedRequests++;
    }

    stats.blockRate = (stats.blockedRequests / stats.totalRequests) * 100;

    // Update top client IPs
    const existingClient = stats.topClientIPs.find(client => client.ip === clientIP);
    if (existingClient) {
      existingClient.requests++;
    } else {
      stats.topClientIPs.push({ ip: clientIP, requests: 1 });
    }

    // Keep only top 10 client IPs
    stats.topClientIPs.sort((a, b) => b.requests - a.requests);
    stats.topClientIPs = stats.topClientIPs.slice(0, 10);

    // Update average requests per minute
    const timeDiff = (Date.now() - stats.lastReset.getTime()) / (1000 * 60); // minutes
    stats.averageRequestsPerMinute = timeDiff > 0 ? stats.totalRequests / timeDiff : 0;
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(event: SecurityEvent): Promise<void> {
    this.securityEvents.push(event);
    
    // Keep only recent events
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }

    // Log to application logger
    const logLevel = event.severity === 'critical' || event.severity === 'high' ? 'error' : 'warn';
    logger.log(logLevel, 'Rate limiting security event', {
      component: 'AdvancedRateLimiting',
      ...event
    });

    // Store in cache for external monitoring
    await this.cacheService.set(
      `security_event:${event.clientId}:${event.timestamp.getTime()}`,
      event,
      { namespace: 'security', ttl: 86400 }
    );

    // Trigger alerts for high severity events
    if (event.severity === 'high' || event.severity === 'critical') {
      await this.triggerSecurityAlert(event);
    }
  }

  /**
   * Calculate severity based on request patterns
   */
  private calculateSeverity(requestCount: number, maxRequests: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = requestCount / maxRequests;
    
    if (ratio >= 10) return 'critical'; // 10x over limit
    if (ratio >= 5) return 'high';      // 5x over limit
    if (ratio >= 2) return 'medium';    // 2x over limit
    return 'low';
  }

  /**
   * Trigger security alert
   */
  private async triggerSecurityAlert(event: SecurityEvent): Promise<void> {
    try {
      // In a real implementation, this would integrate with alerting systems
      // For now, we'll use the queue system
      await this.cacheService.getCacheService().client.publish('security_alerts', JSON.stringify({
        type: 'rate_limit_alert',
        event,
        timestamp: new Date()
      }));

      logger.error('Security alert triggered', {
        component: 'AdvancedRateLimiting',
        eventType: event.type,
        severity: event.severity,
        clientId: event.clientId,
        ipAddress: event.ipAddress
      });
    } catch (error) {
      logger.error('Failed to trigger security alert', {
        component: 'AdvancedRateLimiting',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get statistics for all rules
   */
  getStats(): Map<string, RateLimitStats> {
    return this.stats;
  }

  /**
   * Get statistics for a specific rule
   */
  getRuleStats(ruleId: string): RateLimitStats | null {
    return this.stats.get(ruleId) || null;
  }

  /**
   * Get recent security events
   */
  getSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Reset statistics for a rule
   */
  resetRuleStats(ruleId: string): boolean {
    const stats = this.stats.get(ruleId);
    if (!stats) return false;

    stats.totalRequests = 0;
    stats.blockedRequests = 0;
    stats.blockRate = 0;
    stats.averageRequestsPerMinute = 0;
    stats.topClientIPs = [];
    stats.lastReset = new Date();

    logger.info('Rule statistics reset', {
      component: 'AdvancedRateLimiting',
      ruleId
    });

    return true;
  }

  /**
   * Whitelist IP address
   */
  async whitelistIP(ipAddress: string, duration: number = 86400): Promise<boolean> {
    try {
      await this.cacheService.set(
        `whitelist:${ipAddress}`,
        { whitelisted: true, timestamp: new Date() },
        { namespace: 'rate_limit', ttl: duration }
      );

      logger.info('IP address whitelisted', {
        component: 'AdvancedRateLimiting',
        ipAddress,
        duration
      });

      return true;
    } catch (error) {
      logger.error('Failed to whitelist IP address', {
        component: 'AdvancedRateLimiting',
        ipAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if IP is whitelisted
   */
  async isWhitelisted(ipAddress: string): Promise<boolean> {
    try {
      const whitelisted = await this.cacheService.get(
        `whitelist:${ipAddress}`,
        { namespace: 'rate_limit' }
      );
      return !!whitelisted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Blacklist IP address
   */
  async blacklistIP(ipAddress: string, duration: number = 86400): Promise<boolean> {
    try {
      await this.cacheService.set(
        `blacklist:${ipAddress}`,
        { blacklisted: true, timestamp: new Date() },
        { namespace: 'rate_limit', ttl: duration }
      );

      logger.warn('IP address blacklisted', {
        component: 'AdvancedRateLimiting',
        ipAddress,
        duration
      });

      return true;
    } catch (error) {
      logger.error('Failed to blacklist IP address', {
        component: 'AdvancedRateLimiting',
        ipAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if IP is blacklisted
   */
  async isBlacklisted(ipAddress: string): Promise<boolean> {
    try {
      const blacklisted = await this.cacheService.get(
        `blacklist:${ipAddress}`,
        { namespace: 'rate_limit' }
      );
      return !!blacklisted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start cleanup interval for memory store
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, record] of this.memoryStore.entries()) {
        if (now > record.resetTime) {
          this.memoryStore.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Cleaned expired rate limit records', {
          component: 'AdvancedRateLimiting',
          cleaned: cleanedCount,
          remaining: this.memoryStore.size
        });
      }
    }, 60 * 1000); // Clean every minute
  }

  /**
   * Get comprehensive rate limiting status
   */
  getStatus(): {
    rules: number;
    memoryRecords: number;
    totalRequests: number;
    totalBlocked: number;
    overallBlockRate: number;
    recentEvents: number;
  } {
    let totalRequests = 0;
    let totalBlocked = 0;

    this.stats.forEach(stat => {
      totalRequests += stat.totalRequests;
      totalBlocked += stat.blockedRequests;
    });

    const recentEvents = this.securityEvents.filter(
      event => event.timestamp.getTime() > Date.now() - 60 * 60 * 1000 // Last hour
    ).length;

    return {
      rules: this.rules.size,
      memoryRecords: this.memoryStore.size,
      totalRequests,
      totalBlocked,
      overallBlockRate: totalRequests > 0 ? (totalBlocked / totalRequests) * 100 : 0,
      recentEvents
    };
  }
}

export default AdvancedRateLimiting;

