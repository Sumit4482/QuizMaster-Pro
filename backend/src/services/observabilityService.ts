import { EventEmitter } from 'events';
import { MonitoringService, SystemMetrics, ApplicationMetrics, Alert } from './monitoringService';
import { AnalyticsService, UserEvent, BusinessMetrics } from './analyticsService';
import { logger } from '../config/logger';

export interface ObservabilityDashboard {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  refreshInterval: number; // seconds
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'alert' | 'table' | 'gauge';
  title: string;
  dataSource: 'monitoring' | 'analytics' | 'business';
  query: string;
  position: { x: number; y: number; w: number; h: number };
  config: {
    chartType?: 'line' | 'bar' | 'pie' | 'area';
    timeRange?: string;
    aggregation?: 'avg' | 'sum' | 'count' | 'max' | 'min';
    thresholds?: { warning: number; critical: number };
  };
}

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'application' | 'business' | 'custom';
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  unit: string;
  tags: string[];
  aggregations: string[];
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  component: string;
  message: string;
  metadata?: Record<string, any>;
  traceId?: string;
  spanId?: string;
}

export interface Trace {
  traceId: string;
  spans: Span[];
  duration: number;
  status: 'success' | 'error';
  startTime: Date;
  endTime: Date;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  tags: Record<string, any>;
  status: 'success' | 'error';
  logs: SpanLog[];
}

export interface SpanLog {
  timestamp: Date;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface ObservabilityMetrics {
  timestamp: Date;
  system: {
    health: number;
    alerts: number;
    uptime: number;
  };
  application: {
    throughput: number;
    errorRate: number;
    responseTime: number;
  };
  business: {
    activeUsers: number;
    revenue: number;
    engagement: number;
  };
  observability: {
    metricsCollected: number;
    alertsTriggered: number;
    tracesGenerated: number;
    logVolume: number;
  };
}

/**
 * Phase 4.1: Observability Service
 * 
 * Unified observability platform combining monitoring, analytics,
 * logging, tracing, and alerting
 */
export class ObservabilityService extends EventEmitter {
  private static instance: ObservabilityService | null = null;
  
  private monitoringService: MonitoringService;
  private analyticsService: AnalyticsService;
  
  private dashboards: Map<string, ObservabilityDashboard> = new Map();
  private metrics: Map<string, MetricDefinition> = new Map();
  private logs: LogEntry[] = [];
  private traces: Map<string, Trace> = new Map();
  
  private isInitialized = false;

  private constructor() {
    super();
    this.monitoringService = MonitoringService.getInstance();
    this.analyticsService = AnalyticsService.getInstance();
    this.initializeObservability();
  }

  public static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  /**
   * Initialize observability system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Observability service already initialized');
      return;
    }

    try {
      logger.info('🔍 Initializing observability service');

      // Start monitoring collection
      this.monitoringService.startCollection();

      // Set up event listeners
      this.setupEventListeners();

      // Create default dashboards
      await this.createDefaultDashboards();

      // Initialize metrics definitions
      this.initializeMetricDefinitions();

      this.isInitialized = true;

      logger.info('✅ Observability service initialized successfully');
      this.emit('initialized');

    } catch (error) {
      logger.error('❌ Failed to initialize observability service', {
        component: 'ObservabilityService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Create custom dashboard
   */
  public async createDashboard(
    name: string,
    description: string,
    widgets: DashboardWidget[]
  ): Promise<ObservabilityDashboard> {
    const dashboard: ObservabilityDashboard = {
      id: `dash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      widgets,
      refreshInterval: 30,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.dashboards.set(dashboard.id, dashboard);

    logger.info('📊 Dashboard created', {
      component: 'ObservabilityService',
      dashboardId: dashboard.id,
      name,
      widgetCount: widgets.length
    });

    this.emit('dashboardCreated', { dashboard });
    return dashboard;
  }

  /**
   * Get dashboard data
   */
  public async getDashboardData(dashboardId: string): Promise<{
    dashboard: ObservabilityDashboard;
    data: { [widgetId: string]: any };
  }> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    const data: { [widgetId: string]: any } = {};

    // Collect data for each widget
    for (const widget of dashboard.widgets) {
      try {
        data[widget.id] = await this.getWidgetData(widget);
      } catch (error) {
        logger.error('Failed to get widget data', {
          component: 'ObservabilityService',
          widgetId: widget.id,
          error
        });
        data[widget.id] = null;
      }
    }

    return { dashboard, data };
  }

  /**
   * Get system health overview
   */
  public async getSystemHealthOverview(): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    score: number;
    components: {
      system: { status: string; score: number };
      application: { status: string; score: number };
      business: { status: string; score: number };
    };
    alerts: Alert[];
    uptime: number;
  }> {
    const systemMetrics = this.monitoringService.getCurrentSystemMetrics();
    const appMetrics = this.monitoringService.getCurrentApplicationMetrics();
    const businessMetrics = await this.analyticsService.generateBusinessMetrics({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date()
    });
    const alerts = this.monitoringService.getActiveAlerts();

    // Calculate component health scores
    const systemScore = this.calculateSystemHealthScore(systemMetrics);
    const appScore = this.calculateApplicationHealthScore(appMetrics);
    const businessScore = this.calculateBusinessHealthScore(businessMetrics);

    const overallScore = (systemScore + appScore + businessScore) / 3;
    
    let status: 'healthy' | 'degraded' | 'critical';
    if (overallScore >= 80) status = 'healthy';
    else if (overallScore >= 60) status = 'degraded';
    else status = 'critical';

    return {
      status,
      score: overallScore,
      components: {
        system: {
          status: systemScore >= 80 ? 'healthy' : systemScore >= 60 ? 'degraded' : 'critical',
          score: systemScore
        },
        application: {
          status: appScore >= 80 ? 'healthy' : appScore >= 60 ? 'degraded' : 'critical',
          score: appScore
        },
        business: {
          status: businessScore >= 80 ? 'healthy' : businessScore >= 60 ? 'degraded' : 'critical',
          score: businessScore
        }
      },
      alerts,
      uptime: systemMetrics.uptime
    };
  }

  /**
   * Start distributed trace
   */
  public startTrace(operationName: string, metadata?: Record<string, any>): string {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const trace: Trace = {
      traceId,
      spans: [{
        spanId,
        operationName,
        startTime: new Date(),
        endTime: new Date(),
        duration: 0,
        tags: metadata || {},
        status: 'success',
        logs: []
      }],
      duration: 0,
      status: 'success',
      startTime: new Date(),
      endTime: new Date()
    };

    this.traces.set(traceId, trace);
    
    logger.debug('Trace started', {
      component: 'ObservabilityService',
      traceId,
      operationName
    });

    return traceId;
  }

  /**
   * End trace
   */
  public endTrace(traceId: string, status: 'success' | 'error' = 'success'): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      logger.warn('Trace not found', { traceId });
      return;
    }

    const endTime = new Date();
    trace.endTime = endTime;
    trace.duration = endTime.getTime() - trace.startTime.getTime();
    trace.status = status;

    // Update root span
    if (trace.spans.length > 0) {
      const rootSpan = trace.spans[0];
      rootSpan.endTime = endTime;
      rootSpan.duration = trace.duration;
      rootSpan.status = status;
    }

    logger.debug('Trace ended', {
      component: 'ObservabilityService',
      traceId,
      duration: trace.duration,
      status
    });

    this.emit('traceCompleted', { trace });
  }

  /**
   * Add span to trace
   */
  public addSpan(
    traceId: string,
    operationName: string,
    parentSpanId?: string,
    metadata?: Record<string, any>
  ): string {
    const trace = this.traces.get(traceId);
    if (!trace) {
      logger.warn('Trace not found for span', { traceId });
      return '';
    }

    const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const span: Span = {
      spanId,
      parentSpanId,
      operationName,
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      tags: metadata || {},
      status: 'success',
      logs: []
    };

    trace.spans.push(span);
    return spanId;
  }

  /**
   * Log structured entry
   */
  public log(
    level: LogEntry['level'],
    component: string,
    message: string,
    metadata?: Record<string, any>,
    traceId?: string,
    spanId?: string
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      message,
      metadata,
      traceId,
      spanId
    };

    this.logs.push(logEntry);

    // Keep only last 10000 logs in memory
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-10000);
    }

    // Add to span if trace context exists
    if (traceId && spanId) {
      this.addLogToSpan(traceId, spanId, {
        timestamp: logEntry.timestamp,
        message,
        level: level === 'debug' || level === 'info' ? 'info' : 
               level === 'warn' ? 'warn' : 'error'
      });
    }

    this.emit('logEntry', { logEntry });
  }

  /**
   * Query logs
   */
  public queryLogs(
    filters: {
      level?: LogEntry['level'][];
      component?: string;
      timeRange?: { start: Date; end: Date };
      search?: string;
      limit?: number;
    } = {}
  ): LogEntry[] {
    let filteredLogs = [...this.logs];

    if (filters.level) {
      filteredLogs = filteredLogs.filter(log => filters.level!.includes(log.level));
    }

    if (filters.component) {
      filteredLogs = filteredLogs.filter(log => log.component === filters.component);
    }

    if (filters.timeRange) {
      filteredLogs = filteredLogs.filter(log => 
        log.timestamp >= filters.timeRange!.start && 
        log.timestamp <= filters.timeRange!.end
      );
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(search) ||
        log.component.toLowerCase().includes(search)
      );
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters.limit) {
      filteredLogs = filteredLogs.slice(0, filters.limit);
    }

    return filteredLogs;
  }

  /**
   * Get observability metrics
   */
  public async getObservabilityMetrics(): Promise<ObservabilityMetrics> {
    const systemMetrics = this.monitoringService.getCurrentSystemMetrics();
    const appMetrics = this.monitoringService.getCurrentApplicationMetrics();
    const businessMetrics = await this.analyticsService.generateBusinessMetrics({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date()
    });
    const alerts = this.monitoringService.getActiveAlerts();

    return {
      timestamp: new Date(),
      system: {
        health: this.calculateSystemHealthScore(systemMetrics),
        alerts: alerts.length,
        uptime: systemMetrics.uptime
      },
      application: {
        throughput: appMetrics.requests.rate,
        errorRate: appMetrics.errors.rate,
        responseTime: appMetrics.response.averageTime
      },
      business: {
        activeUsers: businessMetrics.userEngagement.dailyActiveUsers,
        revenue: businessMetrics.revenue.mrr,
        engagement: businessMetrics.userEngagement.sessionFrequency
      },
      observability: {
        metricsCollected: this.metrics.size,
        alertsTriggered: alerts.length,
        tracesGenerated: this.traces.size,
        logVolume: this.logs.length
      }
    };
  }

  /**
   * Initialize observability system
   */
  private initializeObservability(): void {
    logger.info('🔍 Initializing observability infrastructure');

    // Set up log cleanup
    setInterval(() => {
      this.cleanupOldLogs();
    }, 1000 * 60 * 60); // Every hour

    // Set up trace cleanup
    setInterval(() => {
      this.cleanupOldTraces();
    }, 1000 * 60 * 30); // Every 30 minutes
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen to monitoring events
    this.monitoringService.on('alertCreated', (event) => {
      this.log('warn', 'MonitoringService', 
        `Alert created: ${event.alert.title}`, 
        { alert: event.alert });
    });

    this.monitoringService.on('metricsCollected', (event) => {
      this.emit('metricsUpdate', event);
    });

    // Listen to analytics events
    this.analyticsService.on('eventTracked', (event) => {
      this.log('debug', 'AnalyticsService',
        `Event tracked: ${event.event.eventType}`,
        { eventData: event.event });
    });
  }

  /**
   * Create default dashboards
   */
  private async createDefaultDashboards(): Promise<void> {
    // System Overview Dashboard
    const systemDashboard = await this.createDashboard(
      'System Overview',
      'High-level system health and performance metrics',
      [
        {
          id: 'cpu_usage',
          type: 'gauge',
          title: 'CPU Usage',
          dataSource: 'monitoring',
          query: 'system.cpu.usage',
          position: { x: 0, y: 0, w: 3, h: 3 },
          config: {
            thresholds: { warning: 70, critical: 90 }
          }
        },
        {
          id: 'memory_usage',
          type: 'gauge',
          title: 'Memory Usage',
          dataSource: 'monitoring',
          query: 'system.memory.usage',
          position: { x: 3, y: 0, w: 3, h: 3 },
          config: {
            thresholds: { warning: 80, critical: 95 }
          }
        },
        {
          id: 'response_time',
          type: 'chart',
          title: 'Response Time',
          dataSource: 'monitoring',
          query: 'application.response.averageTime',
          position: { x: 0, y: 3, w: 6, h: 3 },
          config: {
            chartType: 'line',
            timeRange: '1h'
          }
        }
      ]
    );

    // Business Metrics Dashboard
    const businessDashboard = await this.createDashboard(
      'Business Metrics',
      'Key business and user engagement metrics',
      [
        {
          id: 'active_users',
          type: 'metric',
          title: 'Daily Active Users',
          dataSource: 'business',
          query: 'userEngagement.dailyActiveUsers',
          position: { x: 0, y: 0, w: 2, h: 2 },
          config: {}
        },
        {
          id: 'user_growth',
          type: 'chart',
          title: 'User Growth',
          dataSource: 'business',
          query: 'userAcquisition.newUsers',
          position: { x: 2, y: 0, w: 4, h: 3 },
          config: {
            chartType: 'area',
            timeRange: '7d'
          }
        }
      ]
    );

    logger.info('📊 Default dashboards created', {
      component: 'ObservabilityService',
      dashboards: [systemDashboard.id, businessDashboard.id]
    });
  }

  /**
   * Initialize metric definitions
   */
  private initializeMetricDefinitions(): void {
    const metrics: MetricDefinition[] = [
      {
        id: 'system_cpu_usage',
        name: 'CPU Usage',
        description: 'System CPU utilization percentage',
        category: 'system',
        type: 'gauge',
        unit: 'percent',
        tags: ['system', 'performance'],
        aggregations: ['avg', 'max']
      },
      {
        id: 'http_requests_total',
        name: 'HTTP Requests Total',
        description: 'Total number of HTTP requests',
        category: 'application',
        type: 'counter',
        unit: 'requests',
        tags: ['http', 'requests'],
        aggregations: ['sum', 'rate']
      },
      {
        id: 'active_users',
        name: 'Active Users',
        description: 'Number of active users',
        category: 'business',
        type: 'gauge',
        unit: 'users',
        tags: ['users', 'engagement'],
        aggregations: ['count', 'avg']
      }
    ];

    metrics.forEach(metric => {
      this.metrics.set(metric.id, metric);
    });

    logger.info('📊 Metric definitions initialized', {
      component: 'ObservabilityService',
      count: metrics.length
    });
  }

  /**
   * Get widget data
   */
  private async getWidgetData(widget: DashboardWidget): Promise<any> {
    switch (widget.dataSource) {
      case 'monitoring':
        return this.getMonitoringData(widget.query, widget.config);
      case 'analytics':
        return this.getAnalyticsData(widget.query, widget.config);
      case 'business':
        return this.getBusinessData(widget.query, widget.config);
      default:
        return null;
    }
  }

  /**
   * Get monitoring data
   */
  private async getMonitoringData(query: string, config: any): Promise<any> {
    const systemMetrics = this.monitoringService.getCurrentSystemMetrics();
    const appMetrics = this.monitoringService.getCurrentApplicationMetrics();
    
    switch (query) {
      case 'system.cpu.usage':
        return systemMetrics.cpu.usage;
      case 'system.memory.usage':
        return systemMetrics.memory.usage;
      case 'application.response.averageTime':
        const history = this.monitoringService.getMetricsHistory(1);
        return history.application.map(m => ({
          timestamp: m.timestamp,
          value: m.response.averageTime
        }));
      default:
        return null;
    }
  }

  /**
   * Get analytics data
   */
  private async getAnalyticsData(query: string, config: any): Promise<any> {
    // Mock implementation - would query actual analytics data
    return { value: Math.random() * 100 };
  }

  /**
   * Get business data
   */
  private async getBusinessData(query: string, config: any): Promise<any> {
    const businessMetrics = await this.analyticsService.generateBusinessMetrics({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date()
    });

    switch (query) {
      case 'userEngagement.dailyActiveUsers':
        return businessMetrics.userEngagement.dailyActiveUsers;
      case 'userAcquisition.newUsers':
        return businessMetrics.userAcquisition.newUsers;
      default:
        return null;
    }
  }

  /**
   * Calculate system health score
   */
  private calculateSystemHealthScore(metrics: SystemMetrics): number {
    const cpuScore = Math.max(0, 100 - metrics.cpu.usage);
    const memoryScore = Math.max(0, 100 - metrics.memory.usage);
    return (cpuScore + memoryScore) / 2;
  }

  /**
   * Calculate application health score
   */
  private calculateApplicationHealthScore(metrics: ApplicationMetrics): number {
    const responseScore = Math.max(0, 100 - (metrics.response.averageTime / 50));
    const errorScore = Math.max(0, 100 - (metrics.errors.rate * 10));
    return (responseScore + errorScore) / 2;
  }

  /**
   * Calculate business health score
   */
  private calculateBusinessHealthScore(metrics: BusinessMetrics): number {
    const growthScore = Math.max(0, Math.min(100, metrics.userAcquisition.growthRate + 50));
    const engagementScore = metrics.userEngagement.sessionFrequency * 20;
    return (growthScore + engagementScore) / 2;
  }

  /**
   * Add log to span
   */
  private addLogToSpan(traceId: string, spanId: string, log: SpanLog): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    const span = trace.spans.find(s => s.spanId === spanId);
    if (!span) return;

    span.logs.push(log);
  }

  /**
   * Clean up old logs
   */
  private cleanupOldLogs(): void {
    const cutoff = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 7 days
    const originalLength = this.logs.length;
    
    this.logs = this.logs.filter(log => log.timestamp >= cutoff);
    
    if (this.logs.length < originalLength) {
      logger.debug('Cleaned up old logs', {
        component: 'ObservabilityService',
        removed: originalLength - this.logs.length,
        remaining: this.logs.length
      });
    }
  }

  /**
   * Clean up old traces
   */
  private cleanupOldTraces(): void {
    const cutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours
    const originalSize = this.traces.size;
    
    this.traces.forEach((trace, traceId) => {
      if (trace.endTime < cutoff) {
        this.traces.delete(traceId);
      }
    });
    
    if (this.traces.size < originalSize) {
      logger.debug('Cleaned up old traces', {
        component: 'ObservabilityService',
        removed: originalSize - this.traces.size,
        remaining: this.traces.size
      });
    }
  }
}

export default ObservabilityService;

