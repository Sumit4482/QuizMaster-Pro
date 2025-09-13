import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface DatabaseConfig {
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
}

export interface ConnectionStats {
  primary: {
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    queriesExecuted: number;
    averageQueryTime: number;
    slowQueries: number;
  };
  replicas: Array<{
    id: string;
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    queriesExecuted: number;
    averageQueryTime: number;
    healthy: boolean;
  }>;
  totalQueries: number;
  totalErrors: number;
  uptime: number;
}

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  replica?: boolean;
  error?: string;
}

export class DatabaseConnectionPool {
  private static instance: DatabaseConnectionPool;
  private primaryClient: PrismaClient;
  private replicaClients: PrismaClient[] = [];
  private replicaWeights: number[] = [];
  private currentReplicaIndex = 0;
  private stats: ConnectionStats;
  private queryMetrics: QueryMetrics[] = [];
  private startTime: Date;

  private constructor(private config: DatabaseConfig) {
    this.startTime = new Date();
    this.initializeClients();
    this.initializeStats();
    this.setupQueryLogging();
  }

  public static getInstance(config?: DatabaseConfig): DatabaseConnectionPool {
    if (!DatabaseConnectionPool.instance) {
      if (!config) {
        throw new Error('Database configuration is required for first initialization');
      }
      DatabaseConnectionPool.instance = new DatabaseConnectionPool(config);
    }
    return DatabaseConnectionPool.instance;
  }

  /**
   * Initialize Prisma clients for primary and replica databases
   */
  private initializeClients(): void {
    // Primary database client
    this.primaryClient = new PrismaClient({
      datasources: {
        db: {
          url: this.config.primary.url
        }
      },
      log: this.config.queryLogging ? ['query', 'info', 'warn', 'error'] : ['error']
    });

    // Replica database clients
    if (this.config.replicas) {
      this.config.replicas.forEach((replica, index) => {
        const replicaClient = new PrismaClient({
          datasources: {
            db: {
              url: replica.url
            }
          },
          log: this.config.queryLogging ? ['query', 'info', 'warn', 'error'] : ['error']
        });

        this.replicaClients.push(replicaClient);
        this.replicaWeights.push(replica.weight);
      });
    }

    logger.info('Database connection pool initialized', {
      component: 'DatabaseConnectionPool',
      primaryUrl: this.maskConnectionString(this.config.primary.url),
      replicaCount: this.replicaClients.length
    });
  }

  /**
   * Initialize connection statistics
   */
  private initializeStats(): void {
    this.stats = {
      primary: {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        queriesExecuted: 0,
        averageQueryTime: 0,
        slowQueries: 0
      },
      replicas: this.replicaClients.map((_, index) => ({
        id: `replica-${index}`,
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        queriesExecuted: 0,
        averageQueryTime: 0,
        healthy: true
      })),
      totalQueries: 0,
      totalErrors: 0,
      uptime: 0
    };
  }

  /**
   * Setup query logging and metrics collection
   */
  private setupQueryLogging(): void {
    if (!this.config.queryLogging) return;

    // Primary client logging
    this.primaryClient.$on('query', (event: any) => {
      this.recordQueryMetrics(event, false);
    });

    // Replica clients logging
    this.replicaClients.forEach((client, index) => {
      client.$on('query', (event: any) => {
        this.recordQueryMetrics(event, true, index);
      });
    });
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(event: any, isReplica: boolean, replicaIndex?: number): void {
    const duration = event.duration;
    const query = event.query;
    
    const metrics: QueryMetrics = {
      query: query.substring(0, 200), // Truncate long queries
      duration,
      timestamp: new Date(),
      success: true,
      replica: isReplica
    };

    this.queryMetrics.push(metrics);
    
    // Keep only last 1000 queries
    if (this.queryMetrics.length > 1000) {
      this.queryMetrics.shift();
    }

    // Update statistics
    if (isReplica && replicaIndex !== undefined) {
      const replica = this.stats.replicas[replicaIndex];
      replica.queriesExecuted++;
      replica.averageQueryTime = (replica.averageQueryTime + duration) / 2;
    } else {
      this.stats.primary.queriesExecuted++;
      this.stats.primary.averageQueryTime = (this.stats.primary.averageQueryTime + duration) / 2;
      
      if (duration > this.config.slowQueryThreshold) {
        this.stats.primary.slowQueries++;
        logger.warn('Slow query detected', {
          component: 'DatabaseConnectionPool',
          query: query.substring(0, 100),
          duration,
          threshold: this.config.slowQueryThreshold
        });
      }
    }

    this.stats.totalQueries++;
  }

  /**
   * Get primary database client
   */
  getPrimaryClient(): PrismaClient {
    return this.primaryClient;
  }

  /**
   * Get read replica client using load balancing
   */
  getReplicaClient(): PrismaClient {
    if (this.replicaClients.length === 0) {
      return this.primaryClient; // Fallback to primary
    }

    // Weighted round-robin selection
    if (this.replicaWeights.length > 0) {
      const totalWeight = this.replicaWeights.reduce((sum, weight) => sum + weight, 0);
      let randomWeight = Math.random() * totalWeight;
      
      for (let i = 0; i < this.replicaWeights.length; i++) {
        randomWeight -= this.replicaWeights[i];
        if (randomWeight <= 0 && this.stats.replicas[i].healthy) {
          return this.replicaClients[i];
        }
      }
    }

    // Simple round-robin fallback
    const healthyReplicas = this.replicaClients.filter((_, index) => 
      this.stats.replicas[index].healthy
    );

    if (healthyReplicas.length === 0) {
      return this.primaryClient; // All replicas unhealthy
    }

    const replica = healthyReplicas[this.currentReplicaIndex % healthyReplicas.length];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % healthyReplicas.length;
    
    return replica;
  }

  /**
   * Execute a read query on replica with fallback to primary
   */
  async executeReadQuery<T>(queryFn: (client: PrismaClient) => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.retryAttempts) {
      try {
        const client = attempts === 0 ? this.getReplicaClient() : this.primaryClient;
        const result = await queryFn(client);
        
        const duration = Date.now() - startTime;
        this.recordSuccessfulQuery(duration, attempts > 0);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        attempts++;
        this.stats.totalErrors++;

        logger.warn(`Database query attempt ${attempts} failed`, {
          component: 'DatabaseConnectionPool',
          error: lastError.message,
          attempts,
          maxAttempts: this.config.retryAttempts
        });

        if (attempts < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempts);
        }
      }
    }

    // All attempts failed
    logger.error('Database query failed after all retries', {
      component: 'DatabaseConnectionPool',
      error: lastError?.message,
      totalAttempts: attempts
    });

    throw lastError;
  }

  /**
   * Execute a write query on primary database
   */
  async executeWriteQuery<T>(queryFn: (client: PrismaClient) => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.retryAttempts) {
      try {
        const result = await queryFn(this.primaryClient);
        
        const duration = Date.now() - startTime;
        this.recordSuccessfulQuery(duration, false);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        attempts++;
        this.stats.totalErrors++;

        logger.warn(`Database write attempt ${attempts} failed`, {
          component: 'DatabaseConnectionPool',
          error: lastError.message,
          attempts,
          maxAttempts: this.config.retryAttempts
        });

        if (attempts < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempts);
        }
      }
    }

    logger.error('Database write failed after all retries', {
      component: 'DatabaseConnectionPool',
      error: lastError?.message,
      totalAttempts: attempts
    });

    throw lastError;
  }

  /**
   * Record successful query metrics
   */
  private recordSuccessfulQuery(duration: number, usedPrimary: boolean): void {
    if (usedPrimary) {
      this.stats.primary.queriesExecuted++;
      this.stats.primary.averageQueryTime = 
        (this.stats.primary.averageQueryTime + duration) / 2;
    }
    
    this.stats.totalQueries++;
  }

  /**
   * Health check for all database connections
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    primary: 'connected' | 'disconnected';
    replicas: Array<{ id: string; status: 'connected' | 'disconnected' }>;
    latency: {
      primary: number;
      replicas: Array<{ id: string; latency: number }>;
    };
  }> {
    const results = {
      status: 'healthy' as 'healthy' | 'unhealthy',
      primary: 'disconnected' as 'connected' | 'disconnected',
      replicas: [] as Array<{ id: string; status: 'connected' | 'disconnected' }>,
      latency: {
        primary: -1,
        replicas: [] as Array<{ id: string; latency: number }>
      }
    };

    // Test primary connection
    try {
      const startTime = Date.now();
      await this.primaryClient.$queryRaw`SELECT 1`;
      results.primary = 'connected';
      results.latency.primary = Date.now() - startTime;
    } catch (error) {
      results.primary = 'disconnected';
      results.status = 'unhealthy';
      logger.error('Primary database health check failed', {
        component: 'DatabaseConnectionPool',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Test replica connections
    for (let i = 0; i < this.replicaClients.length; i++) {
      const replicaId = `replica-${i}`;
      
      try {
        const startTime = Date.now();
        await this.replicaClients[i].$queryRaw`SELECT 1`;
        
        results.replicas.push({ id: replicaId, status: 'connected' });
        results.latency.replicas.push({ 
          id: replicaId, 
          latency: Date.now() - startTime 
        });
        this.stats.replicas[i].healthy = true;
      } catch (error) {
        results.replicas.push({ id: replicaId, status: 'disconnected' });
        results.latency.replicas.push({ id: replicaId, latency: -1 });
        this.stats.replicas[i].healthy = false;
        
        logger.error(`Replica ${replicaId} health check failed`, {
          component: 'DatabaseConnectionPool',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionStats {
    this.stats.uptime = Date.now() - this.startTime.getTime();
    return { ...this.stats };
  }

  /**
   * Get recent query metrics
   */
  getRecentQueries(limit: number = 100): QueryMetrics[] {
    return this.queryMetrics.slice(-limit);
  }

  /**
   * Get slow queries
   */
  getSlowQueries(limit: number = 50): QueryMetrics[] {
    return this.queryMetrics
      .filter(metric => metric.duration > this.config.slowQueryThreshold)
      .slice(-limit);
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.initializeStats();
    this.queryMetrics = [];
    this.startTime = new Date();
    
    logger.info('Database connection pool statistics reset', {
      component: 'DatabaseConnectionPool'
    });
  }

  /**
   * Graceful disconnect from all databases
   */
  async disconnect(): Promise<void> {
    try {
      logger.info('Disconnecting from all databases', {
        component: 'DatabaseConnectionPool'
      });

      // Disconnect primary
      await this.primaryClient.$disconnect();

      // Disconnect replicas
      await Promise.all(
        this.replicaClients.map(client => client.$disconnect())
      );

      logger.info('All database connections closed', {
        component: 'DatabaseConnectionPool'
      });
    } catch (error) {
      logger.error('Error disconnecting from databases', {
        component: 'DatabaseConnectionPool',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Utility method to mask connection string for logging
   */
  private maskConnectionString(url: string): string {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default DatabaseConnectionPool;

