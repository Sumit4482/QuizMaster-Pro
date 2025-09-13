import { Request, Response } from 'express';
import { AnalyticsService } from './analyticsService';
import { logger } from '../../utils/logger';
import { 
  successResponse, 
  errorResponse,
  badRequestResponse
} from '../../utils/responseUtils';
import { AuthenticatedRequest } from '../../types/auth';

export class AnalyticsController {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  /**
   * Track user event
   */
  public trackEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { eventType, eventCategory, eventAction, eventLabel, eventValue, properties } = req.body;

      if (!eventType || !eventCategory || !eventAction) {
        badRequestResponse(res, 'eventType, eventCategory, and eventAction are required');
        return;
      }

      const userId = (req as AuthenticatedRequest).user?.id;
      const sessionId = req.headers['x-session-id'] as string;

      await this.analyticsService.trackEvent({
        userId,
        sessionId,
        eventType,
        eventCategory,
        eventAction,
        eventLabel,
        eventValue,
        properties,
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          source: req.get('X-Source') || 'web'
        }
      });

      successResponse(res, {}, 'Event tracked successfully', 201);
    } catch (error) {
      logger.error('Track event failed', {
        component: 'AnalyticsController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to track event');
    }
  };

  /**
   * Record metric
   */
  public recordMetric = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, value, unit, tags } = req.body;

      if (!name || value === undefined) {
        badRequestResponse(res, 'name and value are required');
        return;
      }

      await this.analyticsService.recordMetric({
        name,
        value,
        unit,
        tags
      });

      successResponse(res, {}, 'Metric recorded successfully', 201);
    } catch (error) {
      logger.error('Record metric failed', {
        component: 'AnalyticsController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to record metric');
    }
  };

  /**
   * Get user analytics
   */
  public getUserAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!userId) {
        badRequestResponse(res, 'User ID is required');
        return;
      }

      const timeRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      const analytics = await this.analyticsService.getUserAnalytics(userId, timeRange);

      successResponse(res, analytics, 'User analytics retrieved successfully');
    } catch (error) {
      logger.error('Get user analytics failed', {
        component: 'AnalyticsController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to get user analytics');
    }
  };

  /**
   * Get system metrics
   */
  public getSystemMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate } = req.query;

      const timeRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      const metrics = await this.analyticsService.getSystemMetrics(timeRange);

      successResponse(res, metrics, 'System metrics retrieved successfully');
    } catch (error) {
      logger.error('Get system metrics failed', {
        component: 'AnalyticsController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to get system metrics');
    }
  };

  /**
   * Generate analytics report
   */
  public generateReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { type, filters, groupBy, aggregations, format, timeRange } = req.body;

      if (!type) {
        badRequestResponse(res, 'Report type is required');
        return;
      }

      if (!['user', 'system', 'content', 'engagement', 'performance'].includes(type)) {
        badRequestResponse(res, 'Invalid report type');
        return;
      }

      const report = await this.analyticsService.generateReport({
        type,
        filters,
        groupBy,
        aggregations,
        format,
        timeRange: timeRange ? {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end),
          granularity: timeRange.granularity
        } : undefined
      });

      logger.info('Analytics report generated successfully', {
        component: 'AnalyticsController',
        reportType: type,
        userId: req.user?.id,
        recordCount: report.data.length
      });

      successResponse(res, report, 'Report generated successfully', 201);
    } catch (error) {
      logger.error('Generate report failed', {
        component: 'AnalyticsController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to generate report');
    }
  };

  /**
   * Health check for analytics service
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.analyticsService.healthCheck();

      if (health.status === 'healthy') {
        successResponse(res, health, 'Analytics service is healthy');
      } else {
        errorResponse(res, 'Analytics service is unhealthy', 503, health);
      }
    } catch (error) {
      logger.error('Analytics service health check failed', {
        component: 'AnalyticsController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Analytics service is unhealthy', 503);
    }
  };
}

export default AnalyticsController;

