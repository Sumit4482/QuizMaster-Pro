import { Request, Response } from 'express';
import { MonitoringService } from '../services/monitoringService';
import { AnalyticsService } from '../services/analyticsService';
import { ObservabilityService } from '../services/observabilityService';
import { logger } from '../utils/logger';

/**
 * Phase 4.1: Monitoring and Analytics Controller
 * 
 * Comprehensive monitoring, analytics, and observability endpoints
 */
export class MonitoringController {
  private monitoringService: MonitoringService;
  private analyticsService: AnalyticsService;
  private observabilityService: ObservabilityService;

  constructor() {
    this.monitoringService = MonitoringService.getInstance();
    this.analyticsService = AnalyticsService.getInstance();
    this.observabilityService = ObservabilityService.getInstance();
  }

  /**
   * Get system health overview
   */
  public async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const healthOverview = await this.observabilityService.getSystemHealthOverview();

      res.status(200).json({
        success: true,
        data: healthOverview
      });

    } catch (error) {
      logger.error('❌ Failed to get system health', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system health',
        code: 'HEALTH_CHECK_FAILED'
      });
    }
  }

  /**
   * Get current system metrics
   */
  public async getCurrentSystemMetrics(req: Request, res: Response): Promise<void> {
    try {
      const systemMetrics = this.monitoringService.getCurrentSystemMetrics();
      const applicationMetrics = this.monitoringService.getCurrentApplicationMetrics();

      res.status(200).json({
        success: true,
        data: {
          system: systemMetrics,
          application: applicationMetrics,
          timestamp: new Date()
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get current metrics', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve current metrics',
        code: 'METRICS_FAILED'
      });
    }
  }

  /**
   * Get metrics history
   */
  public async getMetricsHistory(req: Request, res: Response): Promise<void> {
    try {
      const { hours = 24 } = req.query;
      const hoursNum = parseInt(hours as string, 10);

      if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 168) {
        res.status(400).json({
          success: false,
          error: 'Hours must be a number between 1 and 168 (7 days)',
          code: 'INVALID_HOURS'
        });
        return;
      }

      const history = this.monitoringService.getMetricsHistory(hoursNum);

      res.status(200).json({
        success: true,
        data: {
          ...history,
          period: {
            hours: hoursNum,
            from: new Date(Date.now() - hoursNum * 60 * 60 * 1000),
            to: new Date()
          }
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get metrics history', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metrics history',
        code: 'HISTORY_FAILED'
      });
    }
  }

  /**
   * Get active alerts
   */
  public async getActiveAlerts(req: Request, res: Response): Promise<void> {
    try {
      const alerts = this.monitoringService.getActiveAlerts();

      res.status(200).json({
        success: true,
        data: {
          alerts,
          summary: {
            total: alerts.length,
            critical: alerts.filter(a => a.level === 'critical').length,
            error: alerts.filter(a => a.level === 'error').length,
            warning: alerts.filter(a => a.level === 'warning').length,
            info: alerts.filter(a => a.level === 'info').length
          }
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get active alerts', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alerts',
        code: 'ALERTS_FAILED'
      });
    }
  }

  /**
   * Acknowledge alert
   */
  public async acknowledgeAlert(req: Request, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;
      const userId = (req as any).user.id;

      if (!alertId) {
        res.status(400).json({
          success: false,
          error: 'Alert ID is required',
          code: 'MISSING_ALERT_ID'
        });
        return;
      }

      this.monitoringService.acknowledgeAlert(alertId, userId);

      res.status(200).json({
        success: true,
        message: 'Alert acknowledged successfully',
        data: { alertId, acknowledgedBy: userId }
      });

    } catch (error) {
      logger.error('❌ Failed to acknowledge alert', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert',
        code: 'ACKNOWLEDGE_FAILED'
      });
    }
  }

  /**
   * Generate monitoring report
   */
  public async generateMonitoringReport(req: Request, res: Response): Promise<void> {
    try {
      const { hours = 24 } = req.body;
      const hoursNum = parseInt(hours as string, 10) || 24;

      const report = this.monitoringService.generateReport(hoursNum);

      res.status(200).json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('❌ Failed to generate monitoring report', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate monitoring report',
        code: 'REPORT_FAILED'
      });
    }
  }

  /**
   * Track analytics event
   */
  public async trackEvent(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const {
        sessionId,
        eventType,
        eventCategory,
        properties = {},
        metadata
      } = req.body;

      if (!sessionId || !eventType || !eventCategory) {
        res.status(400).json({
          success: false,
          error: 'sessionId, eventType, and eventCategory are required',
          code: 'MISSING_REQUIRED_FIELDS'
        });
        return;
      }

      this.analyticsService.trackEvent(
        userId,
        sessionId,
        eventType,
        eventCategory,
        properties,
        metadata
      );

      res.status(200).json({
        success: true,
        message: 'Event tracked successfully'
      });

    } catch (error) {
      logger.error('❌ Failed to track analytics event', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to track event',
        code: 'TRACKING_FAILED'
      });
    }
  }

  /**
   * Get quiz analytics
   */
  public async getQuizAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { quizId } = req.params;
      const { startDate, endDate } = req.query;

      let period: { start: Date; end: Date } | undefined;
      
      if (startDate && endDate) {
        period = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };

        if (isNaN(period.start.getTime()) || isNaN(period.end.getTime())) {
          res.status(400).json({
            success: false,
            error: 'Invalid date format',
            code: 'INVALID_DATE'
          });
          return;
        }
      }

      const analytics = await this.analyticsService.getQuizAnalytics(quizId, period);

      res.status(200).json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('❌ Failed to get quiz analytics', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve quiz analytics',
        code: 'ANALYTICS_FAILED'
      });
    }
  }

  /**
   * Get user behavior patterns
   */
  public async getUserBehaviorPatterns(req: Request, res: Response): Promise<void> {
    try {
      const { userId: targetUserId } = req.params;
      const requestingUserId = (req as any).user.id;
      const userRole = (req as any).user.role;

      // Users can only access their own patterns, unless they're admin
      if (targetUserId !== requestingUserId && userRole !== 'ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
        return;
      }

      const patterns = await this.analyticsService.getUserBehaviorPatterns(targetUserId);

      res.status(200).json({
        success: true,
        data: patterns
      });

    } catch (error) {
      logger.error('❌ Failed to get user behavior patterns', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user behavior patterns',
        code: 'PATTERNS_FAILED'
      });
    }
  }

  /**
   * Get business metrics
   */
  public async getBusinessMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      // Default to last 30 days if no period specified
      const defaultEnd = new Date();
      const defaultStart = new Date(defaultEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

      let period = { start: defaultStart, end: defaultEnd };

      if (startDate && endDate) {
        period = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };

        if (isNaN(period.start.getTime()) || isNaN(period.end.getTime())) {
          res.status(400).json({
            success: false,
            error: 'Invalid date format',
            code: 'INVALID_DATE'
          });
          return;
        }
      }

      const metrics = await this.analyticsService.generateBusinessMetrics(period);

      res.status(200).json({
        success: true,
        data: {
          ...metrics,
          period: {
            start: period.start,
            end: period.end,
            days: Math.ceil((period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24))
          }
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get business metrics', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve business metrics',
        code: 'BUSINESS_METRICS_FAILED'
      });
    }
  }

  /**
   * Generate insights report
   */
  public async generateInsightsReport(req: Request, res: Response): Promise<void> {
    try {
      const {
        type = 'business',
        startDate,
        endDate
      } = req.body;

      if (!['user', 'quiz', 'business', 'performance'].includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Type must be one of: user, quiz, business, performance',
          code: 'INVALID_TYPE'
        });
        return;
      }

      // Default to last 7 days if no period specified
      const defaultEnd = new Date();
      const defaultStart = new Date(defaultEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

      let period = { start: defaultStart, end: defaultEnd };

      if (startDate && endDate) {
        period = {
          start: new Date(startDate),
          end: new Date(endDate)
        };

        if (isNaN(period.start.getTime()) || isNaN(period.end.getTime())) {
          res.status(400).json({
            success: false,
            error: 'Invalid date format',
            code: 'INVALID_DATE'
          });
          return;
        }
      }

      const report = await this.analyticsService.generateInsightsReport(type, period);

      res.status(200).json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('❌ Failed to generate insights report', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate insights report',
        code: 'INSIGHTS_FAILED'
      });
    }
  }

  /**
   * Create observability dashboard
   */
  public async createDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { name, description, widgets } = req.body;

      if (!name || !description || !Array.isArray(widgets)) {
        res.status(400).json({
          success: false,
          error: 'name, description, and widgets array are required',
          code: 'MISSING_REQUIRED_FIELDS'
        });
        return;
      }

      const dashboard = await this.observabilityService.createDashboard(name, description, widgets);

      res.status(201).json({
        success: true,
        data: dashboard
      });

    } catch (error) {
      logger.error('❌ Failed to create dashboard', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create dashboard',
        code: 'DASHBOARD_CREATION_FAILED'
      });
    }
  }

  /**
   * Get dashboard data
   */
  public async getDashboardData(req: Request, res: Response): Promise<void> {
    try {
      const { dashboardId } = req.params;

      if (!dashboardId) {
        res.status(400).json({
          success: false,
          error: 'Dashboard ID is required',
          code: 'MISSING_DASHBOARD_ID'
        });
        return;
      }

      const dashboardData = await this.observabilityService.getDashboardData(dashboardId);

      res.status(200).json({
        success: true,
        data: dashboardData
      });

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Dashboard not found',
          code: 'DASHBOARD_NOT_FOUND'
        });
        return;
      }

      logger.error('❌ Failed to get dashboard data', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard data',
        code: 'DASHBOARD_DATA_FAILED'
      });
    }
  }

  /**
   * Query logs
   */
  public async queryLogs(req: Request, res: Response): Promise<void> {
    try {
      const {
        level,
        component,
        startDate,
        endDate,
        search,
        limit = 100
      } = req.query;

      const filters: any = {};

      if (level) {
        const levels = (level as string).split(',');
        filters.level = levels;
      }

      if (component) {
        filters.component = component as string;
      }

      if (startDate && endDate) {
        filters.timeRange = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };

        if (isNaN(filters.timeRange.start.getTime()) || isNaN(filters.timeRange.end.getTime())) {
          res.status(400).json({
            success: false,
            error: 'Invalid date format',
            code: 'INVALID_DATE'
          });
          return;
        }
      }

      if (search) {
        filters.search = search as string;
      }

      const limitNum = parseInt(limit as string, 10);
      if (!isNaN(limitNum) && limitNum > 0 && limitNum <= 1000) {
        filters.limit = limitNum;
      }

      const logs = this.observabilityService.queryLogs(filters);

      res.status(200).json({
        success: true,
        data: {
          logs,
          count: logs.length,
          filters: filters
        }
      });

    } catch (error) {
      logger.error('❌ Failed to query logs', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to query logs',
        code: 'LOG_QUERY_FAILED'
      });
    }
  }

  /**
   * Start distributed trace
   */
  public async startTrace(req: Request, res: Response): Promise<void> {
    try {
      const { operationName, metadata } = req.body;

      if (!operationName) {
        res.status(400).json({
          success: false,
          error: 'Operation name is required',
          code: 'MISSING_OPERATION_NAME'
        });
        return;
      }

      const traceId = this.observabilityService.startTrace(operationName, metadata);

      res.status(200).json({
        success: true,
        data: { traceId, operationName }
      });

    } catch (error) {
      logger.error('❌ Failed to start trace', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to start trace',
        code: 'TRACE_START_FAILED'
      });
    }
  }

  /**
   * End distributed trace
   */
  public async endTrace(req: Request, res: Response): Promise<void> {
    try {
      const { traceId } = req.params;
      const { status = 'success' } = req.body;

      if (!traceId) {
        res.status(400).json({
          success: false,
          error: 'Trace ID is required',
          code: 'MISSING_TRACE_ID'
        });
        return;
      }

      if (!['success', 'error'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Status must be success or error',
          code: 'INVALID_STATUS'
        });
        return;
      }

      this.observabilityService.endTrace(traceId, status);

      res.status(200).json({
        success: true,
        message: 'Trace ended successfully',
        data: { traceId, status }
      });

    } catch (error) {
      logger.error('❌ Failed to end trace', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to end trace',
        code: 'TRACE_END_FAILED'
      });
    }
  }

  /**
   * Get observability metrics
   */
  public async getObservabilityMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await this.observabilityService.getObservabilityMetrics();

      res.status(200).json({
        success: true,
        data: metrics
      });

    } catch (error) {
      logger.error('❌ Failed to get observability metrics', {
        component: 'MonitoringController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve observability metrics',
        code: 'OBSERVABILITY_METRICS_FAILED'
      });
    }
  }
}

export default MonitoringController;

