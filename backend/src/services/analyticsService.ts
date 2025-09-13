import { EventEmitter } from 'events';
import { logger } from '../config/logger';
import { prisma } from '../config/database';

export interface UserEvent {
  id: string;
  userId: string;
  sessionId: string;
  eventType: string;
  eventCategory: 'user' | 'quiz' | 'question' | 'system';
  properties: Record<string, any>;
  timestamp: Date;
  metadata?: {
    userAgent?: string;
    ip?: string;
    location?: string;
    device?: string;
  };
}

export interface QuizAnalytics {
  quizId: string;
  metrics: {
    totalPlayers: number;
    completionRate: number;
    averageScore: number;
    averageTime: number;
    retryRate: number;
    dropOffPoints: { questionIndex: number; dropOffRate: number }[];
  };
  questionAnalytics: QuestionAnalytics[];
  playerSegments: PlayerSegment[];
  timeBasedMetrics: TimeBasedMetric[];
}

export interface QuestionAnalytics {
  questionId: string;
  metrics: {
    attempts: number;
    correctAnswers: number;
    accuracy: number;
    averageTime: number;
    skipRate: number;
  };
  answerDistribution: { [option: string]: number };
  difficultyMetrics: {
    perceived: number;
    actual: number;
    variance: number;
  };
}

export interface PlayerSegment {
  segment: 'beginners' | 'intermediate' | 'advanced' | 'experts';
  count: number;
  averageScore: number;
  engagementMetrics: {
    sessionDuration: number;
    questionsPerSession: number;
    returnRate: number;
  };
}

export interface TimeBasedMetric {
  period: string; // hour, day, week, month
  value: string; // ISO date string
  metrics: {
    players: number;
    sessions: number;
    completions: number;
    averageScore: number;
  };
}

export interface UserBehaviorPattern {
  userId: string;
  pattern: {
    preferredQuizTypes: string[];
    averageSessionLength: number;
    peakActivityHours: number[];
    learningProgression: {
      startLevel: number;
      currentLevel: number;
      progressionRate: number;
    };
    engagementScore: number;
    churnRisk: number;
  };
}

export interface BusinessMetrics {
  userAcquisition: {
    newUsers: number;
    growthRate: number;
    acquisitionChannels: { [channel: string]: number };
  };
  userEngagement: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    averageSessionDuration: number;
    sessionFrequency: number;
  };
  contentMetrics: {
    quizzesCreated: number;
    questionsGenerated: number;
    aiUsageRate: number;
    contentQualityScore: number;
  };
  revenue: {
    mrr: number; // Monthly Recurring Revenue
    arpu: number; // Average Revenue Per User
    churnRate: number;
    ltv: number; // Lifetime Value
  };
}

export interface AnalyticsReport {
  reportId: string;
  type: 'user' | 'quiz' | 'business' | 'performance';
  period: {
    start: Date;
    end: Date;
  };
  data: any;
  insights: Insight[];
  recommendations: string[];
  generatedAt: Date;
}

export interface Insight {
  type: 'positive' | 'negative' | 'neutral';
  category: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  data: any;
}

/**
 * Phase 4.1: Advanced Analytics Service
 * 
 * Comprehensive analytics and insights generation system
 */
export class AnalyticsService extends EventEmitter {
  private static instance: AnalyticsService | null = null;
  
  private eventQueue: UserEvent[] = [];
  private isProcessing = false;
  private batchSize = 100;
  private flushInterval = 30000; // 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.initializeAnalytics();
  }

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Track user event
   */
  public trackEvent(
    userId: string,
    sessionId: string,
    eventType: string,
    eventCategory: UserEvent['eventCategory'],
    properties: Record<string, any> = {},
    metadata?: UserEvent['metadata']
  ): void {
    const event: UserEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      sessionId,
      eventType,
      eventCategory,
      properties,
      timestamp: new Date(),
      metadata
    };

    this.eventQueue.push(event);

    logger.debug('Event tracked', {
      component: 'AnalyticsService',
      eventType,
      userId,
      queueSize: this.eventQueue.length
    });

    this.emit('eventTracked', { event });

    // Auto-flush if queue is full
    if (this.eventQueue.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  /**
   * Track quiz completion
   */
  public trackQuizCompletion(
    userId: string,
    sessionId: string,
    quizId: string,
    score: number,
    timeSpent: number,
    questionsAnswered: number,
    correctAnswers: number
  ): void {
    this.trackEvent(userId, sessionId, 'quiz_completed', 'quiz', {
      quizId,
      score,
      timeSpent,
      questionsAnswered,
      correctAnswers,
      accuracy: correctAnswers / questionsAnswered
    });
  }

  /**
   * Track question interaction
   */
  public trackQuestionInteraction(
    userId: string,
    sessionId: string,
    questionId: string,
    quizId: string,
    interaction: 'answered' | 'skipped' | 'hinted',
    details: Record<string, any>
  ): void {
    this.trackEvent(userId, sessionId, `question_${interaction}`, 'question', {
      questionId,
      quizId,
      ...details
    });
  }

  /**
   * Get quiz analytics
   */
  public async getQuizAnalytics(quizId: string, period?: { start: Date; end: Date }): Promise<QuizAnalytics> {
    try {
      logger.info('📊 Generating quiz analytics', {
        component: 'AnalyticsService',
        quizId,
        period
      });

      // Get quiz sessions
      const sessions = await prisma.quizSession.findMany({
        where: {
          ...(period && {
            createdAt: {
              gte: period.start,
              lte: period.end
            }
          })
        },
        include: {
          answers: true,
          user: true
        }
      });

      // Calculate metrics
      const totalPlayers = sessions.length;
      const completedSessions = sessions.filter(s => s.status === 'COMPLETED');
      const completionRate = totalPlayers > 0 ? completedSessions.length / totalPlayers : 0;
      
      const averageScore = completedSessions.length > 0 ? 
        completedSessions.reduce((sum, s) => sum + (s.totalScore || 0), 0) / completedSessions.length : 0;

      const averageTime = completedSessions.length > 0 ?
        completedSessions.reduce((sum, s) => sum + (s.totalTimeTaken || 0), 0) / completedSessions.length : 0;

      // Calculate retry rate
      const userRetries = new Map<string, number>();
      sessions.forEach(session => {
        const count = userRetries.get(session.userId) || 0;
        userRetries.set(session.userId, count + 1);
      });
      const retryRate = userRetries.size > 0 ? 
        (Array.from(userRetries.values()).filter(count => count > 1).length / userRetries.size) : 0;

      // Generate question analytics
      const questionAnalytics = await this.generateQuestionAnalytics(quizId, period);
      
      // Generate player segments
      const playerSegments = this.generatePlayerSegments(sessions);
      
      // Generate time-based metrics
      const timeBasedMetrics = this.generateTimeBasedMetrics(sessions);

      return {
        quizId,
        metrics: {
          totalPlayers,
          completionRate,
          averageScore,
          averageTime,
          retryRate,
          dropOffPoints: [] // Would calculate actual drop-off points
        },
        questionAnalytics,
        playerSegments,
        timeBasedMetrics
      };

    } catch (error) {
      logger.error('Failed to generate quiz analytics', {
        component: 'AnalyticsService',
        quizId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get user behavior patterns
   */
  public async getUserBehaviorPatterns(userId: string): Promise<UserBehaviorPattern> {
    try {
      // Get user sessions
      const sessions = await prisma.quizSession.findMany({
        where: { userId },
        include: {
          answers: true,
          user: true
        },
        orderBy: { createdAt: 'desc' },
        take: 100 // Last 100 sessions
      });

      // Analyze patterns
      const preferredQuizTypes = this.analyzeQuizPreferences(sessions);
      const averageSessionLength = sessions.length > 0 ?
        sessions.reduce((sum, s) => sum + (s.totalTimeTaken || 0), 0) / sessions.length : 0;

      const peakActivityHours = this.analyzePeakActivityHours(sessions);
      const engagementScore = this.calculateEngagementScore(sessions);
      const churnRisk = this.calculateChurnRisk(sessions);

      return {
        userId,
        pattern: {
          preferredQuizTypes,
          averageSessionLength,
          peakActivityHours,
          learningProgression: {
            startLevel: 1,
            currentLevel: this.calculateCurrentLevel(sessions),
            progressionRate: this.calculateProgressionRate(sessions)
          },
          engagementScore,
          churnRisk
        }
      };

    } catch (error) {
      logger.error('Failed to analyze user behavior patterns', {
        component: 'AnalyticsService',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate business metrics
   */
  public async generateBusinessMetrics(period: { start: Date; end: Date }): Promise<BusinessMetrics> {
    try {
      logger.info('📈 Generating business metrics', {
        component: 'AnalyticsService',
        period
      });

      // User acquisition metrics
      const newUsersCount = await prisma.user.count({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      // Calculate growth rate (simplified)
      const previousPeriod = {
        start: new Date(period.start.getTime() - (period.end.getTime() - period.start.getTime())),
        end: period.start
      };

      const previousNewUsers = await prisma.user.count({
        where: {
          createdAt: {
            gte: previousPeriod.start,
            lte: previousPeriod.end
          }
        }
      });

      const growthRate = previousNewUsers > 0 ? 
        ((newUsersCount - previousNewUsers) / previousNewUsers) * 100 : 0;

      // Engagement metrics
      const totalSessions = await prisma.quizSession.count({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      const activeUsers = await prisma.quizSession.groupBy({
        by: ['userId'],
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      // Content metrics
      const quizzesCreated = await prisma.quizSession.count({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      const questionsGenerated = await prisma.question.count({
        where: {
          createdAt: {
            gte: period.start,
            lte: period.end
          }
        }
      });

      return {
        userAcquisition: {
          newUsers: newUsersCount,
          growthRate,
          acquisitionChannels: {
            organic: Math.floor(newUsersCount * 0.6),
            referral: Math.floor(newUsersCount * 0.2),
            social: Math.floor(newUsersCount * 0.15),
            paid: Math.floor(newUsersCount * 0.05)
          }
        },
        userEngagement: {
          dailyActiveUsers: Math.floor(activeUsers.length * 0.3),
          weeklyActiveUsers: Math.floor(activeUsers.length * 0.7),
          monthlyActiveUsers: activeUsers.length,
          averageSessionDuration: 450, // Mock data
          sessionFrequency: totalSessions / Math.max(1, activeUsers.length)
        },
        contentMetrics: {
          quizzesCreated,
          questionsGenerated,
          aiUsageRate: 0.35,
          contentQualityScore: 0.84
        },
        revenue: {
          mrr: 1250.00, // Mock revenue data
          arpu: 12.50,
          churnRate: 0.05,
          ltv: 150.00
        }
      };

    } catch (error) {
      logger.error('Failed to generate business metrics', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate insights report
   */
  public async generateInsightsReport(
    type: AnalyticsReport['type'],
    period: { start: Date; end: Date }
  ): Promise<AnalyticsReport> {
    try {
      logger.info('🔍 Generating insights report', {
        component: 'AnalyticsService',
        type,
        period
      });

      let data: any;
      let insights: Insight[] = [];
      let recommendations: string[] = [];

      switch (type) {
        case 'business':
          data = await this.generateBusinessMetrics(period);
          insights = this.generateBusinessInsights(data);
          recommendations = this.generateBusinessRecommendations(insights);
          break;
        
        case 'user':
          // Would implement user analytics
          data = { placeholder: 'User analytics data' };
          break;
        
        case 'quiz':
          // Would implement quiz analytics
          data = { placeholder: 'Quiz analytics data' };
          break;
        
        case 'performance':
          // Would implement performance analytics
          data = { placeholder: 'Performance analytics data' };
          break;
      }

      return {
        reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        period,
        data,
        insights,
        recommendations,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Failed to generate insights report', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Initialize analytics system
   */
  private initializeAnalytics(): void {
    logger.info('📊 Initializing analytics service');

    // Start auto-flush timer
    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flushEvents();
      }
    }, this.flushInterval);
  }

  /**
   * Flush events to database
   */
  private async flushEvents(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const eventsToProcess = this.eventQueue.splice(0, this.batchSize);

    try {
      logger.debug('Flushing analytics events', {
        component: 'AnalyticsService',
        count: eventsToProcess.length
      });

      // In a real implementation, you would store these events in a database
      // For now, we'll just log them
      eventsToProcess.forEach(event => {
        logger.debug('Analytics event', {
          type: event.eventType,
          category: event.eventCategory,
          userId: event.userId,
          properties: event.properties
        });
      });

      this.emit('eventsFlushed', { count: eventsToProcess.length });

    } catch (error) {
      logger.error('Failed to flush analytics events', {
        component: 'AnalyticsService',
        error: error instanceof Error ? error.message : String(error)
      });

      // Re-add events to queue for retry
      this.eventQueue.unshift(...eventsToProcess);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Generate question analytics
   */
  private async generateQuestionAnalytics(
    quizId: string,
    period?: { start: Date; end: Date }
  ): Promise<QuestionAnalytics[]> {
    // Mock implementation - would query actual question performance data
    return [
      {
        questionId: 'q1',
        metrics: {
          attempts: 150,
          correctAnswers: 120,
          accuracy: 0.8,
          averageTime: 45,
          skipRate: 0.05
        },
        answerDistribution: {
          'A': 75,
          'B': 45,
          'C': 20,
          'D': 10
        },
        difficultyMetrics: {
          perceived: 3,
          actual: 2.8,
          variance: 0.2
        }
      }
    ];
  }

  /**
   * Generate player segments
   */
  private generatePlayerSegments(sessions: any[]): PlayerSegment[] {
    // Mock implementation - would analyze actual player data
    return [
      {
        segment: 'beginners',
        count: Math.floor(sessions.length * 0.4),
        averageScore: 65,
        engagementMetrics: {
          sessionDuration: 300,
          questionsPerSession: 8,
          returnRate: 0.6
        }
      },
      {
        segment: 'intermediate',
        count: Math.floor(sessions.length * 0.35),
        averageScore: 78,
        engagementMetrics: {
          sessionDuration: 450,
          questionsPerSession: 12,
          returnRate: 0.75
        }
      }
    ];
  }

  /**
   * Generate time-based metrics
   */
  private generateTimeBasedMetrics(sessions: any[]): TimeBasedMetric[] {
    // Mock implementation - would generate actual time series data
    return [
      {
        period: 'day',
        value: new Date().toISOString(),
        metrics: {
          players: sessions.length,
          sessions: sessions.length,
          completions: Math.floor(sessions.length * 0.8),
          averageScore: 72
        }
      }
    ];
  }

  /**
   * Analyze quiz preferences
   */
  private analyzeQuizPreferences(sessions: any[]): string[] {
    // Mock implementation - would analyze actual quiz categories
    return ['Science', 'Technology', 'Mathematics'];
  }

  /**
   * Analyze peak activity hours
   */
  private analyzePeakActivityHours(sessions: any[]): number[] {
    // Mock implementation - would analyze actual session times
    return [14, 15, 19, 20]; // 2-3 PM and 7-8 PM
  }

  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(sessions: any[]): number {
    if (sessions.length === 0) return 0;
    
    // Mock calculation based on session frequency and completion
    const recentSessions = sessions.filter(s => 
      new Date(s.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    const frequency = recentSessions.length / 30; // sessions per day
    const completion = recentSessions.filter(s => s.status === 'COMPLETED').length / recentSessions.length;
    
    return Math.min(1, (frequency * 0.1) + (completion * 0.9));
  }

  /**
   * Calculate churn risk
   */
  private calculateChurnRisk(sessions: any[]): number {
    if (sessions.length === 0) return 1;
    
    const lastSession = new Date(sessions[0].createdAt);
    const daysSinceLastSession = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60 * 24);
    
    // Higher churn risk if user hasn't been active recently
    return Math.min(1, daysSinceLastSession / 30);
  }

  /**
   * Calculate current level
   */
  private calculateCurrentLevel(sessions: any[]): number {
    const averageScore = sessions.length > 0 ?
      sessions.reduce((sum, s) => sum + (s.score || 0), 0) / sessions.length : 0;
    
    return Math.floor(averageScore / 20) + 1; // 1-5 levels
  }

  /**
   * Calculate progression rate
   */
  private calculateProgressionRate(sessions: any[]): number {
    if (sessions.length < 2) return 0;
    
    // Compare first 10 and last 10 sessions
    const first10 = sessions.slice(-10);
    const last10 = sessions.slice(0, 10);
    
    const firstAvg = first10.reduce((sum, s) => sum + (s.score || 0), 0) / first10.length;
    const lastAvg = last10.reduce((sum, s) => sum + (s.score || 0), 0) / last10.length;
    
    return lastAvg - firstAvg;
  }

  /**
   * Generate business insights
   */
  private generateBusinessInsights(metrics: BusinessMetrics): Insight[] {
    const insights: Insight[] = [];

    // Growth insight
    if (metrics.userAcquisition.growthRate > 10) {
      insights.push({
        type: 'positive',
        category: 'growth',
        title: 'Strong User Growth',
        description: `User growth rate is ${metrics.userAcquisition.growthRate.toFixed(1)}%, indicating healthy expansion`,
        impact: 'high',
        confidence: 0.9,
        data: { growthRate: metrics.userAcquisition.growthRate }
      });
    }

    // Engagement insight
    if (metrics.userEngagement.sessionFrequency > 2) {
      insights.push({
        type: 'positive',
        category: 'engagement',
        title: 'High User Engagement',
        description: `Users are averaging ${metrics.userEngagement.sessionFrequency.toFixed(1)} sessions each`,
        impact: 'medium',
        confidence: 0.8,
        data: { sessionFrequency: metrics.userEngagement.sessionFrequency }
      });
    }

    return insights;
  }

  /**
   * Generate business recommendations
   */
  private generateBusinessRecommendations(insights: Insight[]): string[] {
    const recommendations: string[] = [];

    if (insights.some(i => i.category === 'growth' && i.type === 'positive')) {
      recommendations.push('Consider increasing marketing spend to capitalize on positive growth trend');
    }

    if (insights.some(i => i.category === 'engagement' && i.type === 'positive')) {
      recommendations.push('Implement user retention programs to maintain high engagement levels');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring key metrics and maintain current performance levels');
    }

    return recommendations;
  }
}

export default AnalyticsService;

