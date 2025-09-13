import { logger } from '../utils/logger';
import { DatabaseOptimizer } from './databaseOptimizer';
import { CachingStrategy } from './cachingStrategy';
import { PerformanceMonitor } from './performanceMonitor';
import { WebSocketOptimization } from './websocketOptimization';
import { AssetOptimization } from './assetOptimization';
import { JWTSecurity } from '../security/jwtSecurity';
import { InputValidation } from '../security/inputValidation';
import { AdvancedRateLimiting } from '../security/advancedRateLimiting';
import { SecurityHeaders } from '../security/securityHeaders';
import { GDPRCompliance } from '../security/gdprCompliance';
import { AuditLogging } from '../security/auditLogging';
import { CacheService } from '../infrastructure/cache/cacheService';
import { QueueService } from '../infrastructure/queue/queueService';
import { CDNService } from '../infrastructure/cdn/cdnService';
import { PrismaClient } from '@prisma/client';

export interface IntegratedConfig {
  performance: {
    enableDatabaseOptimization: boolean;
    enableCaching: boolean;
    enablePerformanceMonitoring: boolean;
    enableWebSocketOptimization: boolean;
    enableAssetOptimization: boolean;
  };
  security: {
    enableJWTSecurity: boolean;
    enableInputValidation: boolean;
    enableRateLimiting: boolean;
    enableSecurityHeaders: boolean;
    enableAuditLogging: boolean;
  };
  compliance: {
    enableGDPRCompliance: boolean;
    enableDataEncryption: boolean;
    enablePrivacyControls: boolean;
  };
  loadTesting: {
    enabled: boolean;
    targetConcurrentUsers: number;
    rampUpTime: number;
    testDuration: number;
  };
}

export interface SystemHealthReport {
  timestamp: Date;
  performance: {
    databaseHealth: 'healthy' | 'degraded' | 'critical';
    cacheHealth: 'healthy' | 'degraded' | 'critical';
    responseTime: number;
    throughput: number;
    errorRate: number;
    resourceUtilization: {
      cpu: number;
      memory: number;
      disk: number;
    };
  };
  security: {
    securityScore: number;
    activeThreats: number;
    blockedRequests: number;
    suspiciousActivities: number;
    complianceStatus: 'compliant' | 'warning' | 'non-compliant';
  };
  loadTest: {
    lastTestDate: Date;
    maxConcurrentUsers: number;
    averageResponseTime: number;
    successRate: number;
    bottlenecks: string[];
  };
}

export interface RBAC {
  roles: Map<string, Role>;
  permissions: Map<string, Permission>;
  userRoles: Map<string, Set<string>>;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Set<string>;
  inherits: Set<string>; // Role inheritance
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string;
  conditions?: string; // JSON string of conditions
  createdAt: Date;
}

export class PerformanceSecurityIntegration {
  private config: IntegratedConfig;
  private prisma: PrismaClient;
  private cacheService: CacheService;
  private queueService: QueueService;
  private cdnService?: CDNService;

  // Performance components
  private databaseOptimizer?: DatabaseOptimizer;
  private cachingStrategy?: CachingStrategy;
  private performanceMonitor?: PerformanceMonitor;
  private webSocketOptimization?: WebSocketOptimization;
  private assetOptimization?: AssetOptimization;

  // Security components
  private jwtSecurity?: JWTSecurity;
  private inputValidation?: InputValidation;
  private rateLimiting?: AdvancedRateLimiting;
  private securityHeaders?: SecurityHeaders;
  private auditLogging?: AuditLogging;
  private gdprCompliance?: GDPRCompliance;

  // RBAC system
  private rbac: RBAC;

  constructor(
    config: IntegratedConfig,
    prisma: PrismaClient,
    cacheService: CacheService,
    queueService: QueueService,
    cdnService?: CDNService
  ) {
    this.config = config;
    this.prisma = prisma;
    this.cacheService = cacheService;
    this.queueService = queueService;
    this.cdnService = cdnService;

    // Initialize RBAC
    this.rbac = {
      roles: new Map(),
      permissions: new Map(),
      userRoles: new Map()
    };

    this.initializeComponents();
    this.initializeRBAC();

    logger.info('Performance Security Integration initialized', {
      component: 'PerformanceSecurityIntegration',
      config: {
        performance: Object.values(config.performance).filter(Boolean).length,
        security: Object.values(config.security).filter(Boolean).length,
        compliance: Object.values(config.compliance).filter(Boolean).length,
        loadTesting: config.loadTesting.enabled
      }
    });
  }

  /**
   * Initialize all components based on configuration
   */
  private async initializeComponents(): Promise<void> {
    try {
      // Initialize performance components
      if (this.config.performance.enableDatabaseOptimization) {
        this.databaseOptimizer = new DatabaseOptimizer();
      }

      if (this.config.performance.enableCaching) {
        this.cachingStrategy = new CachingStrategy(
          {
            enableInMemory: true,
            enableRedis: true,
            enableCDN: !!this.cdnService,
            inMemorySize: 1000,
            defaultTTL: 3600,
            refreshConcurrency: 10,
            compressionThreshold: 1024
          },
          this.cacheService,
          this.cdnService!
        );
      }

      if (this.config.performance.enablePerformanceMonitoring) {
        this.performanceMonitor = new PerformanceMonitor(
          this.cacheService,
          this.queueService
        );
      }

      if (this.config.performance.enableWebSocketOptimization) {
        this.webSocketOptimization = new WebSocketOptimization(
          this.cacheService,
          this.rateLimiting!,
          {
            maxConnections: 10000,
            maxConnectionsPerIP: 100,
            connectionTimeout: 300000,
            heartbeatInterval: 30000,
            messageQueueSize: 100,
            compressionEnabled: true,
            rateLimiting: {
              messagesPerSecond: 10,
              bytesPerSecond: 10240,
              burstSize: 50
            },
            clustering: {
              enabled: true,
              redisChannel: 'websocket_cluster'
            }
          }
        );
      }

      if (this.config.performance.enableAssetOptimization) {
        this.assetOptimization = new AssetOptimization(
          {
            inputDirectory: './frontend/src',
            outputDirectory: './frontend/build',
            publicPath: '/static',
            enableCompression: true,
            enableMinification: true,
            enableImageOptimization: true,
            enableBundling: true,
            enableCodeSplitting: true,
            enableTreeShaking: true,
            enableLazyLoading: true,
            cacheMaxAge: 31536000,
            compressionLevel: 6,
            imageQuality: 85,
            supportedFormats: ['jpg', 'png', 'webp', 'svg'],
            excludePatterns: ['*.test.*', '**/node_modules/**']
          },
          this.cacheService,
          this.cdnService
        );
      }

      // Initialize security components
      if (this.config.security.enableJWTSecurity) {
        this.jwtSecurity = new JWTSecurity(
          {
            accessTokenSecret: process.env.JWT_ACCESS_SECRET!,
            refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
            accessTokenExpiry: '15m',
            refreshTokenExpiry: '7d',
            issuer: 'quizmaster-pro',
            audience: 'quizmaster-users',
            algorithm: 'HS256',
            refreshTokenRotation: true,
            maxRefreshTokens: 5,
            blacklistEnabled: true,
            rateLimitEnabled: true
          },
          this.cacheService
        );
      }

      if (this.config.security.enableInputValidation) {
        this.inputValidation = new InputValidation({
          html: {
            allowedTags: ['b', 'i', 'u', 'strong', 'em'],
            allowedAttributes: {},
            stripTags: true
          },
          fileUpload: {
            allowedExtensions: ['.jpg', '.png', '.pdf'],
            maxFileSize: 10 * 1024 * 1024,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
          }
        });
      }

      if (this.config.security.enableRateLimiting) {
        this.rateLimiting = new AdvancedRateLimiting(this.cacheService);
      }

      if (this.config.security.enableSecurityHeaders) {
        this.securityHeaders = new SecurityHeaders({
          contentSecurityPolicy: { enabled: true },
          hsts: { enabled: true, maxAge: 31536000 },
          frameOptions: { enabled: true, action: 'DENY' }
        });
      }

      if (this.config.security.enableAuditLogging) {
        this.auditLogging = new AuditLogging(
          this.prisma,
          this.cacheService,
          this.queueService
        );
      }

      if (this.config.compliance.enableGDPRCompliance) {
        this.gdprCompliance = new GDPRCompliance(
          this.prisma,
          this.cacheService,
          this.queueService
        );
      }

      logger.info('All components initialized successfully', {
        component: 'PerformanceSecurityIntegration'
      });
    } catch (error) {
      logger.error('Failed to initialize components', {
        component: 'PerformanceSecurityIntegration',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Initialize RBAC system
   */
  private initializeRBAC(): void {
    // Define default permissions
    const permissions: Permission[] = [
      // User permissions
      { id: 'user:read', resource: 'user', action: 'read', description: 'Read user data', createdAt: new Date() },
      { id: 'user:write', resource: 'user', action: 'write', description: 'Modify user data', createdAt: new Date() },
      { id: 'user:delete', resource: 'user', action: 'delete', description: 'Delete user data', createdAt: new Date() },
      
      // Question permissions
      { id: 'question:read', resource: 'question', action: 'read', description: 'Read questions', createdAt: new Date() },
      { id: 'question:write', resource: 'question', action: 'write', description: 'Create/modify questions', createdAt: new Date() },
      { id: 'question:delete', resource: 'question', action: 'delete', description: 'Delete questions', createdAt: new Date() },
      { id: 'question:approve', resource: 'question', action: 'approve', description: 'Approve questions', createdAt: new Date() },
      
      // Game permissions
      { id: 'game:read', resource: 'game', action: 'read', description: 'View games', createdAt: new Date() },
      { id: 'game:write', resource: 'game', action: 'write', description: 'Create/modify games', createdAt: new Date() },
      { id: 'game:moderate', resource: 'game', action: 'moderate', description: 'Moderate games', createdAt: new Date() },
      
      // Admin permissions
      { id: 'admin:system', resource: 'system', action: 'admin', description: 'System administration', createdAt: new Date() },
      { id: 'admin:users', resource: 'user', action: 'admin', description: 'User administration', createdAt: new Date() },
      { id: 'admin:content', resource: 'content', action: 'admin', description: 'Content administration', createdAt: new Date() },
      
      // Analytics permissions
      { id: 'analytics:read', resource: 'analytics', action: 'read', description: 'View analytics', createdAt: new Date() },
      { id: 'analytics:export', resource: 'analytics', action: 'export', description: 'Export analytics data', createdAt: new Date() }
    ];

    permissions.forEach(permission => {
      this.rbac.permissions.set(permission.id, permission);
    });

    // Define default roles
    const roles: Role[] = [
      {
        id: 'guest',
        name: 'Guest',
        description: 'Anonymous user with limited access',
        permissions: new Set(['question:read']),
        inherits: new Set(),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'user',
        name: 'User',
        description: 'Registered user with basic permissions',
        permissions: new Set(['user:read', 'question:read', 'game:read', 'game:write']),
        inherits: new Set(['guest']),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'contributor',
        name: 'Contributor',
        description: 'User who can create questions',
        permissions: new Set(['question:write']),
        inherits: new Set(['user']),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'moderator',
        name: 'Moderator',
        description: 'User who can moderate content',
        permissions: new Set(['question:approve', 'game:moderate', 'user:write']),
        inherits: new Set(['contributor']),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Full system access',
        permissions: new Set([
          'admin:system', 'admin:users', 'admin:content',
          'user:delete', 'question:delete', 'analytics:read', 'analytics:export'
        ]),
        inherits: new Set(['moderator']),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    roles.forEach(role => {
      this.rbac.roles.set(role.id, role);
    });

    logger.info('RBAC system initialized', {
      component: 'PerformanceSecurityIntegration',
      permissions: this.rbac.permissions.size,
      roles: this.rbac.roles.size
    });
  }

  /**
   * Check if user has permission
   */
  hasPermission(userId: string, resource: string, action: string): boolean {
    try {
      const userRoles = this.rbac.userRoles.get(userId);
      if (!userRoles || userRoles.size === 0) {
        // Check guest permissions
        return this.roleHasPermission('guest', resource, action);
      }

      for (const roleId of userRoles) {
        if (this.roleHasPermission(roleId, resource, action)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Permission check failed', {
        component: 'PerformanceSecurityIntegration',
        userId,
        resource,
        action,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if role has permission
   */
  private roleHasPermission(roleId: string, resource: string, action: string): boolean {
    const role = this.rbac.roles.get(roleId);
    if (!role) return false;

    const permissionId = `${resource}:${action}`;
    
    // Check direct permissions
    if (role.permissions.has(permissionId)) {
      return true;
    }

    // Check inherited permissions
    for (const inheritedRoleId of role.inherits) {
      if (this.roleHasPermission(inheritedRoleId, resource, action)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, roleId: string): Promise<boolean> {
    try {
      if (!this.rbac.roles.has(roleId)) {
        throw new Error(`Role ${roleId} does not exist`);
      }

      if (!this.rbac.userRoles.has(userId)) {
        this.rbac.userRoles.set(userId, new Set());
      }

      this.rbac.userRoles.get(userId)!.add(roleId);

      // Log the assignment
      if (this.auditLogging) {
        await this.auditLogging.logEvent({
          userId: 'system',
          action: 'role_assignment',
          resource: 'user',
          resourceId: userId,
          category: 'authorization',
          riskLevel: 'medium',
          details: { assignedRole: roleId },
          outcome: 'success'
        });
      }

      logger.info('Role assigned to user', {
        component: 'PerformanceSecurityIntegration',
        userId,
        roleId
      });

      return true;
    } catch (error) {
      logger.error('Failed to assign role', {
        component: 'PerformanceSecurityIntegration',
        userId,
        roleId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Generate comprehensive system health report
   */
  async generateSystemHealthReport(): Promise<SystemHealthReport> {
    try {
      const timestamp = new Date();

      // Performance metrics
      const performanceStatus = this.performanceMonitor?.getCurrentStatus() || {
        activeRequests: 0,
        averageResponseTime: 0,
        errorRate: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        activeAlerts: 0,
        criticalAlerts: 0
      };

      // Security metrics
      const rateLimitingStats = this.rateLimiting?.getStatus() || {
        totalRequests: 0,
        totalBlocked: 0,
        overallBlockRate: 0
      };

      const securityStats = this.jwtSecurity?.getSecurityStats() || {
        activeRefreshTokens: 0,
        recentSuspiciousActivity: 0
      };

      // Calculate security score
      let securityScore = 100;
      if (rateLimitingStats.overallBlockRate > 5) securityScore -= 10;
      if (securityStats.recentSuspiciousActivity > 10) securityScore -= 20;
      if (performanceStatus.criticalAlerts > 0) securityScore -= 15;

      // Mock load test results (would be replaced with actual load test data)
      const loadTestResults = {
        lastTestDate: new Date(Date.now() - 86400000), // 1 day ago
        maxConcurrentUsers: this.config.loadTesting.targetConcurrentUsers,
        averageResponseTime: performanceStatus.averageResponseTime,
        successRate: Math.max(0, 100 - performanceStatus.errorRate),
        bottlenecks: this.identifyBottlenecks(performanceStatus)
      };

      return {
        timestamp,
        performance: {
          databaseHealth: this.assessDatabaseHealth(),
          cacheHealth: this.assessCacheHealth(),
          responseTime: performanceStatus.averageResponseTime,
          throughput: this.calculateThroughput(),
          errorRate: performanceStatus.errorRate,
          resourceUtilization: {
            cpu: performanceStatus.cpuUsage,
            memory: performanceStatus.memoryUsage,
            disk: 0 // Would be implemented with actual disk monitoring
          }
        },
        security: {
          securityScore,
          activeThreats: securityStats.recentSuspiciousActivity,
          blockedRequests: rateLimitingStats.totalBlocked,
          suspiciousActivities: securityStats.recentSuspiciousActivity,
          complianceStatus: this.assessComplianceStatus()
        },
        loadTest: loadTestResults
      };
    } catch (error) {
      logger.error('Failed to generate system health report', {
        component: 'PerformanceSecurityIntegration',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Run load test
   */
  async runLoadTest(): Promise<{
    success: boolean;
    results?: {
      maxConcurrentUsers: number;
      averageResponseTime: number;
      p95ResponseTime: number;
      p99ResponseTime: number;
      errorRate: number;
      throughput: number;
      bottlenecks: string[];
    };
    error?: string;
  }> {
    if (!this.config.loadTesting.enabled) {
      return { success: false, error: 'Load testing is disabled' };
    }

    try {
      logger.info('Starting load test', {
        component: 'PerformanceSecurityIntegration',
        targetUsers: this.config.loadTesting.targetConcurrentUsers,
        duration: this.config.loadTesting.testDuration
      });

      // Mock load test execution (in production, use k6, Artillery, or JMeter)
      const results = await this.simulateLoadTest();

      // Log results
      if (this.auditLogging) {
        await this.auditLogging.logEvent({
          action: 'load_test',
          resource: 'system',
          category: 'system',
          riskLevel: 'low',
          details: results,
          outcome: 'success'
        });
      }

      return { success: true, results };
    } catch (error) {
      logger.error('Load test failed', {
        component: 'PerformanceSecurityIntegration',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Simulate load test (mock implementation)
   */
  private async simulateLoadTest(): Promise<any> {
    // Mock implementation - in production, this would run actual load tests
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          maxConcurrentUsers: this.config.loadTesting.targetConcurrentUsers,
          averageResponseTime: Math.random() * 100 + 50, // 50-150ms
          p95ResponseTime: Math.random() * 200 + 100, // 100-300ms
          p99ResponseTime: Math.random() * 500 + 200, // 200-700ms
          errorRate: Math.random() * 2, // 0-2%
          throughput: Math.random() * 1000 + 500, // 500-1500 RPS
          bottlenecks: ['Database queries', 'Memory allocation'].slice(0, Math.floor(Math.random() * 2) + 1)
        });
      }, 5000); // 5 second simulation
    });
  }

  /**
   * Assess system health components
   */
  private assessDatabaseHealth(): 'healthy' | 'degraded' | 'critical' {
    // Mock assessment - would integrate with actual database monitoring
    const randomScore = Math.random() * 100;
    if (randomScore > 80) return 'healthy';
    if (randomScore > 60) return 'degraded';
    return 'critical';
  }

  private assessCacheHealth(): 'healthy' | 'degraded' | 'critical' {
    // Mock assessment - would integrate with actual cache monitoring
    const randomScore = Math.random() * 100;
    if (randomScore > 80) return 'healthy';
    if (randomScore > 60) return 'degraded';
    return 'critical';
  }

  private calculateThroughput(): number {
    // Mock calculation - would use actual request metrics
    return Math.random() * 1000 + 200; // 200-1200 RPS
  }

  private identifyBottlenecks(performanceStatus: any): string[] {
    const bottlenecks: string[] = [];
    
    if (performanceStatus.averageResponseTime > 1000) {
      bottlenecks.push('High response times');
    }
    
    if (performanceStatus.memoryUsage > 80) {
      bottlenecks.push('High memory usage');
    }
    
    if (performanceStatus.cpuUsage > 80) {
      bottlenecks.push('High CPU usage');
    }
    
    if (performanceStatus.errorRate > 5) {
      bottlenecks.push('High error rate');
    }
    
    return bottlenecks;
  }

  private assessComplianceStatus(): 'compliant' | 'warning' | 'non-compliant' {
    // Mock assessment - would integrate with actual compliance monitoring
    const randomScore = Math.random() * 100;
    if (randomScore > 85) return 'compliant';
    if (randomScore > 65) return 'warning';
    return 'non-compliant';
  }

  /**
   * Get integration status
   */
  getStatus(): {
    performance: Record<string, boolean>;
    security: Record<string, boolean>;
    compliance: Record<string, boolean>;
    rbac: {
      roles: number;
      permissions: number;
      users: number;
    };
  } {
    return {
      performance: {
        databaseOptimization: !!this.databaseOptimizer,
        caching: !!this.cachingStrategy,
        performanceMonitoring: !!this.performanceMonitor,
        webSocketOptimization: !!this.webSocketOptimization,
        assetOptimization: !!this.assetOptimization
      },
      security: {
        jwtSecurity: !!this.jwtSecurity,
        inputValidation: !!this.inputValidation,
        rateLimiting: !!this.rateLimiting,
        securityHeaders: !!this.securityHeaders,
        auditLogging: !!this.auditLogging
      },
      compliance: {
        gdprCompliance: !!this.gdprCompliance,
        dataEncryption: this.config.compliance.enableDataEncryption,
        privacyControls: this.config.compliance.enablePrivacyControls
      },
      rbac: {
        roles: this.rbac.roles.size,
        permissions: this.rbac.permissions.size,
        users: this.rbac.userRoles.size
      }
    };
  }

  /**
   * Get all available components
   */
  getComponents(): {
    databaseOptimizer?: DatabaseOptimizer;
    cachingStrategy?: CachingStrategy;
    performanceMonitor?: PerformanceMonitor;
    webSocketOptimization?: WebSocketOptimization;
    assetOptimization?: AssetOptimization;
    jwtSecurity?: JWTSecurity;
    inputValidation?: InputValidation;
    rateLimiting?: AdvancedRateLimiting;
    securityHeaders?: SecurityHeaders;
    auditLogging?: AuditLogging;
    gdprCompliance?: GDPRCompliance;
  } {
    return {
      databaseOptimizer: this.databaseOptimizer,
      cachingStrategy: this.cachingStrategy,
      performanceMonitor: this.performanceMonitor,
      webSocketOptimization: this.webSocketOptimization,
      assetOptimization: this.assetOptimization,
      jwtSecurity: this.jwtSecurity,
      inputValidation: this.inputValidation,
      rateLimiting: this.rateLimiting,
      securityHeaders: this.securityHeaders,
      auditLogging: this.auditLogging,
      gdprCompliance: this.gdprCompliance
    };
  }
}

export default PerformanceSecurityIntegration;

