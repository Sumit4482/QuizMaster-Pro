import { logger } from '../../utils/logger';
import { CacheService } from '../cache/cacheService';

export interface CDNConfig {
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
}

export interface AssetInfo {
  path: string;
  url: string;
  mimeType: string;
  size: number;
  lastModified: Date;
  etag: string;
  cached: boolean;
  compressed: boolean;
  optimized: boolean;
}

export interface CDNStats {
  totalAssets: number;
  totalSize: number;
  cacheHitRate: number;
  bandwidthUsed: number;
  requestsServed: number;
  averageResponseTime: number;
  topAssets: Array<{
    path: string;
    requests: number;
    size: number;
  }>;
  geographicDistribution: Record<string, number>;
}

export interface PurgeResult {
  success: boolean;
  purgedPaths: string[];
  errors: string[];
  totalPurged: number;
}

export class CDNService {
  private cacheService: CacheService;
  private stats: CDNStats;
  private assetRegistry: Map<string, AssetInfo> = new Map();
  private requestMetrics: Map<string, { requests: number; totalSize: number }> = new Map();

  constructor(private config: CDNConfig) {
    this.cacheService = new CacheService();
    this.initializeStats();
    this.setupAssetOptimization();

    logger.info('CDN service initialized', {
      component: 'CDNService',
      provider: config.provider,
      baseUrl: config.baseUrl,
      cacheEnabled: config.cacheEnabled
    });
  }

  /**
   * Initialize CDN statistics
   */
  private initializeStats(): void {
    this.stats = {
      totalAssets: 0,
      totalSize: 0,
      cacheHitRate: 0,
      bandwidthUsed: 0,
      requestsServed: 0,
      averageResponseTime: 0,
      topAssets: [],
      geographicDistribution: {}
    };
  }

  /**
   * Setup asset optimization based on configuration
   */
  private setupAssetOptimization(): void {
    if (this.config.imageOptimization) {
      logger.info('Image optimization enabled', { component: 'CDNService' });
    }
    if (this.config.gzipEnabled) {
      logger.info('Gzip compression enabled', { component: 'CDNService' });
    }
    if (this.config.brotliEnabled) {
      logger.info('Brotli compression enabled', { component: 'CDNService' });
    }
  }

  /**
   * Upload asset to CDN
   */
  async uploadAsset(
    filePath: string,
    fileBuffer: Buffer,
    mimeType: string,
    options: {
      cacheControl?: string;
      metadata?: Record<string, string>;
      compress?: boolean;
      optimize?: boolean;
    } = {}
  ): Promise<AssetInfo> {
    try {
      const startTime = Date.now();

      // Process the asset based on options
      let processedBuffer = fileBuffer;
      let optimized = false;
      let compressed = false;

      if (options.optimize && this.shouldOptimizeAsset(mimeType)) {
        processedBuffer = await this.optimizeAsset(processedBuffer, mimeType);
        optimized = true;
      }

      if (options.compress && this.shouldCompressAsset(mimeType)) {
        processedBuffer = await this.compressAsset(processedBuffer);
        compressed = true;
      }

      // Upload to CDN provider
      const uploadResult = await this.uploadToProvider(filePath, processedBuffer, mimeType, options);

      // Create asset info
      const assetInfo: AssetInfo = {
        path: filePath,
        url: `${this.config.baseUrl}/${filePath}`,
        mimeType,
        size: processedBuffer.length,
        lastModified: new Date(),
        etag: this.generateETag(processedBuffer),
        cached: false,
        compressed,
        optimized
      };

      // Register asset
      this.assetRegistry.set(filePath, assetInfo);

      // Cache asset info if caching is enabled
      if (this.config.cacheEnabled) {
        await this.cacheService.set(
          `asset:${filePath}`,
          assetInfo,
          { namespace: 'cdn', ttl: this.config.cacheTTL }
        );
        assetInfo.cached = true;
      }

      // Update statistics
      this.stats.totalAssets++;
      this.stats.totalSize += assetInfo.size;

      const uploadTime = Date.now() - startTime;
      logger.info('Asset uploaded to CDN', {
        component: 'CDNService',
        path: filePath,
        size: assetInfo.size,
        optimized,
        compressed,
        uploadTime,
        url: assetInfo.url
      });

      return assetInfo;
    } catch (error) {
      logger.error('Failed to upload asset to CDN', {
        component: 'CDNService',
        path: filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`CDN upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get asset information
   */
  async getAssetInfo(path: string): Promise<AssetInfo | null> {
    try {
      // Try cache first
      if (this.config.cacheEnabled) {
        const cached = await this.cacheService.get<AssetInfo>(
          `asset:${path}`,
          { namespace: 'cdn' }
        );
        if (cached) {
          return cached;
        }
      }

      // Try local registry
      const assetInfo = this.assetRegistry.get(path);
      if (assetInfo) {
        return assetInfo;
      }

      // Query CDN provider
      return await this.getAssetFromProvider(path);
    } catch (error) {
      logger.error('Failed to get asset info', {
        component: 'CDNService',
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Generate CDN URL for an asset
   */
  generateAssetUrl(path: string, options: {
    version?: string;
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  } = {}): string {
    let url = `${this.config.baseUrl}/${path}`;

    // Add query parameters for image transformation
    const params = new URLSearchParams();
    
    if (options.version) {
      params.append('v', options.version);
    }
    
    if (options.width) {
      params.append('w', options.width.toString());
    }
    
    if (options.height) {
      params.append('h', options.height.toString());
    }
    
    if (options.quality) {
      params.append('q', options.quality.toString());
    }
    
    if (options.format) {
      params.append('f', options.format);
    }

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    return url;
  }

  /**
   * Purge assets from CDN cache
   */
  async purgeAssets(paths: string[]): Promise<PurgeResult> {
    try {
      const result: PurgeResult = {
        success: true,
        purgedPaths: [],
        errors: [],
        totalPurged: 0
      };

      for (const path of paths) {
        try {
          await this.purgeFromProvider(path);
          
          // Remove from local cache
          if (this.config.cacheEnabled) {
            await this.cacheService.del(`asset:${path}`, 'cdn');
          }
          
          result.purgedPaths.push(path);
          result.totalPurged++;

          logger.info('Asset purged from CDN', {
            component: 'CDNService',
            path
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`${path}: ${errorMessage}`);
          result.success = false;

          logger.error('Failed to purge asset from CDN', {
            component: 'CDNService',
            path,
            error: errorMessage
          });
        }
      }

      logger.info('CDN purge operation completed', {
        component: 'CDNService',
        totalRequested: paths.length,
        totalPurged: result.totalPurged,
        errors: result.errors.length,
        success: result.success
      });

      return result;
    } catch (error) {
      logger.error('CDN purge operation failed', {
        component: 'CDNService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        purgedPaths: [],
        errors: [error instanceof Error ? error.message : String(error)],
        totalPurged: 0
      };
    }
  }

  /**
   * Record asset request for analytics
   */
  recordAssetRequest(path: string, size: number, responseTime: number, region?: string): void {
    // Update request metrics
    const current = this.requestMetrics.get(path) || { requests: 0, totalSize: 0 };
    current.requests++;
    current.totalSize += size;
    this.requestMetrics.set(path, current);

    // Update global stats
    this.stats.requestsServed++;
    this.stats.bandwidthUsed += size;
    this.updateAverageResponseTime(responseTime);

    // Update geographic distribution
    if (region) {
      this.stats.geographicDistribution[region] = 
        (this.stats.geographicDistribution[region] || 0) + 1;
    }

    logger.debug('Asset request recorded', {
      component: 'CDNService',
      path,
      size,
      responseTime,
      region
    });
  }

  /**
   * Get CDN statistics
   */
  getStats(): CDNStats {
    // Calculate cache hit rate
    const cacheStats = this.cacheService.getStats();
    cacheStats.then(stats => {
      this.stats.cacheHitRate = stats.hitRate;
    });

    // Update top assets
    this.stats.topAssets = Array.from(this.requestMetrics.entries())
      .map(([path, metrics]) => ({
        path,
        requests: metrics.requests,
        size: metrics.totalSize
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return { ...this.stats };
  }

  /**
   * Get asset analytics
   */
  getAssetAnalytics(path: string): {
    requests: number;
    totalSize: number;
    averageSize: number;
    lastRequested: Date | null;
  } {
    const metrics = this.requestMetrics.get(path);
    
    return {
      requests: metrics?.requests || 0,
      totalSize: metrics?.totalSize || 0,
      averageSize: metrics ? metrics.totalSize / metrics.requests : 0,
      lastRequested: null // Would be tracked in a real implementation
    };
  }

  /**
   * Health check for CDN service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    provider: 'available' | 'unavailable';
    cache: 'healthy' | 'unhealthy';
    latency: number;
    assetsServed: number;
  }> {
    try {
      const startTime = Date.now();
      
      // Test CDN provider connectivity
      const providerHealthy = await this.testProviderConnectivity();
      
      // Test cache service
      const cacheStats = await this.cacheService.getStats();
      
      const latency = Date.now() - startTime;

      return {
        status: providerHealthy && cacheStats.hitRate >= 0 ? 'healthy' : 'unhealthy',
        provider: providerHealthy ? 'available' : 'unavailable',
        cache: cacheStats.hitRate >= 0 ? 'healthy' : 'unhealthy',
        latency,
        assetsServed: this.stats.requestsServed
      };
    } catch (error) {
      logger.error('CDN health check failed', {
        component: 'CDNService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        provider: 'unavailable',
        cache: 'unhealthy',
        latency: -1,
        assetsServed: 0
      };
    }
  }

  // Private helper methods

  private async uploadToProvider(
    path: string, 
    buffer: Buffer, 
    mimeType: string, 
    options: any
  ): Promise<boolean> {
    switch (this.config.provider) {
      case 'local':
        return this.uploadToLocal(path, buffer);
      case 'aws':
        return this.uploadToAWS(path, buffer, mimeType, options);
      case 'cloudflare':
        return this.uploadToCloudflare(path, buffer, mimeType, options);
      case 'gcp':
        return this.uploadToGCP(path, buffer, mimeType, options);
      case 'azure':
        return this.uploadToAzure(path, buffer, mimeType, options);
      default:
        throw new Error(`Unsupported CDN provider: ${this.config.provider}`);
    }
  }

  private async uploadToLocal(path: string, buffer: Buffer): Promise<boolean> {
    // Mock local upload
    logger.debug('Mock local CDN upload', {
      component: 'CDNService',
      path,
      size: buffer.length
    });
    return true;
  }

  private async uploadToAWS(path: string, buffer: Buffer, mimeType: string, options: any): Promise<boolean> {
    // Mock AWS S3 upload
    logger.debug('Mock AWS S3 upload', {
      component: 'CDNService',
      path,
      size: buffer.length,
      mimeType
    });
    return true;
  }

  private async uploadToCloudflare(path: string, buffer: Buffer, mimeType: string, options: any): Promise<boolean> {
    // Mock Cloudflare upload
    logger.debug('Mock Cloudflare upload', {
      component: 'CDNService',
      path,
      size: buffer.length,
      mimeType
    });
    return true;
  }

  private async uploadToGCP(path: string, buffer: Buffer, mimeType: string, options: any): Promise<boolean> {
    // Mock Google Cloud Storage upload
    logger.debug('Mock GCP upload', {
      component: 'CDNService',
      path,
      size: buffer.length,
      mimeType
    });
    return true;
  }

  private async uploadToAzure(path: string, buffer: Buffer, mimeType: string, options: any): Promise<boolean> {
    // Mock Azure Blob Storage upload
    logger.debug('Mock Azure upload', {
      component: 'CDNService',
      path,
      size: buffer.length,
      mimeType
    });
    return true;
  }

  private async getAssetFromProvider(path: string): Promise<AssetInfo | null> {
    // Mock implementation - would query actual CDN provider
    return null;
  }

  private async purgeFromProvider(path: string): Promise<void> {
    // Mock purge implementation
    logger.debug('Mock CDN purge', {
      component: 'CDNService',
      path,
      provider: this.config.provider
    });
  }

  private async testProviderConnectivity(): Promise<boolean> {
    // Mock connectivity test
    return true;
  }

  private shouldOptimizeAsset(mimeType: string): boolean {
    return this.config.imageOptimization && mimeType.startsWith('image/');
  }

  private shouldCompressAsset(mimeType: string): boolean {
    const compressibleTypes = [
      'text/',
      'application/javascript',
      'application/json',
      'application/xml',
      'image/svg+xml'
    ];
    return compressibleTypes.some(type => mimeType.startsWith(type));
  }

  private async optimizeAsset(buffer: Buffer, mimeType: string): Promise<Buffer> {
    // Mock optimization - in real implementation would use Sharp or similar
    logger.debug('Mock asset optimization', {
      component: 'CDNService',
      originalSize: buffer.length,
      mimeType
    });
    return buffer;
  }

  private async compressAsset(buffer: Buffer): Promise<Buffer> {
    // Mock compression - in real implementation would use gzip/brotli
    logger.debug('Mock asset compression', {
      component: 'CDNService',
      originalSize: buffer.length
    });
    return buffer;
  }

  private generateETag(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  private updateAverageResponseTime(responseTime: number): void {
    if (this.stats.requestsServed === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (this.stats.requestsServed - 1) + responseTime) / 
        this.stats.requestsServed;
    }
  }
}

export default CDNService;

