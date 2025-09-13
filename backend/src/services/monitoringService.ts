import { EventEmitter } from 'events';
import { logger } from '../config/logger';
import os from 'os';
import process from 'process';

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    used: number;
    free: number;
    total: number;
    usage: number; // percentage
    heap: {
      used: number;
      total: number;
    };
  };
  network: {
    connections: number;
    throughput: {
      in: number;
      out: number;
    };
  };
  disk: {
    usage: number;
    free: number;
    total: number;
  };
  uptime: number;
}

export interface ApplicationMetrics {
  timestamp: Date;
  requests: {
    total: number;
    successful: number;
    failed: number;
    rate: number; // requests per second
  };
  response: {
    averageTime: number;
    p95: number;
    p99: number;
  };
  database: {
    connections: number;
    queries: number;
    slowQueries: number;
    averageQueryTime: number;
  };
  websockets: {
    connections: number;
    messagesPerSecond: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  errors: {
    count: number;
    rate: number;
    byType: { [type: string]: number };
  };
}

export interface BusinessMetrics {
  timestamp: Date;
  users: {
    active: number;
    registered: number;
    registrationsToday: number;
  };
  quizzes: {
    created: number;
    active: number;
    completedToday: number;
  };
  questions: {
    total: number;
    createdToday: number;
    aiGenerated: number;
  };
  sessions: {
    active: number;
    totalDuration: number;
    averageDuration: number;
  };
  engagement: {
    averageSessionTime: number;
    questionsPerSession: number;
    userRetention: number;
  };
}

export interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  resolvedAt?: Date;
  tags: string[];
}

export interface MonitoringConfig {
  collection: {
    interval: number; // milliseconds
    retention: number; // days
  };
  alerts: {
    thresholds: {
      cpuUsage: number;
      memoryUsage: number;
      responseTime: number;
      errorRate: number;
      diskUsage: number;
    };
    channels: {
      email?: string[];
      slack?: string;
      webhook?: string;
    };
  };
  dashboards: {
    refresh: number; // seconds
    history: number; // hours
  };
}

/**
 * Phase 4.1: Comprehensive Monitoring Service
 * 
 * Real-time monitoring, metrics collection, and alerting system
 */
export class MonitoringService extends EventEmitter {
  private static instance: MonitoringService | null = null;
  
  private systemMetrics: SystemMetrics[] = [];
  private applicationMetrics: ApplicationMetrics[] = [];
  private businessMetrics: BusinessMetrics[] = [];
  private alerts: Alert[] = [];
  
  private isCollecting = false;
  private collectionInterval: NodeJS.Timeout | null = null;
  
  // Performance counters
  private requestCounters = {
    total: 0,
    successful: 0,
    failed: 0,
    responseTimes: [] as number[],
    lastSecondRequests: 0,
    lastRequestTime: Date.now()
  };
  
  private errorCounters = new Map<string, number>();
  
  private config: MonitoringConfig = {
    collection: {
      interval: 30000, // 30 seconds
      retention: 30 // 30 days
    },
    alerts: {
      thresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        responseTime: 5000,
        errorRate: 5,
        diskUsage: 90
      },
      channels: {}
    },
    dashboards: {
      refresh: 30, // 30 seconds
      history: 24 // 24 hours
    }
  };

  private constructor() {
    super();
    this.initializeMonitoring();
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Start collecting metrics
   */
  public startCollection(): void {
    if (this.isCollecting) {
      logger.info('Monitoring collection already started');
      return;
    }

    logger.info('📊 Starting monitoring collection', {
      component: 'MonitoringService',
      interval: this.config.collection.interval
    });

    this.isCollecting = true;
    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.collection.interval);

    // Initial collection
    this.collectMetrics();

    this.emit('collectionStarted', { timestamp: new Date() });
  }

  /**
   * Stop collecting metrics
   */
  public stopCollection(): void {
    if (!this.isCollecting) {
      logger.info('Monitoring collection already stopped');
      return;
    }

    logger.info('📊 Stopping monitoring collection', {
      component: 'MonitoringService'
    });

    this.isCollecting = false;
    
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }

    this.emit('collectionStopped', { timestamp: new Date() });
  }

  /**
   * Record request metrics
   */
  public recordRequest(responseTime: number, success: boolean): void {
    this.requestCounters.total++;
    this.requestCounters.responseTimes.push(responseTime);
    
    if (success) {
      this.requestCounters.successful++;
    } else {
      this.requestCounters.failed++;
    }

    // Keep only last 1000 response times for performance
    if (this.requestCounters.responseTimes.length > 1000) {
      this.requestCounters.responseTimes = this.requestCounters.responseTimes.slice(-1000);
    }

    // Check for alerts
    this.checkResponseTimeAlert(responseTime);
  }

  /**
   * Record error
   */
  public recordError(errorType: string, error: Error | string): void {
    const errorKey = errorType.toLowerCase().replace(/\s+/g, '_');
    this.errorCounters.set(errorKey, (this.errorCounters.get(errorKey) || 0) + 1);

    logger.error('Error recorded for monitoring', {
      component: 'MonitoringService',
      errorType,
      error: error instanceof Error ? error.message : error
    });

    this.checkErrorRateAlert();
  }

  /**
   * Get current system metrics
   */
  public getCurrentSystemMetrics(): SystemMetrics {
    return this.collectSystemMetrics();
  }

  /**
   * Get current application metrics
   */
  public getCurrentApplicationMetrics(): ApplicationMetrics {
    return this.collectApplicationMetrics();
  }

  /**
   * Get current business metrics
   */
  public async getCurrentBusinessMetrics(): Promise<BusinessMetrics> {
    return await this.collectBusinessMetrics();
  }

  /**
   * Get metrics history
   */
  public getMetricsHistory(hours: number = 24): {
    system: SystemMetrics[];
    application: ApplicationMetrics[];
    business: BusinessMetrics[];
  } {
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    return {
      system: this.systemMetrics.filter(m => m.timestamp >= cutoff),
      application: this.applicationMetrics.filter(m => m.timestamp >= cutoff),
      business: this.businessMetrics.filter(m => m.timestamp >= cutoff)
    };
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.acknowledged && !alert.resolvedAt);
  }

  /**
   * Acknowledge alert
   */
  public acknowledgeAlert(alertId: string, userId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    
    if (alert) {
      alert.acknowledged = true;
      
      logger.info('Alert acknowledged', {
        component: 'MonitoringService',
        alertId,
        userId
      });

      this.emit('alertAcknowledged', { alert, userId });
    }
  }

  /**
   * Update monitoring configuration
   */
  public updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    logger.info('Monitoring configuration updated', {
      component: 'MonitoringService',
      config: this.config
    });

    // Restart collection with new interval if needed
    if (newConfig.collection?.interval && this.isCollecting) {
      this.stopCollection();
      this.startCollection();
    }

    this.emit('configUpdated', { config: this.config });
  }

  /**
   * Generate monitoring report
   */
  public generateReport(hours: number = 24): MonitoringReport {
    const history = this.getMetricsHistory(hours);
    const activeAlerts = this.getActiveAlerts();
    
    // Calculate averages and trends
    const avgCpuUsage = history.system.length > 0 ?
      history.system.reduce((sum, m) => sum + m.cpu.usage, 0) / history.system.length : 0;
    
    const avgMemoryUsage = history.system.length > 0 ?
      history.system.reduce((sum, m) => sum + m.memory.usage, 0) / history.system.length : 0;
    
    const avgResponseTime = history.application.length > 0 ?
      history.application.reduce((sum, m) => sum + m.response.averageTime, 0) / history.application.length : 0;
    
    const totalRequests = history.application.length > 0 ?
      Math.max(...history.application.map(m => m.requests.total)) : 0;
    
    const totalErrors = history.application.length > 0 ?
      Math.max(...history.application.map(m => m.errors.count)) : 0;

    return {
      period: { hours, from: new Date(Date.now() - hours * 60 * 60 * 1000), to: new Date() },
      system: {
        averageCpuUsage: avgCpuUsage,
        averageMemoryUsage: avgMemoryUsage,
        uptime: process.uptime(),
        health: this.calculateSystemHealth(avgCpuUsage, avgMemoryUsage)
      },
      application: {
        totalRequests,
        totalErrors,
        averageResponseTime: avgResponseTime,
        errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
        health: this.calculateApplicationHealth(avgResponseTime, totalErrors, totalRequests)
      },
      business: {
        activeUsers: history.business.length > 0 ? 
          Math.max(...history.business.map(m => m.users.active)) : 0,
        totalQuizzes: history.business.length > 0 ?
          Math.max(...history.business.map(m => m.quizzes.created)) : 0,
        averageEngagement: history.business.length > 0 ?
          history.business.reduce((sum, m) => sum + m.engagement.averageSessionTime, 0) / history.business.length : 0
      },
      alerts: {
        active: activeAlerts.length,
        critical: activeAlerts.filter(a => a.level === 'critical').length,
        warning: activeAlerts.filter(a => a.level === 'warning').length
      },
      recommendations: this.generateRecommendations(history, activeAlerts)
    };
  }

  /**
   * Initialize monitoring system
   */
  private initializeMonitoring(): void {
    logger.info('📊 Initializing monitoring service');

    // Set up cleanup for old metrics
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 1000 * 60 * 60); // Every hour

    // Auto-resolve old alerts
    setInterval(() => {
      this.resolveStaleAlerts();
    }, 1000 * 60 * 5); // Every 5 minutes
  }

  /**
   * Collect all metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const systemMetrics = this.collectSystemMetrics();
      const applicationMetrics = this.collectApplicationMetrics();
      const businessMetrics = await this.collectBusinessMetrics();

      this.systemMetrics.push(systemMetrics);
      this.applicationMetrics.push(applicationMetrics);
      this.businessMetrics.push(businessMetrics);

      // Check for alerts
      this.checkSystemAlerts(systemMetrics);
      this.checkApplicationAlerts(applicationMetrics);

      this.emit('metricsCollected', {
        system: systemMetrics,
        application: applicationMetrics,
        business: businessMetrics
      });

    } catch (error) {
      logger.error('Failed to collect metrics', {
        component: 'MonitoringService',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      timestamp: new Date(),
      cpu: {
        usage: this.getCpuUsage(),
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      },
      memory: {
        used: usedMemory,
        free: freeMemory,
        total: totalMemory,
        usage: (usedMemory / totalMemory) * 100,
        heap: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal
        }
      },
      network: {
        connections: 0, // Would need to implement connection counting
        throughput: {
          in: 0,
          out: 0
        }
      },
      disk: {
        usage: 0, // Would need to implement disk usage monitoring
        free: 0,
        total: 0
      },
      uptime: process.uptime()
    };
  }

  /**
   * Collect application metrics
   */
  private collectApplicationMetrics(): ApplicationMetrics {
    const now = Date.now();
    const timeDiff = (now - this.requestCounters.lastRequestTime) / 1000;
    const requestRate = timeDiff > 0 ? this.requestCounters.lastSecondRequests / timeDiff : 0;

    const responseTimes = this.requestCounters.responseTimes;
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    
    const p95Index = Math.ceil(sortedTimes.length * 0.95) - 1;
    const p99Index = Math.ceil(sortedTimes.length * 0.99) - 1;

    const totalErrors = Array.from(this.errorCounters.values()).reduce((sum, count) => sum + count, 0);
    const errorRate = this.requestCounters.total > 0 ? 
      (totalErrors / this.requestCounters.total) * 100 : 0;

    this.requestCounters.lastSecondRequests = 0;
    this.requestCounters.lastRequestTime = now;

    return {
      timestamp: new Date(),
      requests: {
        total: this.requestCounters.total,
        successful: this.requestCounters.successful,
        failed: this.requestCounters.failed,
        rate: requestRate
      },
      response: {
        averageTime: responseTimes.length > 0 ? 
          responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0,
        p95: sortedTimes[p95Index] || 0,
        p99: sortedTimes[p99Index] || 0
      },
      database: {
        connections: 0, // Would integrate with database monitoring
        queries: 0,
        slowQueries: 0,
        averageQueryTime: 0
      },
      websockets: {
        connections: 0, // Would integrate with socket monitoring
        messagesPerSecond: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      errors: {
        count: totalErrors,
        rate: errorRate,
        byType: Object.fromEntries(this.errorCounters)
      }
    };
  }

  /**
   * Collect business metrics
   */
  private async collectBusinessMetrics(): Promise<BusinessMetrics> {
    // Mock implementation - would integrate with actual business logic
    return {
      timestamp: new Date(),
      users: {
        active: Math.floor(Math.random() * 1000) + 100,
        registered: Math.floor(Math.random() * 10000) + 1000,
        registrationsToday: Math.floor(Math.random() * 50) + 5
      },
      quizzes: {
        created: Math.floor(Math.random() * 5000) + 500,
        active: Math.floor(Math.random() * 100) + 10,
        completedToday: Math.floor(Math.random() * 200) + 20
      },
      questions: {
        total: Math.floor(Math.random() * 50000) + 5000,
        createdToday: Math.floor(Math.random() * 100) + 10,
        aiGenerated: Math.floor(Math.random() * 1000) + 100
      },
      sessions: {
        active: Math.floor(Math.random() * 200) + 20,
        totalDuration: Math.floor(Math.random() * 100000) + 10000,
        averageDuration: Math.floor(Math.random() * 600) + 120
      },
      engagement: {
        averageSessionTime: Math.floor(Math.random() * 600) + 120,
        questionsPerSession: Math.floor(Math.random() * 20) + 5,
        userRetention: Math.random() * 0.3 + 0.7
      }
    };
  }

  /**
   * Check system alerts
   */
  private checkSystemAlerts(metrics: SystemMetrics): void {
    // CPU usage alert
    if (metrics.cpu.usage > this.config.alerts.thresholds.cpuUsage) {
      this.createAlert('critical', 'High CPU Usage', 
        `CPU usage is ${metrics.cpu.usage.toFixed(2)}%`, 
        'cpu_usage', metrics.cpu.usage, this.config.alerts.thresholds.cpuUsage);
    }

    // Memory usage alert
    if (metrics.memory.usage > this.config.alerts.thresholds.memoryUsage) {
      this.createAlert('critical', 'High Memory Usage',
        `Memory usage is ${metrics.memory.usage.toFixed(2)}%`,
        'memory_usage', metrics.memory.usage, this.config.alerts.thresholds.memoryUsage);
    }
  }

  /**
   * Check application alerts
   */
  private checkApplicationAlerts(metrics: ApplicationMetrics): void {
    // Error rate alert
    if (metrics.errors.rate > this.config.alerts.thresholds.errorRate) {
      this.createAlert('error', 'High Error Rate',
        `Error rate is ${metrics.errors.rate.toFixed(2)}%`,
        'error_rate', metrics.errors.rate, this.config.alerts.thresholds.errorRate);
    }
  }

  /**
   * Check response time alert
   */
  private checkResponseTimeAlert(responseTime: number): void {
    if (responseTime > this.config.alerts.thresholds.responseTime) {
      this.createAlert('warning', 'High Response Time',
        `Response time is ${responseTime}ms`,
        'response_time', responseTime, this.config.alerts.thresholds.responseTime);
    }
  }

  /**
   * Check error rate alert
   */
  private checkErrorRateAlert(): void {
    const totalErrors = Array.from(this.errorCounters.values()).reduce((sum, count) => sum + count, 0);
    const errorRate = this.requestCounters.total > 0 ? 
      (totalErrors / this.requestCounters.total) * 100 : 0;

    if (errorRate > this.config.alerts.thresholds.errorRate) {
      this.createAlert('error', 'High Error Rate',
        `Error rate is ${errorRate.toFixed(2)}%`,
        'error_rate', errorRate, this.config.alerts.thresholds.errorRate);
    }
  }

  /**
   * Create alert
   */
  private createAlert(level: Alert['level'], title: string, description: string, 
                     metric: string, value: number, threshold: number): void {
    // Check if similar alert already exists
    const existingAlert = this.alerts.find(alert => 
      alert.metric === metric && 
      !alert.acknowledged && 
      !alert.resolvedAt &&
      Math.abs(alert.value - value) < (threshold * 0.1) // Within 10% of threshold
    );

    if (existingAlert) {
      return; // Don't create duplicate alerts
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level,
      title,
      description,
      metric,
      value,
      threshold,
      timestamp: new Date(),
      acknowledged: false,
      tags: ['automated', level]
    };

    this.alerts.push(alert);

    logger.warn('Alert created', {
      component: 'MonitoringService',
      alert: {
        id: alert.id,
        level: alert.level,
        title: alert.title,
        metric: alert.metric,
        value: alert.value
      }
    });

    this.emit('alertCreated', { alert });
  }

  /**
   * Get CPU usage (simplified)
   */
  private getCpuUsage(): number {
    // Simplified CPU usage - in production would use proper CPU monitoring
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    return Math.min(100, (loadAvg / cpuCount) * 100);
  }

  /**
   * Calculate system health score
   */
  private calculateSystemHealth(cpuUsage: number, memoryUsage: number): number {
    const cpuScore = Math.max(0, 100 - cpuUsage);
    const memoryScore = Math.max(0, 100 - memoryUsage);
    return (cpuScore + memoryScore) / 2;
  }

  /**
   * Calculate application health score
   */
  private calculateApplicationHealth(responseTime: number, errors: number, requests: number): number {
    const responseScore = Math.max(0, 100 - (responseTime / 50)); // 5000ms = 0 score
    const errorRate = requests > 0 ? (errors / requests) * 100 : 0;
    const errorScore = Math.max(0, 100 - (errorRate * 10));
    return (responseScore + errorScore) / 2;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(history: any, alerts: Alert[]): string[] {
    const recommendations: string[] = [];

    if (alerts.some(a => a.metric === 'cpu_usage')) {
      recommendations.push('Consider scaling up CPU resources or optimizing performance');
    }

    if (alerts.some(a => a.metric === 'memory_usage')) {
      recommendations.push('Monitor memory leaks and consider increasing memory allocation');
    }

    if (alerts.some(a => a.metric === 'error_rate')) {
      recommendations.push('Investigate recent code changes and error patterns');
    }

    if (alerts.some(a => a.metric === 'response_time')) {
      recommendations.push('Optimize slow queries and consider caching strategies');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is performing well within normal parameters');
    }

    return recommendations;
  }

  /**
   * Clean up old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - (this.config.collection.retention * 24 * 60 * 60 * 1000));
    
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp >= cutoff);
    this.applicationMetrics = this.applicationMetrics.filter(m => m.timestamp >= cutoff);
    this.businessMetrics = this.businessMetrics.filter(m => m.timestamp >= cutoff);

    logger.debug('Cleaned up old metrics', {
      component: 'MonitoringService',
      cutoff,
      remaining: {
        system: this.systemMetrics.length,
        application: this.applicationMetrics.length,
        business: this.businessMetrics.length
      }
    });
  }

  /**
   * Resolve stale alerts
   */
  private resolveStaleAlerts(): void {
    const cutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours
    
    this.alerts.forEach(alert => {
      if (!alert.resolvedAt && alert.timestamp < cutoff) {
        alert.resolvedAt = new Date();
        logger.info('Auto-resolved stale alert', {
          component: 'MonitoringService',
          alertId: alert.id,
          age: Date.now() - alert.timestamp.getTime()
        });
      }
    });
  }
}

export interface MonitoringReport {
  period: {
    hours: number;
    from: Date;
    to: Date;
  };
  system: {
    averageCpuUsage: number;
    averageMemoryUsage: number;
    uptime: number;
    health: number;
  };
  application: {
    totalRequests: number;
    totalErrors: number;
    averageResponseTime: number;
    errorRate: number;
    health: number;
  };
  business: {
    activeUsers: number;
    totalQuizzes: number;
    averageEngagement: number;
  };
  alerts: {
    active: number;
    critical: number;
    warning: number;
  };
  recommendations: string[];
}

export default MonitoringService;

