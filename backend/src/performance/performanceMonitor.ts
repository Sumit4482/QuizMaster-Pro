import { Request, Response, NextFunction } from 'express';
import { performance, PerformanceObserver } from 'perf_hooks';
import { logger } from '../utils/logger';
import { CacheService } from '../infrastructure/cache/cacheService';
import { QueueService } from '../infrastructure/queue/queueService';

export interface PerformanceMetrics {
  timestamp: Date;
  requestId: string;
  endpoint: string;
  method: string;
  responseTime: number;
  cpuUsage: {
    user: number;
    system: number;
  };
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  databaseQueries: {
    count: number;
    totalTime: number;
    averageTime: number;
    slowQueries: number;
  };
  cacheOperations: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
  };
  networkIO: {
    bytesIn: number;
    bytesOut: number;
  };
  statusCode: number;
  userAgent?: string;
  ipAddress: string;
  userId?: string;
  errors: string[];
  warnings: string[];
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  type: 'high_response_time' | 'high_memory_usage' | 'high_cpu_usage' | 'database_slow' | 'cache_misses' | 'error_rate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  endpoint?: string;
  userId?: string;
  resolved: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface PerformanceThresholds {
  responseTime: {
    warning: number;
    critical: number;
  };
  memoryUsage: {
    warning: number; // percentage
    critical: number;
  };
  cpuUsage: {
    warning: number; // percentage
    critical: number;
  };
  databaseQuery: {
    warning: number; // ms
    critical: number;
  };
  errorRate: {
    warning: number; // percentage
    critical: number;
  };
  cacheHitRate: {
    warning: number; // percentage (below this is bad)
    critical: number;
  };
}

export interface PerformanceReport {
  period: { start: Date; end: Date };
  overview: {
    totalRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    throughput: number; // requests per second
  };
  endpoints: Array<{
    endpoint: string;
    requests: number;
    averageResponseTime: number;
    errorRate: number;
  }>;
  resources: {
    averageCpuUsage: number;
    averageMemoryUsage: number;
    maxMemoryUsage: number;
    databasePerformance: {
      totalQueries: number;
      averageQueryTime: number;
      slowQueries: number;
    };
    cachePerformance: {
      hitRate: number;
      operations: number;
    };
  };
  alerts: {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  };
  trends: {
    responseTimeTrend: 'improving' | 'degrading' | 'stable';
    memoryTrend: 'improving' | 'degrading' | 'stable';
    errorRateTrend: 'improving' | 'degrading' | 'stable';
  };
}

export class PerformanceMonitor {
  private cacheService: CacheService;
  private queueService: QueueService;
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private performanceObserver: PerformanceObserver;
  private metricsBuffer: PerformanceMetrics[] = [];
  private bufferSize = 100;
  private flushInterval = 30000; // 30 seconds
  
  private thresholds: PerformanceThresholds = {
    responseTime: { warning: 1000, critical: 5000 },
    memoryUsage: { warning: 80, critical: 90 },
    cpuUsage: { warning: 70, critical: 85 },
    databaseQuery: { warning: 1000, critical: 5000 },
    errorRate: { warning: 5, critical: 10 },
    cacheHitRate: { warning: 70, critical: 50 }
  };

  constructor(cacheService: CacheService, queueService: QueueService, thresholds?: Partial<PerformanceThresholds>) {
    this.cacheService = cacheService;
    this.queueService = queueService;
    
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds };
    }

    this.setupPerformanceObserver();
    this.startMetricsCollection();
    this.startBufferFlush();

    logger.info('Performance Monitor initialized', {
      component: 'PerformanceMonitor',
      thresholds: this.thresholds,
      bufferSize: this.bufferSize
    });
  }

  /**
   * Setup performance observer for Node.js performance entries
   */
  private setupPerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      
      entries.forEach(entry => {
        if (entry.entryType === 'measure') {
          logger.debug('Performance measure', {
            component: 'PerformanceMonitor',
            name: entry.name,
            duration: entry.duration
          });
        }
      });
    });

    this.performanceObserver.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
  }

  /**
   * Start system metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.collectSystemMetrics();
    }, 5000); // Collect every 5 seconds
  }

  /**
   * Collect system-level metrics
   */
  private collectSystemMetrics(): void {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      // Calculate CPU percentage (simplified)
      const cpuPercent = {
        user: (cpuUsage.user / 1000000) * 100, // Convert to percentage
        system: (cpuUsage.system / 1000000) * 100
      };

      // Calculate memory percentage
      const memoryPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      // Check thresholds and generate alerts
      this.checkCpuThreshold(cpuPercent.user + cpuPercent.system);
      this.checkMemoryThreshold(memoryPercent);

      // Store metrics in cache for monitoring dashboard
      this.cacheService.set(
        'system_metrics',
        {
          timestamp: new Date(),
          cpu: cpuPercent,
          memory: memUsage,
          memoryPercent
        },
        { namespace: 'performance', ttl: 60 }
      );
    } catch (error) {
      logger.error('Failed to collect system metrics', {
        component: 'PerformanceMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Create middleware to monitor request performance
   */
  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = performance.now();
      const requestId = this.generateRequestId();
      
      // Add request ID to request object
      (req as any).performanceId = requestId;
      
      // Track request start
      performance.mark(`request-start-${requestId}`);

      // Initialize metrics
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        requestId,
        endpoint: req.path,
        method: req.method,
        responseTime: 0,
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        databaseQueries: { count: 0, totalTime: 0, averageTime: 0, slowQueries: 0 },
        cacheOperations: { hits: 0, misses: 0, sets: 0, deletes: 0 },
        networkIO: {
          bytesIn: parseInt(req.get('content-length') || '0'),
          bytesOut: 0
        },
        statusCode: 0,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        userId: (req as any).user?.id,
        errors: [],
        warnings: []
      };

      // Store initial metrics
      this.metrics.set(requestId, metrics);

      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any): any {
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        // Update metrics
        metrics.responseTime = responseTime;
        metrics.statusCode = res.statusCode;
        
        if (chunk) {
          metrics.networkIO.bytesOut = Buffer.byteLength(chunk, encoding || 'utf8');
        }

        // Update CPU and memory usage
        const finalCpuUsage = process.cpuUsage(metrics.cpuUsage);
        metrics.cpuUsage = {
          user: finalCpuUsage.user / 1000, // Convert to milliseconds
          system: finalCpuUsage.system / 1000
        };
        metrics.memoryUsage = process.memoryUsage();

        // Performance mark
        performance.mark(`request-end-${requestId}`);
        performance.measure(`request-${requestId}`, `request-start-${requestId}`, `request-end-${requestId}`);

        // Add to buffer for processing
        (this as any).metricsBuffer.push(metrics);

        // Check performance thresholds
        (this as any).checkPerformanceThresholds(metrics);

        // Call original end method
        return originalEnd.call(this, chunk, encoding);
      }.bind(this);

      next();
    };
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkPerformanceThresholds(metrics: PerformanceMetrics): void {
    // Response time threshold
    if (metrics.responseTime > this.thresholds.responseTime.critical) {
      this.generateAlert('high_response_time', 'critical', 
        `Response time ${metrics.responseTime}ms exceeds critical threshold`, 
        metrics.responseTime, this.thresholds.responseTime.critical, metrics);
    } else if (metrics.responseTime > this.thresholds.responseTime.warning) {
      this.generateAlert('high_response_time', 'medium', 
        `Response time ${metrics.responseTime}ms exceeds warning threshold`, 
        metrics.responseTime, this.thresholds.responseTime.warning, metrics);
    }

    // Database query threshold
    if (metrics.databaseQueries.averageTime > this.thresholds.databaseQuery.critical) {
      this.generateAlert('database_slow', 'critical', 
        `Average database query time ${metrics.databaseQueries.averageTime}ms exceeds critical threshold`, 
        metrics.databaseQueries.averageTime, this.thresholds.databaseQuery.critical, metrics);
    }

    // Error detection
    if (metrics.statusCode >= 500) {
      this.generateAlert('error_rate', 'high', 
        `Server error detected: ${metrics.statusCode}`, 
        metrics.statusCode, 500, metrics);
    }
  }

  /**
   * Check CPU usage threshold
   */
  private checkCpuThreshold(cpuUsage: number): void {
    if (cpuUsage > this.thresholds.cpuUsage.critical) {
      this.generateAlert('high_cpu_usage', 'critical', 
        `CPU usage ${cpuUsage.toFixed(2)}% exceeds critical threshold`, 
        cpuUsage, this.thresholds.cpuUsage.critical);
    } else if (cpuUsage > this.thresholds.cpuUsage.warning) {
      this.generateAlert('high_cpu_usage', 'medium', 
        `CPU usage ${cpuUsage.toFixed(2)}% exceeds warning threshold`, 
        cpuUsage, this.thresholds.cpuUsage.warning);
    }
  }

  /**
   * Check memory usage threshold
   */
  private checkMemoryThreshold(memoryPercent: number): void {
    if (memoryPercent > this.thresholds.memoryUsage.critical) {
      this.generateAlert('high_memory_usage', 'critical', 
        `Memory usage ${memoryPercent.toFixed(2)}% exceeds critical threshold`, 
        memoryPercent, this.thresholds.memoryUsage.critical);
    } else if (memoryPercent > this.thresholds.memoryUsage.warning) {
      this.generateAlert('high_memory_usage', 'medium', 
        `Memory usage ${memoryPercent.toFixed(2)}% exceeds warning threshold`, 
        memoryPercent, this.thresholds.memoryUsage.warning);
    }
  }

  /**
   * Generate performance alert
   */
  private generateAlert(
    type: PerformanceAlert['type'], 
    severity: PerformanceAlert['severity'], 
    message: string, 
    value: number, 
    threshold: number, 
    metrics?: PerformanceMetrics
  ): void {
    try {
      const alertId = this.generateAlertId();
      
      const alert: PerformanceAlert = {
        id: alertId,
        timestamp: new Date(),
        type,
        severity,
        message,
        value,
        threshold,
        endpoint: metrics?.endpoint,
        userId: metrics?.userId,
        resolved: false
      };

      this.alerts.set(alertId, alert);

      // Log alert
      const logLevel = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';
      logger.log(logLevel, 'Performance alert generated', {
        component: 'PerformanceMonitor',
        alert
      });

      // Queue alert notification
      this.queueService.addJob('notifications', 'sendPerformanceAlert', {
        alertId,
        severity,
        message,
        type
      }, { priority: severity === 'critical' ? 10 : 5 });

      // Cache alert for dashboard
      this.cacheService.set(
        `performance_alert:${alertId}`,
        alert,
        { namespace: 'performance', ttl: 86400 }
      );
    } catch (error) {
      logger.error('Failed to generate performance alert', {
        component: 'PerformanceMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Start buffer flush interval
   */
  private startBufferFlush(): void {
    setInterval(async () => {
      await this.flushMetricsBuffer();
    }, this.flushInterval);
  }

  /**
   * Flush metrics buffer to storage
   */
  private async flushMetricsBuffer(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    try {
      const metrics = [...this.metricsBuffer];
      this.metricsBuffer = [];

      // Store aggregated metrics in cache
      const aggregated = this.aggregateMetrics(metrics);
      await this.cacheService.set(
        'performance_metrics',
        aggregated,
        { namespace: 'performance', ttl: 3600 }
      );

      // Store individual metrics for detailed analysis
      for (const metric of metrics) {
        await this.cacheService.set(
          `metric:${metric.requestId}`,
          metric,
          { namespace: 'performance', ttl: 1800 }
        );
      }

      logger.debug('Performance metrics flushed', {
        component: 'PerformanceMonitor',
        count: metrics.length
      });
    } catch (error) {
      logger.error('Failed to flush performance metrics', {
        component: 'PerformanceMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Aggregate metrics for summary reporting
   */
  private aggregateMetrics(metrics: PerformanceMetrics[]): any {
    if (metrics.length === 0) return {};

    const responseTimes = metrics.map(m => m.responseTime);
    const memoryUsages = metrics.map(m => m.memoryUsage.heapUsed);
    const cpuUsages = metrics.map(m => m.cpuUsage.user + m.cpuUsage.system);

    return {
      timestamp: new Date(),
      totalRequests: metrics.length,
      averageResponseTime: this.average(responseTimes),
      medianResponseTime: this.median(responseTimes),
      p95ResponseTime: this.percentile(responseTimes, 0.95),
      p99ResponseTime: this.percentile(responseTimes, 0.99),
      averageMemoryUsage: this.average(memoryUsages),
      maxMemoryUsage: Math.max(...memoryUsages),
      averageCpuUsage: this.average(cpuUsages),
      maxCpuUsage: Math.max(...cpuUsages),
      errorCount: metrics.filter(m => m.statusCode >= 400).length,
      endpointStats: this.aggregateByEndpoint(metrics)
    };
  }

  /**
   * Aggregate metrics by endpoint
   */
  private aggregateByEndpoint(metrics: PerformanceMetrics[]): Record<string, any> {
    const endpointStats: Record<string, any> = {};

    metrics.forEach(metric => {
      if (!endpointStats[metric.endpoint]) {
        endpointStats[metric.endpoint] = {
          requests: 0,
          responseTimes: [],
          errors: 0
        };
      }

      const stats = endpointStats[metric.endpoint];
      stats.requests++;
      stats.responseTimes.push(metric.responseTime);
      
      if (metric.statusCode >= 400) {
        stats.errors++;
      }
    });

    // Calculate statistics for each endpoint
    Object.keys(endpointStats).forEach(endpoint => {
      const stats = endpointStats[endpoint];
      stats.averageResponseTime = this.average(stats.responseTimes);
      stats.medianResponseTime = this.median(stats.responseTimes);
      stats.p95ResponseTime = this.percentile(stats.responseTimes, 0.95);
      stats.errorRate = (stats.errors / stats.requests) * 100;
      delete stats.responseTimes; // Remove raw data to save space
    });

    return endpointStats;
  }

  /**
   * Track database query performance
   */
  trackDatabaseQuery(requestId: string, queryTime: number, isSlowQuery: boolean = false): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    metrics.databaseQueries.count++;
    metrics.databaseQueries.totalTime += queryTime;
    metrics.databaseQueries.averageTime = metrics.databaseQueries.totalTime / metrics.databaseQueries.count;

    if (isSlowQuery) {
      metrics.databaseQueries.slowQueries++;
    }
  }

  /**
   * Track cache operation performance
   */
  trackCacheOperation(requestId: string, operation: 'hit' | 'miss' | 'set' | 'delete'): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    metrics.cacheOperations[operation === 'hit' ? 'hits' : 
                           operation === 'miss' ? 'misses' :
                           operation === 'set' ? 'sets' : 'deletes']++;
  }

  /**
   * Add error to request metrics
   */
  addError(requestId: string, error: string): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    metrics.errors.push(error);
  }

  /**
   * Add warning to request metrics
   */
  addWarning(requestId: string, warning: string): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    metrics.warnings.push(warning);
  }

  /**
   * Generate performance report
   */
  async generateReport(startDate: Date, endDate: Date): Promise<PerformanceReport> {
    try {
      // Get metrics from cache and memory
      const allMetrics = Array.from(this.metrics.values())
        .filter(m => m.timestamp >= startDate && m.timestamp <= endDate);

      const responseTimes = allMetrics.map(m => m.responseTime);
      const errorCount = allMetrics.filter(m => m.statusCode >= 400).length;
      const timeDiff = (endDate.getTime() - startDate.getTime()) / 1000; // seconds

      // Endpoint analysis
      const endpointMap = new Map<string, { requests: number; responseTimes: number[]; errors: number }>();
      allMetrics.forEach(metric => {
        if (!endpointMap.has(metric.endpoint)) {
          endpointMap.set(metric.endpoint, { requests: 0, responseTimes: [], errors: 0 });
        }
        const stats = endpointMap.get(metric.endpoint)!;
        stats.requests++;
        stats.responseTimes.push(metric.responseTime);
        if (metric.statusCode >= 400) stats.errors++;
      });

      const endpoints = Array.from(endpointMap.entries()).map(([endpoint, stats]) => ({
        endpoint,
        requests: stats.requests,
        averageResponseTime: this.average(stats.responseTimes),
        errorRate: (stats.errors / stats.requests) * 100
      }));

      // Alert analysis
      const recentAlerts = Array.from(this.alerts.values())
        .filter(a => a.timestamp >= startDate && a.timestamp <= endDate);

      const alertsBySeverity: Record<string, number> = {};
      const alertsByType: Record<string, number> = {};

      recentAlerts.forEach(alert => {
        alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
        alertsByType[alert.type] = (alertsByType[alert.type] || 0) + 1;
      });

      return {
        period: { start: startDate, end: endDate },
        overview: {
          totalRequests: allMetrics.length,
          averageResponseTime: this.average(responseTimes),
          p95ResponseTime: this.percentile(responseTimes, 0.95),
          p99ResponseTime: this.percentile(responseTimes, 0.99),
          errorRate: (errorCount / allMetrics.length) * 100,
          throughput: allMetrics.length / timeDiff
        },
        endpoints: endpoints.sort((a, b) => b.requests - a.requests).slice(0, 10),
        resources: {
          averageCpuUsage: this.average(allMetrics.map(m => m.cpuUsage.user + m.cpuUsage.system)),
          averageMemoryUsage: this.average(allMetrics.map(m => m.memoryUsage.heapUsed)),
          maxMemoryUsage: Math.max(...allMetrics.map(m => m.memoryUsage.heapUsed)),
          databasePerformance: {
            totalQueries: allMetrics.reduce((sum, m) => sum + m.databaseQueries.count, 0),
            averageQueryTime: this.average(allMetrics.map(m => m.databaseQueries.averageTime)),
            slowQueries: allMetrics.reduce((sum, m) => sum + m.databaseQueries.slowQueries, 0)
          },
          cachePerformance: {
            hitRate: this.calculateCacheHitRate(allMetrics),
            operations: allMetrics.reduce((sum, m) => 
              sum + m.cacheOperations.hits + m.cacheOperations.misses + 
              m.cacheOperations.sets + m.cacheOperations.deletes, 0)
          }
        },
        alerts: {
          total: recentAlerts.length,
          bySeverity: alertsBySeverity,
          byType: alertsByType
        },
        trends: {
          responseTimeTrend: this.calculateTrend(allMetrics.map(m => m.responseTime)),
          memoryTrend: this.calculateTrend(allMetrics.map(m => m.memoryUsage.heapUsed)),
          errorRateTrend: this.calculateErrorRateTrend(allMetrics)
        }
      };
    } catch (error) {
      logger.error('Failed to generate performance report', {
        component: 'PerformanceMonitor',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(metrics: PerformanceMetrics[]): number {
    const totalHits = metrics.reduce((sum, m) => sum + m.cacheOperations.hits, 0);
    const totalMisses = metrics.reduce((sum, m) => sum + m.cacheOperations.misses, 0);
    const totalRequests = totalHits + totalMisses;
    
    return totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
  }

  /**
   * Calculate trend direction
   */
  private calculateTrend(values: number[]): 'improving' | 'degrading' | 'stable' {
    if (values.length < 2) return 'stable';

    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);

    const firstAvg = this.average(firstHalf);
    const secondAvg = this.average(secondHalf);

    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (changePercent > 10) return 'degrading';
    if (changePercent < -10) return 'improving';
    return 'stable';
  }

  /**
   * Calculate error rate trend
   */
  private calculateErrorRateTrend(metrics: PerformanceMetrics[]): 'improving' | 'degrading' | 'stable' {
    const errorRates = metrics.map(m => m.statusCode >= 400 ? 1 : 0);
    return this.calculateTrend(errorRates) === 'degrading' ? 'degrading' : 
           this.calculateTrend(errorRates) === 'improving' ? 'improving' : 'stable';
  }

  /**
   * Get current performance status
   */
  getCurrentStatus(): {
    activeRequests: number;
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
    activeAlerts: number;
    criticalAlerts: number;
  } {
    const recentMetrics = Array.from(this.metrics.values())
      .filter(m => m.timestamp.getTime() > Date.now() - 300000); // Last 5 minutes

    const activeAlerts = Array.from(this.alerts.values()).filter(a => !a.resolved);
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');

    return {
      activeRequests: this.metrics.size,
      averageResponseTime: this.average(recentMetrics.map(m => m.responseTime)),
      errorRate: recentMetrics.length > 0 ? 
        (recentMetrics.filter(m => m.statusCode >= 400).length / recentMetrics.length) * 100 : 0,
      memoryUsage: recentMetrics.length > 0 ? 
        this.average(recentMetrics.map(m => m.memoryUsage.heapUsed)) : 0,
      cpuUsage: recentMetrics.length > 0 ? 
        this.average(recentMetrics.map(m => m.cpuUsage.user + m.cpuUsage.system)) : 0,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length
    };
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    logger.info('Performance alert acknowledged', {
      component: 'PerformanceMonitor',
      alertId,
      acknowledgedBy
    });

    return true;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;

    logger.info('Performance alert resolved', {
      component: 'PerformanceMonitor',
      alertId
    });

    return true;
  }

  /**
   * Utility functions
   */
  private average(numbers: number[]): number {
    return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
  }

  private median(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private percentile(numbers: number[], percentile: number): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil(percentile * sorted.length) - 1;
    return sorted[index] || 0;
  }

  private generateRequestId(): string {
    return `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAlertId(): string {
    return `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update thresholds
   */
  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    
    logger.info('Performance thresholds updated', {
      component: 'PerformanceMonitor',
      thresholds: this.thresholds
    });
  }

  /**
   * Get all alerts
   */
  getAlerts(filters?: {
    severity?: string;
    type?: string;
    resolved?: boolean;
    limit?: number;
  }): PerformanceAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (filters) {
      if (filters.severity) {
        alerts = alerts.filter(a => a.severity === filters.severity);
      }
      if (filters.type) {
        alerts = alerts.filter(a => a.type === filters.type);
      }
      if (filters.resolved !== undefined) {
        alerts = alerts.filter(a => a.resolved === filters.resolved);
      }
    }

    return alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, filters?.limit || 100);
  }
}

export default PerformanceMonitor;

