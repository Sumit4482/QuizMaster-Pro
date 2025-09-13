import RedisClient from '../redis/redisClient';
import { logger } from '../../utils/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
  compress?: boolean;
  serialize?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: string;
}

export class CacheService {
  private redis: RedisClient;
  private defaultTTL: number = 3600; // 1 hour
  private stats = {
    hits: 0,
    misses: 0
  };

  constructor() {
    this.redis = RedisClient.getInstance();
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    try {
      const {
        ttl = this.defaultTTL,
        namespace = 'default',
        compress = false,
        serialize = true
      } = options;

      const fullKey = this.buildKey(key, namespace);
      let processedValue = value;

      if (serialize && typeof value !== 'string') {
        processedValue = JSON.stringify(value);
      }

      if (compress && typeof processedValue === 'string') {
        // Could implement compression here if needed
        // processedValue = await this.compress(processedValue);
      }

      const result = await this.redis.client.setex(fullKey, ttl, processedValue);

      logger.debug('Cache set', {
        component: 'CacheService',
        key: fullKey,
        ttl,
        valueType: typeof value,
        success: result === 'OK'
      });

      return result === 'OK';
    } catch (error) {
      logger.error('Cache set failed', {
        component: 'CacheService',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const {
        namespace = 'default',
        serialize = true
      } = options;

      const fullKey = this.buildKey(key, namespace);
      const value = await this.redis.client.get(fullKey);

      if (value === null) {
        this.stats.misses++;
        logger.debug('Cache miss', {
          component: 'CacheService',
          key: fullKey
        });
        return null;
      }

      this.stats.hits++;
      let processedValue = value;

      if (serialize) {
        try {
          processedValue = JSON.parse(value);
        } catch {
          // If parsing fails, return the raw value
          processedValue = value;
        }
      }

      logger.debug('Cache hit', {
        component: 'CacheService',
        key: fullKey,
        valueType: typeof processedValue
      });

      return processedValue as T;
    } catch (error) {
      this.stats.misses++;
      logger.error('Cache get failed', {
        component: 'CacheService',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string, namespace: string = 'default'): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, namespace);
      const result = await this.redis.client.del(fullKey);

      logger.debug('Cache delete', {
        component: 'CacheService',
        key: fullKey,
        deleted: result > 0
      });

      return result > 0;
    } catch (error) {
      logger.error('Cache delete failed', {
        component: 'CacheService',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string, namespace: string = 'default'): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, namespace);
      const result = await this.redis.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists check failed', {
        component: 'CacheService',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string, namespace: string = 'default'): Promise<number> {
    try {
      const fullKey = this.buildKey(key, namespace);
      return await this.redis.client.ttl(fullKey);
    } catch (error) {
      logger.error('Cache TTL check failed', {
        component: 'CacheService',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return -1;
    }
  }

  /**
   * Extend TTL for a key
   */
  async expire(key: string, ttl: number, namespace: string = 'default'): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, namespace);
      const result = await this.redis.client.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire failed', {
        component: 'CacheService',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Clear all keys in a namespace
   */
  async clearNamespace(namespace: string): Promise<number> {
    try {
      const pattern = `${namespace}:*`;
      const keys = await this.redis.client.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.client.del(...keys);

      logger.info('Cache namespace cleared', {
        component: 'CacheService',
        namespace,
        keysCleared: result
      });

      return result;
    } catch (error) {
      logger.error('Cache namespace clear failed', {
        component: 'CacheService',
        namespace,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const redisStats = await this.redis.getStats();
      const totalRequests = this.stats.hits + this.stats.misses;
      
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
        totalKeys: parseInt(redisStats.totalCommands) || 0,
        memoryUsage: redisStats.usedMemory
      };
    } catch (error) {
      logger.error('Failed to get cache stats', {
        component: 'CacheService',
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: 0,
        totalKeys: 0,
        memoryUsage: '0B'
      };
    }
  }

  /**
   * Specialized methods for common use cases
   */

  // Session caching
  async setSession(sessionId: string, sessionData: any, ttl: number = 86400): Promise<boolean> {
    return this.set(sessionId, sessionData, { namespace: 'session', ttl });
  }

  async getSession<T = any>(sessionId: string): Promise<T | null> {
    return this.get<T>(sessionId, { namespace: 'session' });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.del(sessionId, 'session');
  }

  // Game state caching
  async setGameState(gameId: string, gameState: any, ttl: number = 7200): Promise<boolean> {
    return this.set(gameId, gameState, { namespace: 'game', ttl });
  }

  async getGameState<T = any>(gameId: string): Promise<T | null> {
    return this.get<T>(gameId, { namespace: 'game' });
  }

  async deleteGameState(gameId: string): Promise<boolean> {
    return this.del(gameId, 'game');
  }

  // Query result caching
  async setQueryResult(queryHash: string, result: any, ttl: number = 1800): Promise<boolean> {
    return this.set(queryHash, result, { namespace: 'query', ttl });
  }

  async getQueryResult<T = any>(queryHash: string): Promise<T | null> {
    return this.get<T>(queryHash, { namespace: 'query' });
  }

  // User data caching
  async setUserData(userId: string, userData: any, ttl: number = 3600): Promise<boolean> {
    return this.set(userId, userData, { namespace: 'user', ttl });
  }

  async getUserData<T = any>(userId: string): Promise<T | null> {
    return this.get<T>(userId, { namespace: 'user' });
  }

  async deleteUserData(userId: string): Promise<boolean> {
    return this.del(userId, 'user');
  }

  // AI response caching
  async setAiResponse(promptHash: string, response: any, ttl: number = 86400): Promise<boolean> {
    return this.set(promptHash, response, { namespace: 'ai', ttl });
  }

  async getAiResponse<T = any>(promptHash: string): Promise<T | null> {
    return this.get<T>(promptHash, { namespace: 'ai' });
  }

  /**
   * Build full cache key with namespace
   */
  private buildKey(key: string, namespace: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Cache-aside pattern implementation
   */
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // If not in cache, fetch the data
    try {
      const data = await fetchFunction();
      
      // Store in cache for next time
      await this.set(key, data, options);
      
      return data;
    } catch (error) {
      logger.error('Cache-aside fetch function failed', {
        component: 'CacheService',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Batch operations
   */
  async mget(keys: string[], namespace: string = 'default'): Promise<(any | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key, namespace));
      const values = await this.redis.client.mget(...fullKeys);
      
      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        
        this.stats.hits++;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      logger.error('Cache mget failed', {
        component: 'CacheService',
        keys,
        error: error instanceof Error ? error.message : String(error)
      });
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Array<[string, any]>, options: CacheOptions = {}): Promise<boolean> {
    try {
      const { ttl = this.defaultTTL, namespace = 'default' } = options;
      
      const pipeline = this.redis.client.pipeline();
      
      keyValuePairs.forEach(([key, value]) => {
        const fullKey = this.buildKey(key, namespace);
        const processedValue = typeof value === 'string' ? value : JSON.stringify(value);
        pipeline.setex(fullKey, ttl, processedValue);
      });
      
      const results = await pipeline.exec();
      
      return results?.every(result => result && result[1] === 'OK') ?? false;
    } catch (error) {
      logger.error('Cache mset failed', {
        component: 'CacheService',
        keyCount: keyValuePairs.length,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}

export default CacheService;

