import { CacheService } from '../infrastructure/cache/cacheService';
import { CDNService } from '../infrastructure/cdn/cdnService';
import { logger } from '../utils/logger';

export interface CacheLayer {
  name: string;
  ttl: number;
  enabled: boolean;
  priority: number;
}

export interface CacheStrategy {
  key: string;
  layers: CacheLayer[];
  refreshThreshold: number; // Percentage of TTL after which to refresh
  fallbackEnabled: boolean;
}

export interface CacheMetrics {
  totalRequests: number;
  hits: number;
  misses: number;
  hitRate: number;
  layerStats: {
    [layerName: string]: {
      hits: number;
      misses: number;
      hitRate: number;
      averageResponseTime: number;
    };
  };
}

export interface CacheConfig {
  enableInMemory: boolean;
  enableRedis: boolean;
  enableCDN: boolean;
  inMemorySize: number; // Max items in memory
  defaultTTL: number;
  refreshConcurrency: number;
  compressionThreshold: number; // Size threshold for compression
}

export class CachingStrategy {
  private cacheService: CacheService;
  private cdnService: CDNService;
  private inMemoryCache: Map<string, { data: any; expiry: number; hits: number }> = new Map();
  private cacheStrategies: Map<string, CacheStrategy> = new Map();
  private metrics: Map<string, CacheMetrics> = new Map();
  private refreshQueue: Set<string> = new Set();
  private config: CacheConfig;

  constructor(config: CacheConfig, cacheService: CacheService, cdnService: CDNService) {
    this.config = config;
    this.cacheService = cacheService;
    this.cdnService = cdnService;
    
    this.initializeCacheStrategies();
    this.startCleanupInterval();

    logger.info('Multi-level caching strategy initialized', {
      component: 'CachingStrategy',
      config: {
        inMemory: config.enableInMemory,
        redis: config.enableRedis,
        cdn: config.enableCDN,
        inMemorySize: config.inMemorySize
      }
    });
  }

  /**
   * Initialize predefined cache strategies
   */
  private initializeCacheStrategies(): void {
    // User data strategy
    this.cacheStrategies.set('user', {
      key: 'user',
      layers: [
        { name: 'memory', ttl: 300, enabled: this.config.enableInMemory, priority: 1 },
        { name: 'redis', ttl: 3600, enabled: this.config.enableRedis, priority: 2 }
      ],
      refreshThreshold: 80,
      fallbackEnabled: true
    });

    // Question data strategy
    this.cacheStrategies.set('question', {
      key: 'question',
      layers: [
        { name: 'memory', ttl: 600, enabled: this.config.enableInMemory, priority: 1 },
        { name: 'redis', ttl: 7200, enabled: this.config.enableRedis, priority: 2 },
        { name: 'cdn', ttl: 86400, enabled: this.config.enableCDN, priority: 3 }
      ],
      refreshThreshold: 75,
      fallbackEnabled: true
    });

    // Game state strategy
    this.cacheStrategies.set('game', {
      key: 'game',
      layers: [
        { name: 'memory', ttl: 60, enabled: this.config.enableInMemory, priority: 1 },
        { name: 'redis', ttl: 1800, enabled: this.config.enableRedis, priority: 2 }
      ],
      refreshThreshold: 90,
      fallbackEnabled: true
    });

    // Session strategy
    this.cacheStrategies.set('session', {
      key: 'session',
      layers: [
        { name: 'memory', ttl: 300, enabled: this.config.enableInMemory, priority: 1 },
        { name: 'redis', ttl: 86400, enabled: this.config.enableRedis, priority: 2 }
      ],
      refreshThreshold: 85,
      fallbackEnabled: false
    });

    // API response strategy
    this.cacheStrategies.set('api', {
      key: 'api',
      layers: [
        { name: 'memory', ttl: 60, enabled: this.config.enableInMemory, priority: 1 },
        { name: 'redis', ttl: 300, enabled: this.config.enableRedis, priority: 2 },
        { name: 'cdn', ttl: 3600, enabled: this.config.enableCDN, priority: 3 }
      ],
      refreshThreshold: 70,
      fallbackEnabled: true
    });

    // AI response strategy (expensive to generate)
    this.cacheStrategies.set('ai', {
      key: 'ai',
      layers: [
        { name: 'memory', ttl: 1800, enabled: this.config.enableInMemory, priority: 1 },
        { name: 'redis', ttl: 86400, enabled: this.config.enableRedis, priority: 2 },
        { name: 'cdn', ttl: 604800, enabled: this.config.enableCDN, priority: 3 }
      ],
      refreshThreshold: 60,
      fallbackEnabled: true
    });

    // Static assets strategy
    this.cacheStrategies.set('asset', {
      key: 'asset',
      layers: [
        { name: 'cdn', ttl: 2592000, enabled: this.config.enableCDN, priority: 1 } // 30 days
      ],
      refreshThreshold: 50,
      fallbackEnabled: false
    });

    logger.info('Cache strategies initialized', {
      component: 'CachingStrategy',
      strategies: Array.from(this.cacheStrategies.keys())
    });
  }

  /**
   * Get data with multi-level caching
   */
  async get<T>(strategyName: string, key: string, fallbackFn?: () => Promise<T>): Promise<T | null> {
    const strategy = this.cacheStrategies.get(strategyName);
    if (!strategy) {
      logger.error('Unknown cache strategy', {
        component: 'CachingStrategy',
        strategy: strategyName
      });
      return fallbackFn ? await fallbackFn() : null;
    }

    const fullKey = `${strategy.key}:${key}`;
    const startTime = Date.now();

    // Initialize metrics if not exists
    if (!this.metrics.has(strategyName)) {
      this.initializeMetrics(strategyName);
    }

    // Try each cache layer in priority order
    const sortedLayers = strategy.layers
      .filter(layer => layer.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const layer of sortedLayers) {
      try {
        const result = await this.getFromLayer<T>(layer.name, fullKey);
        
        if (result !== null) {
          // Cache hit
          this.recordHit(strategyName, layer.name, Date.now() - startTime);
          
          // Backfill higher priority layers
          await this.backfillLayers(strategy, fullKey, result, layer.priority);
          
          // Check if refresh is needed
          await this.checkRefreshThreshold(strategy, fullKey, layer, fallbackFn);
          
          return result;
        }
      } catch (error) {
        logger.warn('Cache layer error', {
          component: 'CachingStrategy',
          layer: layer.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Cache miss - try fallback
    this.recordMiss(strategyName, Date.now() - startTime);
    
    if (fallbackFn) {
      try {
        const result = await fallbackFn();
        if (result !== null) {
          // Store in all enabled layers
          await this.setInAllLayers(strategy, fullKey, result);
        }
        return result;
      } catch (error) {
        logger.error('Fallback function failed', {
          component: 'CachingStrategy',
          strategy: strategyName,
          key,
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }
    }

    return null;
  }

  /**
   * Set data in cache with strategy
   */
  async set(strategyName: string, key: string, data: any, customTTL?: number): Promise<boolean> {
    const strategy = this.cacheStrategies.get(strategyName);
    if (!strategy) {
      logger.error('Unknown cache strategy', {
        component: 'CachingStrategy',
        strategy: strategyName
      });
      return false;
    }

    const fullKey = `${strategy.key}:${key}`;
    return await this.setInAllLayers(strategy, fullKey, data, customTTL);
  }

  /**
   * Delete data from all cache layers
   */
  async delete(strategyName: string, key: string): Promise<boolean> {
    const strategy = this.cacheStrategies.get(strategyName);
    if (!strategy) {
      return false;
    }

    const fullKey = `${strategy.key}:${key}`;
    let success = true;

    // Delete from all layers
    for (const layer of strategy.layers.filter(l => l.enabled)) {
      try {
        await this.deleteFromLayer(layer.name, fullKey);
      } catch (error) {
        success = false;
        logger.error('Failed to delete from cache layer', {
          component: 'CachingStrategy',
          layer: layer.name,
          key: fullKey,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return success;
  }

  /**
   * Get data from specific cache layer
   */
  private async getFromLayer<T>(layerName: string, key: string): Promise<T | null> {
    switch (layerName) {
      case 'memory':
        return this.getFromMemory<T>(key);
      
      case 'redis':
        return await this.cacheService.get<T>(key);
      
      case 'cdn':
        // CDN typically stores static assets, not data
        return null;
      
      default:
        return null;
    }
  }

  /**
   * Set data in specific cache layer
   */
  private async setInLayer(layerName: string, key: string, data: any, ttl: number): Promise<boolean> {
    switch (layerName) {
      case 'memory':
        return this.setInMemory(key, data, ttl);
      
      case 'redis':
        return await this.cacheService.set(key, data, { ttl });
      
      case 'cdn':
        // CDN is handled separately for static assets
        return true;
      
      default:
        return false;
    }
  }

  /**
   * Delete data from specific cache layer
   */
  private async deleteFromLayer(layerName: string, key: string): Promise<boolean> {
    switch (layerName) {
      case 'memory':
        return this.deleteFromMemory(key);
      
      case 'redis':
        return await this.cacheService.del(key);
      
      case 'cdn':
        // CDN purging would be handled separately
        return true;
      
      default:
        return false;
    }
  }

  /**
   * In-memory cache operations
   */
  private getFromMemory<T>(key: string): T | null {
    const entry = this.inMemoryCache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiry) {
      this.inMemoryCache.delete(key);
      return null;
    }
    
    entry.hits++;
    return entry.data as T;
  }

  private setInMemory(key: string, data: any, ttl: number): boolean {
    try {
      // Check memory limit
      if (this.inMemoryCache.size >= this.config.inMemorySize) {
        this.evictLRU();
      }
      
      const expiry = Date.now() + (ttl * 1000);
      this.inMemoryCache.set(key, { data, expiry, hits: 0 });
      
      return true;
    } catch (error) {
      logger.error('Failed to set in memory cache', {
        component: 'CachingStrategy',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  private deleteFromMemory(key: string): boolean {
    return this.inMemoryCache.delete(key);
  }

  /**
   * Evict least recently used items from memory
   */
  private evictLRU(): void {
    // Simple LRU: remove items with lowest hit count
    const entries = Array.from(this.inMemoryCache.entries());
    entries.sort((a, b) => a[1].hits - b[1].hits);
    
    const toRemove = Math.floor(this.config.inMemorySize * 0.1); // Remove 10%
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.inMemoryCache.delete(entries[i][0]);
    }
  }

  /**
   * Set data in all enabled layers
   */
  private async setInAllLayers(strategy: CacheStrategy, key: string, data: any, customTTL?: number): Promise<boolean> {
    let success = true;
    
    const enabledLayers = strategy.layers.filter(layer => layer.enabled);
    
    for (const layer of enabledLayers) {
      try {
        const ttl = customTTL || layer.ttl;
        await this.setInLayer(layer.name, key, data, ttl);
      } catch (error) {
        success = false;
        logger.error('Failed to set in cache layer', {
          component: 'CachingStrategy',
          layer: layer.name,
          key,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return success;
  }

  /**
   * Backfill higher priority cache layers
   */
  private async backfillLayers(strategy: CacheStrategy, key: string, data: any, foundPriority: number): Promise<void> {
    const higherPriorityLayers = strategy.layers
      .filter(layer => layer.enabled && layer.priority < foundPriority);
    
    for (const layer of higherPriorityLayers) {
      try {
        await this.setInLayer(layer.name, key, data, layer.ttl);
      } catch (error) {
        logger.warn('Failed to backfill cache layer', {
          component: 'CachingStrategy',
          layer: layer.name,
          key,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Check if cache refresh is needed based on threshold
   */
  private async checkRefreshThreshold<T>(
    strategy: CacheStrategy, 
    key: string, 
    layer: CacheLayer, 
    fallbackFn?: () => Promise<T>
  ): Promise<void> {
    if (!fallbackFn || this.refreshQueue.has(key)) {
      return;
    }

    try {
      // Get TTL of the item
      const remainingTTL = await this.getRemainingTTL(layer.name, key);
      
      if (remainingTTL > 0) {
        const refreshPoint = layer.ttl * (strategy.refreshThreshold / 100);
        const elapsed = layer.ttl - remainingTTL;
        
        if (elapsed >= refreshPoint) {
          // Schedule background refresh
          this.refreshQueue.add(key);
          
          setImmediate(async () => {
            try {
              const newData = await fallbackFn();
              if (newData !== null) {
                await this.setInAllLayers(strategy, key, newData);
              }
            } catch (error) {
              logger.error('Background refresh failed', {
                component: 'CachingStrategy',
                key,
                error: error instanceof Error ? error.message : String(error)
              });
            } finally {
              this.refreshQueue.delete(key);
            }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check refresh threshold', {
        component: 'CachingStrategy',
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get remaining TTL for a cached item
   */
  private async getRemainingTTL(layerName: string, key: string): Promise<number> {
    switch (layerName) {
      case 'memory':
        const entry = this.inMemoryCache.get(key);
        return entry ? Math.max(0, entry.expiry - Date.now()) / 1000 : 0;
      
      case 'redis':
        return await this.cacheService.ttl(key);
      
      default:
        return 0;
    }
  }

  /**
   * Initialize metrics for a strategy
   */
  private initializeMetrics(strategyName: string): void {
    const strategy = this.cacheStrategies.get(strategyName);
    if (!strategy) return;

    const layerStats: any = {};
    strategy.layers.forEach(layer => {
      layerStats[layer.name] = {
        hits: 0,
        misses: 0,
        hitRate: 0,
        averageResponseTime: 0
      };
    });

    this.metrics.set(strategyName, {
      totalRequests: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      layerStats
    });
  }

  /**
   * Record cache hit
   */
  private recordHit(strategyName: string, layerName: string, responseTime: number): void {
    const metrics = this.metrics.get(strategyName);
    if (!metrics) return;

    metrics.totalRequests++;
    metrics.hits++;
    metrics.hitRate = (metrics.hits / metrics.totalRequests) * 100;

    if (metrics.layerStats[layerName]) {
      const layerStats = metrics.layerStats[layerName];
      layerStats.hits++;
      layerStats.hitRate = (layerStats.hits / (layerStats.hits + layerStats.misses)) * 100;
      layerStats.averageResponseTime = (layerStats.averageResponseTime + responseTime) / 2;
    }
  }

  /**
   * Record cache miss
   */
  private recordMiss(strategyName: string, responseTime: number): void {
    const metrics = this.metrics.get(strategyName);
    if (!metrics) return;

    metrics.totalRequests++;
    metrics.misses++;
    metrics.hitRate = (metrics.hits / metrics.totalRequests) * 100;
  }

  /**
   * Get cache metrics
   */
  getMetrics(strategyName?: string): Map<string, CacheMetrics> | CacheMetrics | null {
    if (strategyName) {
      return this.metrics.get(strategyName) || null;
    }
    return this.metrics;
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    // Clear in-memory cache
    this.inMemoryCache.clear();
    
    // Clear Redis cache (by namespace)
    for (const strategyName of this.cacheStrategies.keys()) {
      try {
        await this.cacheService.clearNamespace(strategyName);
      } catch (error) {
        logger.error('Failed to clear Redis namespace', {
          component: 'CachingStrategy',
          namespace: strategyName,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Reset metrics
    this.metrics.clear();

    logger.info('All caches cleared', { component: 'CachingStrategy' });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    inMemorySize: number;
    inMemoryLimit: number;
    refreshQueueSize: number;
    strategiesCount: number;
    totalRequests: number;
    overallHitRate: number;
  } {
    let totalRequests = 0;
    let totalHits = 0;

    this.metrics.forEach(metric => {
      totalRequests += metric.totalRequests;
      totalHits += metric.hits;
    });

    return {
      inMemorySize: this.inMemoryCache.size,
      inMemoryLimit: this.config.inMemorySize,
      refreshQueueSize: this.refreshQueue.size,
      strategiesCount: this.cacheStrategies.size,
      totalRequests,
      overallHitRate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0
    };
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.inMemoryCache.entries()) {
        if (now > entry.expiry) {
          this.inMemoryCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug('Cleaned expired cache entries', {
          component: 'CachingStrategy',
          cleaned,
          remaining: this.inMemoryCache.size
        });
      }
    }, 60000); // Run every minute
  }

  /**
   * Warmup cache with commonly accessed data
   */
  async warmupCache(warmupData: Array<{
    strategy: string;
    key: string;
    dataFn: () => Promise<any>;
  }>): Promise<void> {
    logger.info('Starting cache warmup', {
      component: 'CachingStrategy',
      items: warmupData.length
    });

    const promises = warmupData.map(async (item) => {
      try {
        const data = await item.dataFn();
        await this.set(item.strategy, item.key, data);
      } catch (error) {
        logger.error('Cache warmup failed for item', {
          component: 'CachingStrategy',
          strategy: item.strategy,
          key: item.key,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.allSettled(promises);
    
    logger.info('Cache warmup completed', {
      component: 'CachingStrategy'
    });
  }
}

export default CachingStrategy;

