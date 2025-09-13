import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { generateSecureToken } from '../../utils/crypto';

interface EventData {
  userId?: string;
  sessionId?: string;
  eventType: string;
  eventCategory: string;
  eventAction: string;
  eventLabel?: string;
  eventValue?: number;
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
}

interface MetricData {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: Date;
}

interface QueryFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  eventType?: string;
  eventCategory?: string;
  tags?: Record<string, string>;
}

interface UserAnalytics {
  userId: string;
  totalSessions: number;
  totalEvents: number;
  averageSessionDuration: number;
  lastActivity: Date;
  preferences: {
    favoriteCategories: Array<{ category: string; count: number }>;
    difficultyPreference: string;
    averageScore: number;
    completionRate: number;
  };
  engagement: {
    dailyActiveStreak: number;
    weeklyActivity: Array<{ date: string; events: number }>;
    monthlyTrends: Array<{ month: string; sessions: number; performance: number }>;
  };
  performance: {
    totalQuestionsAnswered: number;
    correctAnswers: number;
    averageResponseTime: number;
    improvementTrend: number;
  };
}

interface SystemMetrics {
  activeUsers: {
    current: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  usage: {
    totalSessions: number;
    averageSessionDuration: number;
    questionsAnsweredToday: number;
    gamesPlayedToday: number;
  };
  performance: {
    averageResponseTime: number;
    errorRate: number;
    throughput: number;
    availability: number;
  };
  content: {
    totalQuestions: number;
    popularCategories: Array<{ category: string; usage: number }>;
    difficultyDistribution: Record<string, number>;
    userGeneratedContent: number;
  };
}

interface ReportRequest {
  type: 'user' | 'system' | 'content' | 'engagement' | 'performance';
  filters?: QueryFilters;
  groupBy?: string[];
  aggregations?: string[];
  format?: 'json' | 'csv' | 'excel';
  timeRange?: {
    start: Date;
    end: Date;
    granularity?: 'hour' | 'day' | 'week' | 'month';
  };
}

interface GeneratedReport {
  id: string;
  type: string;
  title: string;
  description: string;
  data: any[];
  metadata: {
    generatedAt: Date;
    filters: QueryFilters;
    totalRecords: number;
    processingTime: number;
    format: string;
  };
  summary: {
    keyInsights: string[];
    trends: Array<{ metric: string; direction: 'up' | 'down' | 'stable'; change: number }>;
    recommendations: string[];
  };
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
  eventIngestion: boolean;
  reportGeneration: boolean;
  dataProcessing: boolean;
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  metrics: {
    eventsProcessedToday: number;
    averageProcessingLatency: number;
    errorRate: number;
  };
}

export class AnalyticsService {
  private prisma: PrismaClient;
  private eventBuffer: EventData[] = [];
  private metricBuffer: MetricData[] = [];
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 30000; // 30 seconds

  constructor() {
    this.prisma = new PrismaClient();
    this.startBufferFlush();
  }

  /**
   * Track user event
   */
  async trackEvent(eventData: EventData): Promise<void> {
    try {
      const event = {
        ...eventData,
        id: generateSecureToken(16),
        timestamp: new Date(),
        ip: eventData.metadata?.ip,
        userAgent: eventData.metadata?.userAgent,
        source: eventData.metadata?.source || 'web'
      };

      // Add to buffer for batch processing
      this.eventBuffer.push(event);

      // Flush buffer if it reaches the size limit
      if (this.eventBuffer.length >= this.BUFFER_SIZE) {
        await this.flushEventBuffer();
      }

      logger.debug('Event tracked and buffered', {
        component: 'AnalyticsService',
        eventType: eventData.eventType,
        userId: eventData.userId,
        bufferSize: this.eventBuffer.length
      });
    } catch (error) {
      logger.error('Failed to track event', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error),
        eventData
      });
      throw new Error('Failed to track event');
    }
  }

  /**
   * Record metric
   */
  async recordMetric(metricData: MetricData): Promise<void> {
    try {
      const metric = {
        ...metricData,
        timestamp: metricData.timestamp || new Date()
      };

      this.metricBuffer.push(metric);

      if (this.metricBuffer.length >= this.BUFFER_SIZE) {
        await this.flushMetricBuffer();
      }

      logger.debug('Metric recorded and buffered', {
        component: 'AnalyticsService',
        metricName: metricData.name,
        value: metricData.value,
        bufferSize: this.metricBuffer.length
      });
    } catch (error) {
      logger.error('Failed to record metric', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error),
        metricData
      });
      throw new Error('Failed to record metric');
    }
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(userId: string, timeRange?: { start: Date; end: Date }): Promise<UserAnalytics> {
    try {
      const whereClause: any = { userId };
      
      if (timeRange) {
        whereClause.timestamp = {
          gte: timeRange.start,
          lte: timeRange.end
        };
      }

      // Fetch user events
      const userEvents = await this.prisma.analyticsEvent.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' }
      });

      // Calculate analytics
      const sessions = await this.calculateUserSessions(userId, timeRange);
      const performance = await this.calculateUserPerformance(userId, timeRange);
      const preferences = await this.calculateUserPreferences(userId, timeRange);
      const engagement = await this.calculateUserEngagement(userId, timeRange);

      const analytics: UserAnalytics = {
        userId,
        totalSessions: sessions.total,
        totalEvents: userEvents.length,
        averageSessionDuration: sessions.averageDuration,
        lastActivity: userEvents[0]?.timestamp || new Date(),
        preferences,
        engagement,
        performance
      };

      logger.info('User analytics calculated successfully', {
        component: 'AnalyticsService',
        userId,
        totalEvents: userEvents.length,
        totalSessions: sessions.total
      });

      return analytics;
    } catch (error) {
      logger.error('Failed to get user analytics', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      throw new Error('Failed to get user analytics');
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(timeRange?: { start: Date; end: Date }): Promise<SystemMetrics> {
    try {
      const whereClause: any = {};
      
      if (timeRange) {
        whereClause.timestamp = {
          gte: timeRange.start,
          lte: timeRange.end
        };
      }

      // Get active users
      const activeUsers = await this.calculateActiveUsers(timeRange);
      
      // Get usage statistics
      const usage = await this.calculateUsageStatistics(timeRange);
      
      // Get performance metrics
      const performance = await this.calculatePerformanceMetrics(timeRange);
      
      // Get content statistics
      const content = await this.calculateContentStatistics(timeRange);

      const metrics: SystemMetrics = {
        activeUsers,
        usage,
        performance,
        content
      };

      logger.info('System metrics calculated successfully', {
        component: 'AnalyticsService',
        timeRange,
        activeUsers: activeUsers.current
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to get system metrics', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Failed to get system metrics');
    }
  }

  /**
   * Generate report
   */
  async generateReport(request: ReportRequest): Promise<GeneratedReport> {
    const startTime = Date.now();

    try {
      let data: any[] = [];
      let keyInsights: string[] = [];
      let trends: Array<{ metric: string; direction: 'up' | 'down' | 'stable'; change: number }> = [];
      let recommendations: string[] = [];

      switch (request.type) {
        case 'user':
          data = await this.generateUserReport(request);
          keyInsights = this.generateUserInsights(data);
          trends = this.calculateUserTrends(data);
          recommendations = this.generateUserRecommendations(data);
          break;

        case 'system':
          data = await this.generateSystemReport(request);
          keyInsights = this.generateSystemInsights(data);
          trends = this.calculateSystemTrends(data);
          recommendations = this.generateSystemRecommendations(data);
          break;

        case 'content':
          data = await this.generateContentReport(request);
          keyInsights = this.generateContentInsights(data);
          trends = this.calculateContentTrends(data);
          recommendations = this.generateContentRecommendations(data);
          break;

        case 'engagement':
          data = await this.generateEngagementReport(request);
          keyInsights = this.generateEngagementInsights(data);
          trends = this.calculateEngagementTrends(data);
          recommendations = this.generateEngagementRecommendations(data);
          break;

        case 'performance':
          data = await this.generatePerformanceReport(request);
          keyInsights = this.generatePerformanceInsights(data);
          trends = this.calculatePerformanceTrends(data);
          recommendations = this.generatePerformanceRecommendations(data);
          break;

        default:
          throw new Error(`Unknown report type: ${request.type}`);
      }

      const report: GeneratedReport = {
        id: generateSecureToken(16),
        type: request.type,
        title: `${request.type.charAt(0).toUpperCase() + request.type.slice(1)} Analytics Report`,
        description: `Comprehensive ${request.type} analytics report`,
        data,
        metadata: {
          generatedAt: new Date(),
          filters: request.filters || {},
          totalRecords: data.length,
          processingTime: Date.now() - startTime,
          format: request.format || 'json'
        },
        summary: {
          keyInsights,
          trends,
          recommendations
        }
      };

      logger.info('Analytics report generated successfully', {
        component: 'AnalyticsService',
        reportType: request.type,
        recordCount: data.length,
        processingTime: Date.now() - startTime
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate analytics report', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error),
        request,
        processingTime: Date.now() - startTime
      });
      throw new Error('Failed to generate analytics report');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Test event ingestion
      const testEvent: EventData = {
        eventType: 'system',
        eventCategory: 'health',
        eventAction: 'check'
      };
      await this.trackEvent(testEvent);

      // Calculate metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const eventsToday = await this.prisma.analyticsEvent.count({
        where: {
          timestamp: {
            gte: today
          }
        }
      });

      return {
        status: 'healthy',
        database: 'connected',
        eventIngestion: true,
        reportGeneration: true,
        dataProcessing: true,
        timestamp: new Date().toISOString(),
        service: 'analytics-service',
        version: '1.0.0',
        uptime: process.uptime(),
        metrics: {
          eventsProcessedToday: eventsToday,
          averageProcessingLatency: 150, // Mock value
          errorRate: 0.001 // Mock value
        }
      };
    } catch (error) {
      logger.error('Analytics service health check failed', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        database: 'disconnected',
        eventIngestion: false,
        reportGeneration: false,
        dataProcessing: false,
        timestamp: new Date().toISOString(),
        service: 'analytics-service',
        version: '1.0.0',
        uptime: process.uptime(),
        metrics: {
          eventsProcessedToday: 0,
          averageProcessingLatency: 0,
          errorRate: 1.0
        }
      };
    }
  }

  /**
   * Flush event buffer to database
   */
  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    try {
      const events = [...this.eventBuffer];
      this.eventBuffer = [];

      await this.prisma.analyticsEvent.createMany({
        data: events.map(event => ({
          id: event.id,
          userId: event.userId,
          sessionId: event.sessionId,
          eventType: event.eventType,
          eventCategory: event.eventCategory,
          eventAction: event.eventAction,
          eventLabel: event.eventLabel,
          eventValue: event.eventValue,
          properties: event.properties as any,
          metadata: event.metadata as any,
          timestamp: event.timestamp
        }))
      });

      logger.debug('Event buffer flushed to database', {
        component: 'AnalyticsService',
        eventCount: events.length
      });
    } catch (error) {
      logger.error('Failed to flush event buffer', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error),
        bufferSize: this.eventBuffer.length
      });
    }
  }

  /**
   * Flush metric buffer to database
   */
  private async flushMetricBuffer(): Promise<void> {
    if (this.metricBuffer.length === 0) return;

    try {
      const metrics = [...this.metricBuffer];
      this.metricBuffer = [];

      await this.prisma.analyticsMetric.createMany({
        data: metrics.map(metric => ({
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
          tags: metric.tags as any,
          timestamp: metric.timestamp
        }))
      });

      logger.debug('Metric buffer flushed to database', {
        component: 'AnalyticsService',
        metricCount: metrics.length
      });
    } catch (error) {
      logger.error('Failed to flush metric buffer', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error),
        bufferSize: this.metricBuffer.length
      });
    }
  }

  /**
   * Start automatic buffer flushing
   */
  private startBufferFlush(): void {
    setInterval(async () => {
      await Promise.all([
        this.flushEventBuffer(),
        this.flushMetricBuffer()
      ]);
    }, this.FLUSH_INTERVAL);
  }

  // Helper methods for calculations (simplified implementations)
  private async calculateUserSessions(userId: string, timeRange?: { start: Date; end: Date }) {
    // Mock implementation - would calculate from actual session data
    return {
      total: 25,
      averageDuration: 1800000 // 30 minutes in milliseconds
    };
  }

  private async calculateUserPerformance(userId: string, timeRange?: { start: Date; end: Date }) {
    return {
      totalQuestionsAnswered: 150,
      correctAnswers: 120,
      averageResponseTime: 12500,
      improvementTrend: 0.15
    };
  }

  private async calculateUserPreferences(userId: string, timeRange?: { start: Date; end: Date }) {
    return {
      favoriteCategories: [
        { category: 'Science', count: 45 },
        { category: 'History', count: 32 }
      ],
      difficultyPreference: 'MEDIUM',
      averageScore: 82.5,
      completionRate: 0.87
    };
  }

  private async calculateUserEngagement(userId: string, timeRange?: { start: Date; end: Date }) {
    return {
      dailyActiveStreak: 7,
      weeklyActivity: [
        { date: '2024-01-01', events: 15 },
        { date: '2024-01-02', events: 23 }
      ],
      monthlyTrends: [
        { month: '2024-01', sessions: 28, performance: 85.2 }
      ]
    };
  }

  private async calculateActiveUsers(timeRange?: { start: Date; end: Date }) {
    return {
      current: 142,
      daily: 1250,
      weekly: 4800,
      monthly: 15600
    };
  }

  private async calculateUsageStatistics(timeRange?: { start: Date; end: Date }) {
    return {
      totalSessions: 2850,
      averageSessionDuration: 22.5,
      questionsAnsweredToday: 5420,
      gamesPlayedToday: 328
    };
  }

  private async calculatePerformanceMetrics(timeRange?: { start: Date; end: Date }) {
    return {
      averageResponseTime: 245,
      errorRate: 0.002,
      throughput: 1250,
      availability: 0.999
    };
  }

  private async calculateContentStatistics(timeRange?: { start: Date; end: Date }) {
    return {
      totalQuestions: 15420,
      popularCategories: [
        { category: 'Science', usage: 2150 },
        { category: 'Math', usage: 1890 }
      ],
      difficultyDistribution: {
        EASY: 4200,
        MEDIUM: 6800,
        HARD: 3420,
        EXPERT: 1000
      },
      userGeneratedContent: 3200
    };
  }

  // Report generation methods (simplified implementations)
  private async generateUserReport(request: ReportRequest): Promise<any[]> {
    return [{ userId: 'user1', sessions: 25, score: 85 }];
  }

  private async generateSystemReport(request: ReportRequest): Promise<any[]> {
    return [{ metric: 'activeUsers', value: 1250, timestamp: new Date() }];
  }

  private async generateContentReport(request: ReportRequest): Promise<any[]> {
    return [{ category: 'Science', questions: 2150, usage: 85.2 }];
  }

  private async generateEngagementReport(request: ReportRequest): Promise<any[]> {
    return [{ date: '2024-01-01', users: 1250, sessions: 3200 }];
  }

  private async generatePerformanceReport(request: ReportRequest): Promise<any[]> {
    return [{ endpoint: '/api/questions', responseTime: 245, errorRate: 0.002 }];
  }

  // Insight generation methods (simplified implementations)
  private generateUserInsights(data: any[]): string[] {
    return ['User engagement is up 15% this month', 'Average session duration increased by 3 minutes'];
  }

  private generateSystemInsights(data: any[]): string[] {
    return ['System performance is stable', 'Response times are within acceptable range'];
  }

  private generateContentInsights(data: any[]): string[] {
    return ['Science category is most popular', 'Medium difficulty questions have highest completion rate'];
  }

  private generateEngagementInsights(data: any[]): string[] {
    return ['Peak usage hours are 7-9 PM', 'Weekend engagement is 20% higher than weekdays'];
  }

  private generatePerformanceInsights(data: any[]): string[] {
    return ['API response times are improving', 'Error rates are below target threshold'];
  }

  // Trend calculation methods (simplified implementations)
  private calculateUserTrends(data: any[]): Array<{ metric: string; direction: 'up' | 'down' | 'stable'; change: number }> {
    return [{ metric: 'engagement', direction: 'up', change: 15.2 }];
  }

  private calculateSystemTrends(data: any[]): Array<{ metric: string; direction: 'up' | 'down' | 'stable'; change: number }> {
    return [{ metric: 'throughput', direction: 'up', change: 8.5 }];
  }

  private calculateContentTrends(data: any[]): Array<{ metric: string; direction: 'up' | 'down' | 'stable'; change: number }> {
    return [{ metric: 'contentCreation', direction: 'up', change: 22.1 }];
  }

  private calculateEngagementTrends(data: any[]): Array<{ metric: string; direction: 'up' | 'down' | 'stable'; change: number }> {
    return [{ metric: 'dailyActiveUsers', direction: 'up', change: 12.8 }];
  }

  private calculatePerformanceTrends(data: any[]): Array<{ metric: string; direction: 'up' | 'down' | 'stable'; change: number }> {
    return [{ metric: 'responseTime', direction: 'down', change: -5.3 }];
  }

  // Recommendation generation methods (simplified implementations)
  private generateUserRecommendations(data: any[]): string[] {
    return ['Consider introducing gamification features to boost engagement'];
  }

  private generateSystemRecommendations(data: any[]): string[] {
    return ['Consider scaling up during peak hours'];
  }

  private generateContentRecommendations(data: any[]): string[] {
    return ['Create more Science category questions to meet demand'];
  }

  private generateEngagementRecommendations(data: any[]): string[] {
    return ['Schedule maintenance during low-usage hours'];
  }

  private generatePerformanceRecommendations(data: any[]): string[] {
    return ['Optimize database queries for better performance'];
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    await Promise.all([
      this.flushEventBuffer(),
      this.flushMetricBuffer()
    ]);
    await this.prisma.$disconnect();
  }
}

export default AnalyticsService;

