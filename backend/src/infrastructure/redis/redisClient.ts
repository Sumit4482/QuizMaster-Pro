import Redis from 'ioredis';
import { logger } from '../../utils/logger';

class RedisClient {
  private static instance: RedisClient;
  public client: Redis;
  public publishClient: Redis;
  public subscribeClient: Redis;

  private constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      retryDelayOnCluster: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000
    };

    // Main Redis client for general operations
    this.client = new Redis(redisConfig);

    // Dedicated clients for pub/sub to avoid blocking
    this.publishClient = new Redis({
      ...redisConfig,
      lazyConnect: true
    });

    this.subscribeClient = new Redis({
      ...redisConfig,
      lazyConnect: true
    });

    this.setupEventHandlers();
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  private setupEventHandlers(): void {
    // Main client events
    this.client.on('connect', () => {
      logger.info('Redis client connected', { component: 'RedisClient', clientType: 'main' });
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready', { component: 'RedisClient', clientType: 'main' });
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', {
        component: 'RedisClient',
        clientType: 'main',
        error: error.message
      });
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed', { component: 'RedisClient', clientType: 'main' });
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting', { component: 'RedisClient', clientType: 'main' });
    });

    // Publish client events
    this.publishClient.on('connect', () => {
      logger.info('Redis publish client connected', { component: 'RedisClient', clientType: 'publish' });
    });

    this.publishClient.on('error', (error) => {
      logger.error('Redis publish client error', {
        component: 'RedisClient',
        clientType: 'publish',
        error: error.message
      });
    });

    // Subscribe client events
    this.subscribeClient.on('connect', () => {
      logger.info('Redis subscribe client connected', { component: 'RedisClient', clientType: 'subscribe' });
    });

    this.subscribeClient.on('error', (error) => {
      logger.error('Redis subscribe client error', {
        component: 'RedisClient',
        clientType: 'subscribe',
        error: error.message
      });
    });
  }

  /**
   * Connect all Redis clients
   */
  public async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.publishClient.connect(),
        this.subscribeClient.connect()
      ]);

      logger.info('All Redis clients connected successfully', { component: 'RedisClient' });
    } catch (error) {
      logger.error('Failed to connect Redis clients', {
        component: 'RedisClient',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Disconnect all Redis clients
   */
  public async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.client.disconnect(),
        this.publishClient.disconnect(),
        this.subscribeClient.disconnect()
      ]);

      logger.info('All Redis clients disconnected', { component: 'RedisClient' });
    } catch (error) {
      logger.error('Error disconnecting Redis clients', {
        component: 'RedisClient',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Health check for Redis connectivity
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    memory: any;
    info: any;
  }> {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;

      const [memory, info] = await Promise.all([
        this.client.memory('usage'),
        this.client.info('memory')
      ]);

      return {
        status: 'healthy',
        latency,
        memory,
        info
      };
    } catch (error) {
      logger.error('Redis health check failed', {
        component: 'RedisClient',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        latency: -1,
        memory: null,
        info: null
      };
    }
  }

  /**
   * Get Redis client statistics
   */
  public async getStats(): Promise<{
    connectedClients: number;
    usedMemory: string;
    totalCommands: string;
    instantaneousOps: string;
    keyspaceHits: string;
    keyspaceMisses: string;
  }> {
    try {
      const info = await this.client.info('stats');
      const lines = info.split('\r\n');
      const stats: any = {};

      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          stats[key] = value;
        }
      });

      return {
        connectedClients: parseInt(stats.connected_clients || '0'),
        usedMemory: stats.used_memory_human || '0B',
        totalCommands: stats.total_commands_processed || '0',
        instantaneousOps: stats.instantaneous_ops_per_sec || '0',
        keyspaceHits: stats.keyspace_hits || '0',
        keyspaceMisses: stats.keyspace_misses || '0'
      };
    } catch (error) {
      logger.error('Failed to get Redis stats', {
        component: 'RedisClient',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

export default RedisClient;

