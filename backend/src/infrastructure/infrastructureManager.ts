import RedisClient from './redis/redisClient';
import { CacheService } from './cache/cacheService';
import { QueueService } from './queue/queueService';
import { LoadBalancer } from './loadBalancer/loadBalancer';
import { DatabaseConnectionPool } from './database/connectionPool';
import { CDNService } from './cdn/cdnService';
import { ServiceDiscovery } from '../gateway/serviceDiscovery';
import { logger } from '../utils/logger';

export interface InfrastructureConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  database: {
    primary: {
      url: string;
      maxConnections: number;
      minConnections: number;
      idleTimeout: number;
      acquireTimeout: number;
    };
    replicas?: Array<{
      url: string;
      maxConnections: number;
      weight: number;
      readonly: boolean;
    }>;
    queryLogging: boolean;
    slowQueryThreshold: number;
    retryAttempts: number;
    retryDelay: number;
  };
  cdn: {
    provider: 'cloudflare' | 'aws' | 'gcp' | 'azure' | 'local';
    baseUrl: string;
    apiKey?: string;
    secretKey?: string;
    region?: string;
    bucketName?: string;
    cacheEnabled: boolean;
    cacheTTL: number;
    gzipEnabled: boolean;
    brotliEnabled: boolean;
    imageOptimization: boolean;
    securityHeaders: boolean;
  };
  loadBalancer: {
    algorithm: 'round-robin' | 'weighted-round-robin' | 'least-connections' | 'response-time' | 'random';
    healthCheckInterval: number;
    healthCheckTimeout: number;
    maxRetries: number;
    circuitBreakerEnabled: boolean;
    stickySession?: boolean;
    sessionAffinityKey?: string;
  };
  monitoring: {
    metricsCollectionInterval: number;
    healthCheckInterval: number;
    alertThresholds: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      responseTime: number;
      errorRate: number;
    };
  };
}

export interface InfrastructureStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    redis: 'healthy' | 'unhealthy';
    database: 'healthy' | 'unhealthy';
    cache: 'healthy' | 'unhealthy';
    queue: 'healthy' | 'unhealthy';
    cdn: 'healthy' | 'unhealthy';
    serviceDiscovery: 'healthy' | 'unhealthy';
  };
  services: {
    [serviceName: string]: {
      status: 'healthy' | 'unhealthy';
      instances: number;
      healthyInstances: number;
    };
  };
  metrics: {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
    cacheHitRate: number;
    databaseConnections: number;
    queuedJobs: number;
  };
  timestamp: Date;
}

export class InfrastructureManager {
  private static instance: InfrastructureManager;
  
  private redisClient: RedisClient;
  private cacheService: CacheService;
  private queueService: QueueService;
  private databasePool: DatabaseConnectionPool;
  private cdnService: CDNService;
  private serviceDiscovery: ServiceDiscovery;
  private loadBalancers: Map<string, LoadBalancer> = new Map();
  
  private initialized = false;
  private healthCheckTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private startTime: Date;

  private constructor(private config: InfrastructureConfig) {
    this.startTime = new Date();
  }

  public static getInstance(config?: InfrastructureConfig): InfrastructureManager {
    if (!InfrastructureManager.instance) {
      if (!config) {
        throw new Error('Infrastructure configuration is required for first initialization');
      }
      InfrastructureManager.instance = new InfrastructureManager(config);
    }
    return InfrastructureManager.instance;
  }

  /**
   * Initialize all infrastructure components
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Infrastructure already initialized', { component: 'InfrastructureManager' });
      return;
    }

    try {
      logger.info('Initializing infrastructure components...', { component: 'InfrastructureManager' });

      // Initialize Redis first (required by other services)
      await this.initializeRedis();

      // Initialize other services
      await Promise.all([
        this.initializeDatabase(),
        this.initializeCache(),
        this.initializeQueue(),
        this.initializeCDN(),
        this.initializeServiceDiscovery()
      ]);

      // Start monitoring
      this.startHealthMonitoring();
      this.startMetricsCollection();

      this.initialized = true;

      logger.info('Infrastructure initialization completed successfully', {
        component: 'InfrastructureManager',
        initializationTime: Date.now() - this.startTime.getTime()
      });
    } catch (error) {
      logger.error('Infrastructure initialization failed', {
        component: 'InfrastructureManager',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Initialize Redis client
   */
  private async initializeRedis(): Promise<void> {
    this.redisClient = RedisClient.getInstance();
    await this.redisClient.connect();
    
    logger.info('Redis client initialized', { component: 'InfrastructureManager' });
  }

  /**
   * Initialize database connection pool
   */
  private async initializeDatabase(): Promise<void> {
    this.databasePool = DatabaseConnectionPool.getInstance(this.config.database);
    
    // Test database connectivity
    const health = await this.databasePool.healthCheck();
    if (health.primary !== 'connected') {
      throw new Error('Primary database connection failed');
    }
    
    logger.info('Database connection pool initialized', {
      component: 'InfrastructureManager',
      primary: health.primary,
      replicas: health.replicas.length
    });
  }

  /**
   * Initialize cache service
   */
  private async initializeCache(): Promise<void> {
    this.cacheService = new CacheService();
    
    // Test cache connectivity
    const testKey = 'infrastructure:test';
    await this.cacheService.set(testKey, 'test', { ttl: 60 });
    const testValue = await this.cacheService.get(testKey);
    
    if (testValue !== 'test') {
      throw new Error('Cache service test failed');
    }
    
    await this.cacheService.del(testKey);
    
    logger.info('Cache service initialized', { component: 'InfrastructureManager' });
  }

  /**
   * Initialize queue service
   */
  private async initializeQueue(): Promise<void> {
    this.queueService = new QueueService();
    
    // Register basic processors
    this.registerQueueProcessors();
    
    logger.info('Queue service initialized', { component: 'InfrastructureManager' });
  }

  /**
   * Initialize CDN service
   */
  private async initializeCDN(): Promise<void> {
    this.cdnService = new CDNService(this.config.cdn);
    
    // Test CDN connectivity
    const health = await this.cdnService.healthCheck();
    if (health.status !== 'healthy') {
      logger.warn('CDN service is not fully healthy but continuing initialization', {
        component: 'InfrastructureManager',
        cdnStatus: health.status
      });
    }
    
    logger.info('CDN service initialized', {
      component: 'InfrastructureManager',
      provider: this.config.cdn.provider
    });
  }

  /**
   * Initialize service discovery
   */
  private async initializeServiceDiscovery(): Promise<void> {
    this.serviceDiscovery = ServiceDiscovery.getInstance();
    
    logger.info('Service discovery initialized', { component: 'InfrastructureManager' });
  }

  /**
   * Register load balancer for a service
   */
  registerLoadBalancer(serviceName: string): LoadBalancer {
    const loadBalancer = new LoadBalancer(serviceName, this.config.loadBalancer);
    this.loadBalancers.set(serviceName, loadBalancer);
    
    logger.info('Load balancer registered', {
      component: 'InfrastructureManager',
      serviceName,
      algorithm: this.config.loadBalancer.algorithm
    });
    
    return loadBalancer;
  }

  /**
   * Get load balancer for a service
   */
  getLoadBalancer(serviceName: string): LoadBalancer | null {
    return this.loadBalancers.get(serviceName) || null;
  }

  /**
   * Register queue processors
   */
  private registerQueueProcessors(): void {
    // Email processor
    this.queueService.registerProcessor('email', async (job) => {
      const { to, subject, body } = job.data;
      
      try {
        // Mock email sending
        logger.info('Email sent (mock)', {
          component: 'InfrastructureManager',
          to,
          subject
        });
        
        return { success: true, data: { messageId: `msg-${Date.now()}` } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }, 5); // 5 concurrent workers

    // Analytics processor
    this.queueService.registerProcessor('analytics', async (job) => {
      try {
        // Process analytics event
        logger.debug('Analytics event processed', {
          component: 'InfrastructureManager',
          eventType: job.data.eventType
        });
        
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }, 10); // 10 concurrent workers

    // File processing processor
    this.queueService.registerProcessor('fileProcessing', async (job) => {
      const { fileId, processingOptions } = job.data;
      
      try {
        // Mock file processing
        logger.info('File processed (mock)', {
          component: 'InfrastructureManager',
          fileId,
          options: processingOptions
        });
        
        return { success: true, data: { processedFileId: fileId } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }, 3); // 3 concurrent workers
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const status = await this.getInfrastructureStatus();
        
        if (status.overall === 'unhealthy') {
          logger.error('Infrastructure health check failed', {
            component: 'InfrastructureManager',
            status
          });
        } else if (status.overall === 'degraded') {
          logger.warn('Infrastructure health degraded', {
            component: 'InfrastructureManager',
            status
          });
        }
      } catch (error) {
        logger.error('Health monitoring error', {
          component: 'InfrastructureManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.monitoring.healthCheckInterval);
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        
        // Store metrics in cache for dashboard access
        await this.cacheService.set(
          'infrastructure:metrics',
          metrics,
          { namespace: 'monitoring', ttl: 300 }
        );
      } catch (error) {
        logger.error('Metrics collection error', {
          component: 'InfrastructureManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.monitoring.metricsCollectionInterval);
  }

  /**
   * Get comprehensive infrastructure status
   */
  async getInfrastructureStatus(): Promise<InfrastructureStatus> {
    try {
      const [
        redisHealth,
        databaseHealth,
        cacheStats,
        queueHealth,
        cdnHealth
      ] = await Promise.all([
        this.redisClient.healthCheck(),
        this.databasePool.healthCheck(),
        this.cacheService.getStats(),
        this.queueService.healthCheck(),
        this.cdnService.healthCheck()
      ]);

      // Get service statuses from service discovery
      const services: any = {};
      const registeredServices = await this.serviceDiscovery.discoverServices();
      
      for (const [serviceName, instances] of Object.entries(registeredServices)) {
        const instanceArray = Array.isArray(instances) ? instances : [instances];
        const healthyInstances = instanceArray.filter((instance: any) => instance.healthy).length;
        
        services[serviceName] = {
          status: healthyInstances > 0 ? 'healthy' : 'unhealthy',
          instances: instanceArray.length,
          healthyInstances
        };
      }

      // Determine component health
      const components = {
        redis: redisHealth.status,
        database: databaseHealth.primary === 'connected' ? 'healthy' : 'unhealthy',
        cache: cacheStats.hitRate >= 0 ? 'healthy' : 'unhealthy',
        queue: queueHealth.status,
        cdn: cdnHealth.status,
        serviceDiscovery: Object.keys(services).length > 0 ? 'healthy' : 'unhealthy'
      };

      // Calculate overall status
      const healthyComponents = Object.values(components).filter(status => status === 'healthy').length;
      const totalComponents = Object.values(components).length;
      
      let overall: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyComponents === totalComponents) {
        overall = 'healthy';
      } else if (healthyComponents >= totalComponents * 0.7) {
        overall = 'degraded';
      } else {
        overall = 'unhealthy';
      }

      // Collect metrics
      const queueStats = await this.queueService.getAllQueueStats();
      const totalQueuedJobs = Object.values(queueStats).reduce(
        (total, stats) => total + stats.waiting + stats.active + stats.delayed,
        0
      );

      return {
        overall,
        components,
        services,
        metrics: {
          totalRequests: 0, // Would be collected from load balancers
          averageResponseTime: 0, // Would be calculated from service metrics
          errorRate: 0, // Would be calculated from service metrics
          throughput: 0, // Would be calculated from service metrics
          cacheHitRate: cacheStats.hitRate,
          databaseConnections: 0, // Would be extracted from database pool
          queuedJobs: totalQueuedJobs
        },
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to get infrastructure status', {
        component: 'InfrastructureManager',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        overall: 'unhealthy',
        components: {
          redis: 'unhealthy',
          database: 'unhealthy',
          cache: 'unhealthy',
          queue: 'unhealthy',
          cdn: 'unhealthy',
          serviceDiscovery: 'unhealthy'
        },
        services: {},
        metrics: {
          totalRequests: 0,
          averageResponseTime: 0,
          errorRate: 0,
          throughput: 0,
          cacheHitRate: 0,
          databaseConnections: 0,
          queuedJobs: 0
        },
        timestamp: new Date()
      };
    }
  }

  /**
   * Collect detailed metrics
   */
  private async collectMetrics(): Promise<any> {
    const [
      cacheStats,
      queueStats,
      databaseStats,
      cdnStats
    ] = await Promise.all([
      this.cacheService.getStats(),
      this.queueService.getAllQueueStats(),
      this.databasePool.getStats(),
      this.cdnService.getStats()
    ]);

    return {
      timestamp: new Date(),
      cache: cacheStats,
      queues: queueStats,
      database: databaseStats,
      cdn: cdnStats,
      loadBalancers: Object.fromEntries(
        Array.from(this.loadBalancers.entries()).map(([name, lb]) => [name, lb.getStats()])
      )
    };
  }

  /**
   * Get specific service components
   */
  getRedisClient(): RedisClient {
    return this.redisClient;
  }

  getCacheService(): CacheService {
    return this.cacheService;
  }

  getQueueService(): QueueService {
    return this.queueService;
  }

  getDatabasePool(): DatabaseConnectionPool {
    return this.databasePool;
  }

  getCDNService(): CDNService {
    return this.cdnService;
  }

  getServiceDiscovery(): ServiceDiscovery {
    return this.serviceDiscovery;
  }

  /**
   * Graceful shutdown of all infrastructure components
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down infrastructure components...', { component: 'InfrastructureManager' });

    try {
      // Stop monitoring
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
      }

      // Shutdown load balancers
      this.loadBalancers.forEach(lb => lb.shutdown());

      // Shutdown services
      await Promise.all([
        this.queueService.shutdown(),
        this.databasePool.disconnect(),
        this.redisClient.disconnect()
      ]);

      this.initialized = false;

      logger.info('Infrastructure shutdown completed', {
        component: 'InfrastructureManager',
        uptime: Date.now() - this.startTime.getTime()
      });
    } catch (error) {
      logger.error('Error during infrastructure shutdown', {
        component: 'InfrastructureManager',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Check if infrastructure is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get infrastructure uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }
}

export default InfrastructureManager;

