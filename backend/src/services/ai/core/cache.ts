/**
 * AI Cache System
 * Redis-based caching for AI responses with intelligent invalidation
 */

import Redis from 'redis';
import { logger } from '@/config/logger';
import { IAiCache, CacheEntry, CacheKey } from '@/types/ai';

export interface AiCacheConfig {
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  ttl: number; // Default TTL in seconds
  maxSize: number; // Maximum number of entries
  keyPrefix: string;
  enableCompression: boolean;
}

/**
 * Redis-based AI Response Cache
 * Provides intelligent caching with compression and analytics
 */
export class AiCache implements IAiCache {
  private client: any;
  private config: AiCacheConfig;
  private isConnected = false;
  
  // In-memory fallback for when Redis is unavailable
  private memoryCache: Map<string, CacheEntry> = new Map();
  private useMemoryFallback = false;

  // Cache statistics
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    errors: 0,
    totalSize: 0
  };

  constructor(config: Partial<AiCacheConfig> = {}) {
    this.config = {
      redis: config.redis || {
        host: 'localhost',
        port: 6379
      },
      ttl: config.ttl || 3600, // 1 hour default
      maxSize: config.maxSize || 10000,
      keyPrefix: config.keyPrefix || 'ai_cache:',
      enableCompression: config.enableCompression || true,
      ...config
    };

    this.initializeRedis();
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    try {
      this.client = Redis.createClient({
        socket: {
          host: this.config.redis!.host,
          port: this.config.redis!.port,
        },
        password: this.config.redis!.password,
        database: this.config.redis!.db || 0,
      });

      this.client.on('connect', () => {
        logger.info('AI Cache Redis connected', { component: 'AiCache' });
        this.isConnected = true;
        this.useMemoryFallback = false;
      });

      this.client.on('error', (error: Error) => {
        logger.error('AI Cache Redis error', {
          component: 'AiCache',
          error: error.message
        });
        this.isConnected = false;
        this.useMemoryFallback = true;
        this.stats.errors++;
      });

      this.client.on('close', () => {
        logger.warn('AI Cache Redis connection closed', { component: 'AiCache' });
        this.isConnected = false;
        this.useMemoryFallback = true;
      });

      await this.client.connect();

    } catch (error) {
      logger.warn('Failed to initialize Redis, using memory cache fallback', {
        component: 'AiCache',
        error: error instanceof Error ? error.message : String(error)
      });
      this.useMemoryFallback = true;
    }
  }

  /**
   * Get cached entry
   */
  public async get(key: string): Promise<CacheEntry | null> {
    const fullKey = this.config.keyPrefix + key;
    
    try {
      let data: string | null = null;

      if (this.useMemoryFallback) {
        const entry = this.memoryCache.get(fullKey);
        if (entry) {
          // Check expiration
          if (entry.metadata.expiresAt > new Date()) {
            entry.metadata.accessCount++;
            entry.metadata.lastAccessed = new Date();
            this.stats.hits++;
            return entry;
          } else {
            // Expired entry
            this.memoryCache.delete(fullKey);
          }
        }
      } else if (this.isConnected) {
        data = await this.client.get(fullKey);
      }

      if (data) {
        const parsed = JSON.parse(data);
        const entry: CacheEntry = {
          key: fullKey,
          data: parsed.data,
          metadata: {
            ...parsed.metadata,
            createdAt: new Date(parsed.metadata.createdAt),
            expiresAt: new Date(parsed.metadata.expiresAt),
            lastAccessed: new Date()
          },
          tags: parsed.tags || []
        };

        // Update access count in background
        this.updateAccessCount(fullKey, entry.metadata.accessCount + 1);

        this.stats.hits++;
        return entry;
      }

      this.stats.misses++;
      return null;

    } catch (error) {
      logger.error('Cache get failed', {
        component: 'AiCache',
        key: fullKey,
        error: error instanceof Error ? error.message : String(error)
      });
      this.stats.errors++;
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set cache entry
   */
  public async set(
    key: string,
    data: any,
    ttl: number,
    metadata?: any
  ): Promise<void> {
    const fullKey = this.config.keyPrefix + key;
    
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);
      
      const entry: CacheEntry = {
        key: fullKey,
        data,
        metadata: {
          createdAt: now,
          expiresAt,
          accessCount: 0,
          lastAccessed: now,
          cost: metadata?.cost || 0,
          quality: metadata?.quality || 0,
          ...metadata
        },
        tags: metadata?.tags || []
      };

      const serialized = JSON.stringify(entry);

      if (this.useMemoryFallback) {
        // Memory cache management
        if (this.memoryCache.size >= this.config.maxSize) {
          this.evictLRUEntries();
        }
        this.memoryCache.set(fullKey, entry);
      } else if (this.isConnected) {
        await this.client.setex(fullKey, ttl, serialized);
      }

      this.stats.sets++;
      this.stats.totalSize = this.useMemoryFallback 
        ? this.memoryCache.size 
        : await this.getRedisSize();

      logger.debug('Cache entry set', {
        component: 'AiCache',
        key: fullKey,
        ttl,
        size: serialized.length
      });

    } catch (error) {
      logger.error('Cache set failed', {
        component: 'AiCache',
        key: fullKey,
        error: error instanceof Error ? error.message : String(error)
      });
      this.stats.errors++;
    }
  }

  /**
   * Invalidate cache entries by pattern
   */
  public async invalidate(pattern: string): Promise<void> {
    const fullPattern = this.config.keyPrefix + pattern;
    
    try {
      if (this.useMemoryFallback) {
        // Memory cache pattern matching
        const keysToDelete: string[] = [];
        for (const key of this.memoryCache.keys()) {
          if (this.matchPattern(key, fullPattern)) {
            keysToDelete.push(key);
          }
        }
        
        for (const key of keysToDelete) {
          this.memoryCache.delete(key);
        }
        
        logger.debug(`Invalidated ${keysToDelete.length} memory cache entries`, {
          component: 'AiCache',
          pattern: fullPattern
        });

      } else if (this.isConnected) {
        const keys = await this.client.keys(fullPattern);
        
        if (keys.length > 0) {
          await this.client.del(...keys);
          logger.debug(`Invalidated ${keys.length} Redis cache entries`, {
            component: 'AiCache',
            pattern: fullPattern
          });
        }
      }

    } catch (error) {
      logger.error('Cache invalidation failed', {
        component: 'AiCache',
        pattern: fullPattern,
        error: error instanceof Error ? error.message : String(error)
      });
      this.stats.errors++;
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{ 
    hits: number; 
    misses: number; 
    size: number;
    hitRate: number;
    errorRate: number;
  }> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const totalOperations = this.stats.hits + this.stats.misses + this.stats.sets;
    const errorRate = totalOperations > 0 ? this.stats.errors / totalOperations : 0;

    let currentSize = 0;
    if (this.useMemoryFallback) {
      currentSize = this.memoryCache.size;
    } else if (this.isConnected) {
      currentSize = await this.getRedisSize();
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: currentSize,
      hitRate,
      errorRate
    };
  }

  /**
   * Update access count for cache entry
   */
  private async updateAccessCount(key: string, count: number): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        const entry = this.memoryCache.get(key);
        if (entry) {
          entry.metadata.accessCount = count;
          entry.metadata.lastAccessed = new Date();
        }
      } else if (this.isConnected) {
        // Update access count in Redis (fire and forget)
        this.client.get(key).then((data: string | null) => {
          if (data) {
            const parsed = JSON.parse(data);
            parsed.metadata.accessCount = count;
            parsed.metadata.lastAccessed = new Date().toISOString();
            this.client.set(key, JSON.stringify(parsed));
          }
        }).catch(() => {
          // Ignore errors in background updates
        });
      }
    } catch (error) {
      // Ignore errors in background updates
    }
  }

  /**
   * Evict least recently used entries from memory cache
   */
  private evictLRUEntries(): void {
    const entries = Array.from(this.memoryCache.entries());
    
    // Sort by last accessed (oldest first)
    entries.sort(([, a], [, b]) => 
      a.metadata.lastAccessed.getTime() - b.metadata.lastAccessed.getTime()
    );

    // Remove oldest 20% of entries
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }

    logger.debug(`Evicted ${toRemove} LRU entries from memory cache`, {
      component: 'AiCache'
    });
  }

  /**
   * Get Redis cache size
   */
  private async getRedisSize(): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      const keys = await this.client.keys(this.config.keyPrefix + '*');
      return keys.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Simple pattern matching for cache invalidation
   */
  private matchPattern(key: string, pattern: string): boolean {
    // Convert pattern to regex (support * wildcards)
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    
    const regex = new RegExp('^' + regexPattern + '$');
    return regex.test(key);
  }

  /**
   * Clear all cache entries
   */
  public async clear(): Promise<void> {
    try {
      if (this.useMemoryFallback) {
        this.memoryCache.clear();
      } else if (this.isConnected) {
        const keys = await this.client.keys(this.config.keyPrefix + '*');
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      }

      // Reset stats
      this.stats.hits = 0;
      this.stats.misses = 0;
      this.stats.sets = 0;
      this.stats.totalSize = 0;

      logger.info('AI Cache cleared', { component: 'AiCache' });

    } catch (error) {
      logger.error('Cache clear failed', {
        component: 'AiCache',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Close cache connections
   */
  public async close(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
      }
      this.memoryCache.clear();
      this.isConnected = false;
      
      logger.info('AI Cache closed', { component: 'AiCache' });
    } catch (error) {
      logger.error('Cache close failed', {
        component: 'AiCache',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default AiCache;
