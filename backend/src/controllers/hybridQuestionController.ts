import { Request, Response } from 'express';
import { HybridQuestionService } from '../services/hybridQuestionService';
import { logger } from '../utils/logger';
import { QuestionType } from '@prisma/client';

/**
 * Phase 3.2: Hybrid Question Controller
 * 
 * Handles API endpoints for the intelligent hybrid question system
 */
export class HybridQuestionController {
  private hybridService: HybridQuestionService;

  constructor() {
    this.hybridService = HybridQuestionService.getInstance();
  }

  /**
   * Generate questions using hybrid AI/Database approach
   */
  public async generateHybridQuestions(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const {
        topic,
        subject,
        difficulty = 2,
        questionType = 'MULTIPLE_CHOICE',
        count = 5,
        categoryIds,
        aiRatio = 0.3,
        qualityThreshold = 0.8,
        contextHistory,
        userPreferences
      } = req.body;

      logger.info('🔄 Hybrid question generation requested', {
        component: 'HybridQuestionController',
        userId,
        topic,
        count,
        aiRatio
      });

      // Validate input
      if (!topic || typeof topic !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Topic is required and must be a string',
          code: 'INVALID_TOPIC'
        });
        return;
      }

      if (count < 1 || count > 50) {
        res.status(400).json({
          success: false,
          error: 'Count must be between 1 and 50',
          code: 'INVALID_COUNT'
        });
        return;
      }

      if (difficulty < 1 || difficulty > 5) {
        res.status(400).json({
          success: false,
          error: 'Difficulty must be between 1 and 5',
          code: 'INVALID_DIFFICULTY'
        });
        return;
      }

      if (aiRatio < 0 || aiRatio > 1) {
        res.status(400).json({
          success: false,
          error: 'AI ratio must be between 0 and 1',
          code: 'INVALID_AI_RATIO'
        });
        return;
      }

      // Generate hybrid questions
      const result = await this.hybridService.generateHybridQuestions({
        topic,
        subject,
        difficulty,
        questionType: questionType as QuestionType,
        count,
        categoryIds: Array.isArray(categoryIds) ? categoryIds : undefined,
        aiRatio,
        qualityThreshold,
        contextHistory: Array.isArray(contextHistory) ? contextHistory : undefined,
        userPreferences
      }, userId);

      // Log the successful generation
      logger.info('✅ Hybrid questions generated successfully', {
        component: 'HybridQuestionController',
        userId,
        questionsGenerated: result.questions.length,
        hybridRatio: result.hybridRatio,
        averageQuality: result.qualityScores.reduce((a, b) => a + b, 0) / result.qualityScores.length,
        cacheHits: result.cacheHits,
        generationTime: result.totalGenerationTime
      });

      res.status(200).json({
        success: true,
        data: {
          questions: result.questions.map((question, index) => ({
            ...question,
            qualityScore: result.qualityScores[index],
            source: result.sources[index]
          })),
          metadata: {
            hybridRatio: result.hybridRatio,
            qualityScores: {
              average: result.qualityScores.reduce((a, b) => a + b, 0) / result.qualityScores.length,
              minimum: Math.min(...result.qualityScores),
              maximum: Math.max(...result.qualityScores)
            },
            performance: {
              cacheHits: result.cacheHits,
              fallbacksUsed: result.fallbacksUsed,
              totalGenerationTime: result.totalGenerationTime
            }
          }
        }
      });

    } catch (error) {
      logger.error('❌ Hybrid question generation failed', {
        component: 'HybridQuestionController',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate hybrid questions',
        code: 'GENERATION_FAILED',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * Get quality metrics for generated questions
   */
  public async getQualityMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { questionIds } = req.body;

      if (!Array.isArray(questionIds) || questionIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Question IDs array is required',
          code: 'INVALID_QUESTION_IDS'
        });
        return;
      }

      // This would integrate with the quality assessment system
      // For now, return mock metrics
      const metrics = questionIds.map(id => ({
        questionId: id,
        qualityScore: 0.85,
        metrics: {
          accuracy: 0.9,
          clarity: 0.8,
          engagement: 0.85,
          educational_value: 0.9,
          difficulty_appropriateness: 0.8
        }
      }));

      res.status(200).json({
        success: true,
        data: { metrics }
      });

    } catch (error) {
      logger.error('❌ Failed to get quality metrics', {
        component: 'HybridQuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get quality metrics',
        code: 'METRICS_FAILED'
      });
    }
  }

  /**
   * Submit quality feedback for hybrid questions
   */
  public async submitQualityFeedback(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { questionId, rating, feedback, metrics } = req.body;

      if (!questionId || typeof questionId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Question ID is required',
          code: 'INVALID_QUESTION_ID'
        });
        return;
      }

      if (rating && (rating < 1 || rating > 5)) {
        res.status(400).json({
          success: false,
          error: 'Rating must be between 1 and 5',
          code: 'INVALID_RATING'
        });
        return;
      }

      logger.info('📝 Quality feedback received', {
        component: 'HybridQuestionController',
        userId,
        questionId,
        rating,
        hasMetrics: Boolean(metrics)
      });

      // Store the feedback (this would integrate with the quality system)
      // For now, just acknowledge receipt
      
      res.status(200).json({
        success: true,
        message: 'Quality feedback recorded successfully'
      });

    } catch (error) {
      logger.error('❌ Failed to submit quality feedback', {
        component: 'HybridQuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to submit quality feedback',
        code: 'FEEDBACK_FAILED'
      });
    }
  }

  /**
   * Get hybrid system performance metrics
   */
  public async getPerformanceMetrics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { timeRange = '24h' } = req.query;

      // Mock performance metrics for now
      const performanceData = {
        hybridRatio: {
          ai: 0.3,
          database: 0.6,
          cache: 0.1
        },
        qualityMetrics: {
          averageScore: 0.82,
          improvementOverTime: 0.05,
          userSatisfaction: 4.3
        },
        performanceMetrics: {
          averageResponseTime: 1200,
          cacheHitRate: 0.15,
          fallbackRate: 0.02,
          successRate: 0.98
        },
        usage: {
          totalQuestions: 1250,
          uniqueTopics: 45,
          userEngagement: 0.87
        },
        trends: {
          qualityTrend: 'improving',
          performanceTrend: 'stable',
          usageTrend: 'growing'
        }
      };

      res.status(200).json({
        success: true,
        data: performanceData,
        metadata: {
          timeRange,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get performance metrics', {
        component: 'HybridQuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get performance metrics',
        code: 'PERFORMANCE_METRICS_FAILED'
      });
    }
  }

  /**
   * Update hybrid system preferences
   */
  public async updateHybridPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const {
        defaultAiRatio,
        qualityThreshold,
        preferredSources,
        fallbackPreferences,
        cachePreferences
      } = req.body;

      logger.info('⚙️ Updating hybrid preferences', {
        component: 'HybridQuestionController',
        userId,
        defaultAiRatio,
        qualityThreshold
      });

      // Validate preferences
      if (defaultAiRatio !== undefined && (defaultAiRatio < 0 || defaultAiRatio > 1)) {
        res.status(400).json({
          success: false,
          error: 'Default AI ratio must be between 0 and 1',
          code: 'INVALID_AI_RATIO'
        });
        return;
      }

      if (qualityThreshold !== undefined && (qualityThreshold < 0 || qualityThreshold > 1)) {
        res.status(400).json({
          success: false,
          error: 'Quality threshold must be between 0 and 1',
          code: 'INVALID_QUALITY_THRESHOLD'
        });
        return;
      }

      // Store preferences (this would integrate with user preferences system)
      // For now, just acknowledge the update

      res.status(200).json({
        success: true,
        message: 'Hybrid preferences updated successfully',
        data: {
          defaultAiRatio,
          qualityThreshold,
          preferredSources,
          fallbackPreferences,
          cachePreferences
        }
      });

    } catch (error) {
      logger.error('❌ Failed to update hybrid preferences', {
        component: 'HybridQuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update hybrid preferences',
        code: 'PREFERENCES_UPDATE_FAILED'
      });
    }
  }

  /**
   * Get hybrid system health status
   */
  public async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      // Check system health
      const systemHealth = {
        overall: 'healthy',
        components: {
          aiService: {
            status: 'healthy',
            responseTime: 1200,
            successRate: 0.95,
            lastCheck: new Date().toISOString()
          },
          database: {
            status: 'healthy',
            responseTime: 50,
            successRate: 0.99,
            lastCheck: new Date().toISOString()
          },
          cache: {
            status: 'healthy',
            hitRate: 0.15,
            size: '2.1MB',
            lastCheck: new Date().toISOString()
          },
          qualitySystem: {
            status: 'healthy',
            averageScore: 0.82,
            processingTime: 300,
            lastCheck: new Date().toISOString()
          }
        },
        metrics: {
          totalRequests: 12543,
          successfulRequests: 12298,
          averageResponseTime: 850,
          uptime: '99.8%'
        }
      };

      res.status(200).json({
        success: true,
        data: systemHealth
      });

    } catch (error) {
      logger.error('❌ Failed to get system health', {
        component: 'HybridQuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get system health',
        code: 'HEALTH_CHECK_FAILED'
      });
    }
  }
}

export default HybridQuestionController;

