import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { CacheService } from '../infrastructure/cache/cacheService';

export interface JWTConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string; // e.g., '15m'
  refreshTokenExpiry: string; // e.g., '7d'
  issuer: string;
  audience: string;
  algorithm: 'HS256' | 'RS256';
  refreshTokenRotation: boolean;
  maxRefreshTokens: number;
  blacklistEnabled: boolean;
  rateLimitEnabled: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: Date;
  refreshTokenExpiry: Date;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  sessionId: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshTokenData {
  tokenId: string;
  userId: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revoked: boolean;
  family: string; // Token family for rotation tracking
}

export interface SecurityEvent {
  type: 'token_issued' | 'token_refreshed' | 'token_revoked' | 'suspicious_activity' | 'rate_limit_exceeded';
  userId: string;
  sessionId: string;
  details: Record<string, any>;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class JWTSecurity {
  private config: JWTConfig;
  private cacheService: CacheService;
  private refreshTokens: Map<string, RefreshTokenData> = new Map();
  private blacklistedTokens: Set<string> = new Set();
  private rateLimitMap: Map<string, { count: number; resetTime: number }> = new Map();
  private securityEvents: SecurityEvent[] = [];

  constructor(config: JWTConfig, cacheService: CacheService) {
    this.config = config;
    this.cacheService = cacheService;
    
    this.startCleanupInterval();
    this.validateConfig();

    logger.info('JWT Security service initialized', {
      component: 'JWTSecurity',
      accessTokenExpiry: config.accessTokenExpiry,
      refreshTokenExpiry: config.refreshTokenExpiry,
      refreshTokenRotation: config.refreshTokenRotation,
      maxRefreshTokens: config.maxRefreshTokens
    });
  }

  /**
   * Validate JWT configuration
   */
  private validateConfig(): void {
    if (!this.config.accessTokenSecret || this.config.accessTokenSecret.length < 32) {
      throw new Error('Access token secret must be at least 32 characters long');
    }
    
    if (!this.config.refreshTokenSecret || this.config.refreshTokenSecret.length < 32) {
      throw new Error('Refresh token secret must be at least 32 characters long');
    }
    
    if (this.config.accessTokenSecret === this.config.refreshTokenSecret) {
      throw new Error('Access token and refresh token secrets must be different');
    }
  }

  /**
   * Generate a new token pair
   */
  async generateTokenPair(
    payload: JWTPayload,
    options: {
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<TokenPair> {
    try {
      // Check rate limiting
      if (this.config.rateLimitEnabled) {
        await this.checkRateLimit(payload.userId, 'token_generation');
      }

      // Generate session ID if not provided
      if (!payload.sessionId) {
        payload.sessionId = this.generateSecureId();
      }

      // Create access token
      const accessTokenPayload = {
        ...payload,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        jti: this.generateSecureId()
      };

      const accessToken = jwt.sign(accessTokenPayload, this.config.accessTokenSecret, {
        expiresIn: this.config.accessTokenExpiry,
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithm: this.config.algorithm
      });

      // Generate refresh token
      const refreshTokenId = this.generateSecureId();
      const refreshTokenFamily = this.generateSecureId();
      
      const refreshTokenPayload = {
        userId: payload.userId,
        sessionId: payload.sessionId,
        tokenId: refreshTokenId,
        family: refreshTokenFamily,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        jti: refreshTokenId
      };

      const refreshToken = jwt.sign(refreshTokenPayload, this.config.refreshTokenSecret, {
        expiresIn: this.config.refreshTokenExpiry,
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithm: this.config.algorithm
      });

      // Calculate expiry dates
      const accessTokenExpiry = new Date(Date.now() + this.parseExpiry(this.config.accessTokenExpiry));
      const refreshTokenExpiry = new Date(Date.now() + this.parseExpiry(this.config.refreshTokenExpiry));

      // Store refresh token data
      const refreshTokenData: RefreshTokenData = {
        tokenId: refreshTokenId,
        userId: payload.userId,
        deviceId: options.deviceId,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: refreshTokenExpiry,
        revoked: false,
        family: refreshTokenFamily
      };

      this.refreshTokens.set(refreshTokenId, refreshTokenData);

      // Store in cache for persistence
      await this.cacheService.set(
        `refresh_token:${refreshTokenId}`,
        refreshTokenData,
        { namespace: 'auth', ttl: this.parseExpiry(this.config.refreshTokenExpiry) / 1000 }
      );

      // Clean up old refresh tokens for user
      await this.cleanupUserRefreshTokens(payload.userId);

      // Log security event
      await this.logSecurityEvent({
        type: 'token_issued',
        userId: payload.userId,
        sessionId: payload.sessionId,
        details: {
          deviceId: options.deviceId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent,
          tokenFamily: refreshTokenFamily
        },
        timestamp: new Date(),
        severity: 'low'
      });

      return {
        accessToken,
        refreshToken,
        accessTokenExpiry,
        refreshTokenExpiry
      };
    } catch (error) {
      logger.error('Failed to generate token pair', {
        component: 'JWTSecurity',
        userId: payload.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<JWTPayload | null> {
    try {
      // Check if token is blacklisted
      if (this.config.blacklistEnabled && this.blacklistedTokens.has(token)) {
        return null;
      }

      // Check cache for blacklisted tokens
      const isBlacklisted = await this.cacheService.exists(`blacklist:${token}`, 'auth');
      if (isBlacklisted) {
        this.blacklistedTokens.add(token);
        return null;
      }

      const decoded = jwt.verify(token, this.config.accessTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm]
      }) as any;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions || [],
        sessionId: decoded.sessionId,
        deviceId: decoded.deviceId,
        ipAddress: decoded.ipAddress,
        userAgent: decoded.userAgent
      };
    } catch (error) {
      logger.warn('Access token verification failed', {
        component: 'JWTSecurity',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Refresh token pair
   */
  async refreshTokenPair(
    refreshToken: string,
    options: {
      deviceId?: string;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<TokenPair | null> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.config.refreshTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm]
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get refresh token data
      let refreshTokenData = this.refreshTokens.get(decoded.tokenId);
      if (!refreshTokenData) {
        // Try to get from cache
        refreshTokenData = await this.cacheService.get<RefreshTokenData>(
          `refresh_token:${decoded.tokenId}`,
          { namespace: 'auth' }
        );
        
        if (refreshTokenData) {
          this.refreshTokens.set(decoded.tokenId, refreshTokenData);
        }
      }

      if (!refreshTokenData || refreshTokenData.revoked) {
        // Potential token reuse attack - revoke entire token family
        await this.revokeTokenFamily(decoded.family);
        
        await this.logSecurityEvent({
          type: 'suspicious_activity',
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          details: {
            reason: 'refresh_token_reuse',
            tokenFamily: decoded.family,
            deviceId: options.deviceId,
            ipAddress: options.ipAddress
          },
          timestamp: new Date(),
          severity: 'critical'
        });

        return null;
      }

      // Check if token has expired
      if (new Date() > refreshTokenData.expiresAt) {
        await this.revokeRefreshToken(decoded.tokenId);
        return null;
      }

      // Check rate limiting
      if (this.config.rateLimitEnabled) {
        await this.checkRateLimit(decoded.userId, 'token_refresh');
      }

      // Update last used time
      refreshTokenData.lastUsedAt = new Date();

      // Generate new access token
      const newPayload: JWTPayload = {
        userId: decoded.userId,
        email: refreshTokenData.userId, // Would need to fetch actual email
        role: 'user', // Would need to fetch actual role
        permissions: [], // Would need to fetch actual permissions
        sessionId: decoded.sessionId,
        deviceId: options.deviceId,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent
      };

      let newRefreshToken = refreshToken;
      let newRefreshTokenExpiry = refreshTokenData.expiresAt;

      // Rotate refresh token if enabled
      if (this.config.refreshTokenRotation) {
        // Revoke old refresh token
        await this.revokeRefreshToken(decoded.tokenId);

        // Generate new refresh token in same family
        const newRefreshTokenId = this.generateSecureId();
        const newRefreshTokenPayload = {
          userId: decoded.userId,
          sessionId: decoded.sessionId,
          tokenId: newRefreshTokenId,
          family: decoded.family,
          type: 'refresh',
          iat: Math.floor(Date.now() / 1000),
          jti: newRefreshTokenId
        };

        newRefreshToken = jwt.sign(newRefreshTokenPayload, this.config.refreshTokenSecret, {
          expiresIn: this.config.refreshTokenExpiry,
          issuer: this.config.issuer,
          audience: this.config.audience,
          algorithm: this.config.algorithm
        });

        newRefreshTokenExpiry = new Date(Date.now() + this.parseExpiry(this.config.refreshTokenExpiry));

        // Store new refresh token data
        const newRefreshTokenData: RefreshTokenData = {
          ...refreshTokenData,
          tokenId: newRefreshTokenId,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          expiresAt: newRefreshTokenExpiry,
          revoked: false
        };

        this.refreshTokens.set(newRefreshTokenId, newRefreshTokenData);
        await this.cacheService.set(
          `refresh_token:${newRefreshTokenId}`,
          newRefreshTokenData,
          { namespace: 'auth', ttl: this.parseExpiry(this.config.refreshTokenExpiry) / 1000 }
        );
      }

      // Generate new access token
      const accessTokenPayload = {
        ...newPayload,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        jti: this.generateSecureId()
      };

      const accessToken = jwt.sign(accessTokenPayload, this.config.accessTokenSecret, {
        expiresIn: this.config.accessTokenExpiry,
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithm: this.config.algorithm
      });

      const accessTokenExpiry = new Date(Date.now() + this.parseExpiry(this.config.accessTokenExpiry));

      // Log security event
      await this.logSecurityEvent({
        type: 'token_refreshed',
        userId: decoded.userId,
        sessionId: decoded.sessionId,
        details: {
          tokenRotated: this.config.refreshTokenRotation,
          deviceId: options.deviceId,
          ipAddress: options.ipAddress,
          userAgent: options.userAgent
        },
        timestamp: new Date(),
        severity: 'low'
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        accessTokenExpiry,
        refreshTokenExpiry: newRefreshTokenExpiry
      };
    } catch (error) {
      logger.error('Token refresh failed', {
        component: 'JWTSecurity',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenId: string): Promise<boolean> {
    try {
      const refreshTokenData = this.refreshTokens.get(tokenId);
      if (refreshTokenData) {
        refreshTokenData.revoked = true;
        this.refreshTokens.set(tokenId, refreshTokenData);
        
        // Update in cache
        await this.cacheService.set(
          `refresh_token:${tokenId}`,
          refreshTokenData,
          { namespace: 'auth', ttl: this.parseExpiry(this.config.refreshTokenExpiry) / 1000 }
        );

        await this.logSecurityEvent({
          type: 'token_revoked',
          userId: refreshTokenData.userId,
          sessionId: 'unknown',
          details: { tokenId, reason: 'manual_revocation' },
          timestamp: new Date(),
          severity: 'low'
        });

        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to revoke refresh token', {
        component: 'JWTSecurity',
        tokenId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Revoke entire token family (used for security breaches)
   */
  async revokeTokenFamily(family: string): Promise<void> {
    try {
      for (const [tokenId, data] of this.refreshTokens.entries()) {
        if (data.family === family && !data.revoked) {
          await this.revokeRefreshToken(tokenId);
        }
      }

      logger.warn('Token family revoked due to security concern', {
        component: 'JWTSecurity',
        family
      });
    } catch (error) {
      logger.error('Failed to revoke token family', {
        component: 'JWTSecurity',
        family,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Revoke all user tokens
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    let revokedCount = 0;
    
    try {
      for (const [tokenId, data] of this.refreshTokens.entries()) {
        if (data.userId === userId && !data.revoked) {
          await this.revokeRefreshToken(tokenId);
          revokedCount++;
        }
      }

      await this.logSecurityEvent({
        type: 'token_revoked',
        userId,
        sessionId: 'all',
        details: { reason: 'revoke_all_user_tokens', count: revokedCount },
        timestamp: new Date(),
        severity: 'medium'
      });

      return revokedCount;
    } catch (error) {
      logger.error('Failed to revoke all user tokens', {
        component: 'JWTSecurity',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return revokedCount;
    }
  }

  /**
   * Blacklist access token
   */
  async blacklistAccessToken(token: string): Promise<boolean> {
    try {
      if (!this.config.blacklistEnabled) {
        return false;
      }

      // Decode to get expiry (don't verify, just decode)
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return false;
      }

      const expiryTime = decoded.exp * 1000 - Date.now();
      if (expiryTime <= 0) {
        return true; // Already expired
      }

      // Add to local blacklist
      this.blacklistedTokens.add(token);

      // Add to cache with TTL equal to token expiry
      await this.cacheService.set(
        `blacklist:${token}`,
        true,
        { namespace: 'auth', ttl: Math.ceil(expiryTime / 1000) }
      );

      return true;
    } catch (error) {
      logger.error('Failed to blacklist access token', {
        component: 'JWTSecurity',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(userId: string, operation: string): Promise<void> {
    const key = `${userId}:${operation}`;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = operation === 'token_generation' ? 10 : 50;

    let rateLimitData = this.rateLimitMap.get(key);
    
    if (!rateLimitData || now > rateLimitData.resetTime) {
      rateLimitData = { count: 0, resetTime: now + windowMs };
    }

    if (rateLimitData.count >= maxAttempts) {
      await this.logSecurityEvent({
        type: 'rate_limit_exceeded',
        userId,
        sessionId: 'unknown',
        details: { operation, attempts: rateLimitData.count },
        timestamp: new Date(),
        severity: 'high'
      });

      throw new Error(`Rate limit exceeded for ${operation}`);
    }

    rateLimitData.count++;
    this.rateLimitMap.set(key, rateLimitData);
  }

  /**
   * Clean up old refresh tokens for user
   */
  private async cleanupUserRefreshTokens(userId: string): Promise<void> {
    const userTokens = Array.from(this.refreshTokens.values())
      .filter(token => token.userId === userId && !token.revoked)
      .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime());

    if (userTokens.length > this.config.maxRefreshTokens) {
      const tokensToRevoke = userTokens.slice(this.config.maxRefreshTokens);
      
      for (const token of tokensToRevoke) {
        await this.revokeRefreshToken(token.tokenId);
      }
    }
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
    const logLevel = event.severity === 'critical' || event.severity === 'high' ? 'error' : 'info';
    logger.log(logLevel, 'Security event', {
      component: 'JWTSecurity',
      ...event
    });

    // Store in cache for external monitoring
    await this.cacheService.set(
      `security_event:${event.userId}:${event.timestamp.getTime()}`,
      event,
      { namespace: 'security', ttl: 86400 } // 24 hours
    );
  }

  /**
   * Get user security events
   */
  getUserSecurityEvents(userId: string, limit: number = 50): SecurityEvent[] {
    return this.securityEvents
      .filter(event => event.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get user active sessions
   */
  getUserActiveSessions(userId: string): Array<{
    tokenId: string;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
  }> {
    return Array.from(this.refreshTokens.values())
      .filter(token => token.userId === userId && !token.revoked && new Date() < token.expiresAt)
      .map(token => ({
        tokenId: token.tokenId,
        deviceId: token.deviceId,
        ipAddress: token.ipAddress,
        userAgent: token.userAgent,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
        expiresAt: token.expiresAt
      }));
  }

  /**
   * Generate secure ID
   */
  private generateSecureId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Parse expiry string to milliseconds
   */
  private parseExpiry(expiry: string): number {
    const units: Record<string, number> = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = new Date();
      let cleanedCount = 0;

      // Clean expired refresh tokens
      for (const [tokenId, data] of this.refreshTokens.entries()) {
        if (now > data.expiresAt) {
          this.refreshTokens.delete(tokenId);
          cleanedCount++;
        }
      }

      // Clean rate limit data
      const currentTime = Date.now();
      for (const [key, data] of this.rateLimitMap.entries()) {
        if (currentTime > data.resetTime) {
          this.rateLimitMap.delete(key);
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Cleaned expired tokens', {
          component: 'JWTSecurity',
          cleaned: cleanedCount,
          remaining: this.refreshTokens.size
        });
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    activeRefreshTokens: number;
    blacklistedTokens: number;
    securityEvents: number;
    rateLimitEntries: number;
    recentSuspiciousActivity: number;
  } {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      activeRefreshTokens: Array.from(this.refreshTokens.values())
        .filter(token => !token.revoked && now < token.expiresAt).length,
      blacklistedTokens: this.blacklistedTokens.size,
      securityEvents: this.securityEvents.length,
      rateLimitEntries: this.rateLimitMap.size,
      recentSuspiciousActivity: this.securityEvents
        .filter(event => 
          event.timestamp > oneDayAgo && 
          (event.severity === 'high' || event.severity === 'critical')
        ).length
    };
  }
}

export default JWTSecurity;

