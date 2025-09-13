import { Request, Response } from 'express';
import { MultiProviderAiService } from '../services/multiProviderAiService';
import { ContentModerationService } from '../services/contentModerationService';
import { FactVerificationService } from '../services/factVerificationService';
import { logger } from '../utils/logger';

/**
 * Phase 3.3: Advanced AI Controller
 * 
 * Integrates multi-provider AI, content moderation, and fact verification
 */
export class AdvancedAiController {
  private multiProviderService: MultiProviderAiService;
  private moderationService: ContentModerationService;
  private factVerificationService: FactVerificationService;

  constructor() {
    this.multiProviderService = MultiProviderAiService.getInstance();
    this.moderationService = ContentModerationService.getInstance();
    this.factVerificationService = FactVerificationService.getInstance();
  }

  /**
   * Generate AI content with advanced features
   */
  public async generateAdvancedContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const {
        prompt,
        contentType = 'question',
        preferredProvider,
        maxCost,
        minQuality,
        enableModeration = true,
        enableFactCheck = true,
        moderationThreshold = 0.8,
        factCheckConfidence = 0.7
      } = req.body;

      logger.info('🚀 Advanced AI content generation requested', {
        component: 'AdvancedAiController',
        userId,
        contentType,
        preferredProvider,
        enableModeration,
        enableFactCheck
      });

      // Step 1: Generate content using multi-provider AI
      const aiResponse = await this.multiProviderService.processRequest({
        prompt,
        maxTokens: 1000,
        temperature: 0.7
      }, {
        preferredProvider,
        maxCost,
        minQuality
      });

      let processedContent = aiResponse.content;
      const metadata: any = {
        provider: aiResponse.provider,
        model: aiResponse.model,
        cost: aiResponse.cost,
        usage: aiResponse.usage,
        responseTime: aiResponse.responseTime
      };

      // Step 2: Content moderation (if enabled)
      if (enableModeration) {
        const moderationResult = await this.moderationService.moderateContent({
          content: processedContent,
          contentType: contentType as any,
          context: {
            userId,
            educational: true
          }
        });

        metadata.moderation = {
          approved: moderationResult.approved,
          confidence: moderationResult.confidence,
          flags: moderationResult.flags,
          suggestions: moderationResult.suggestions
        };

        // Handle moderation failure
        if (!moderationResult.approved && moderationResult.confidence > moderationThreshold) {
          res.status(400).json({
            success: false,
            error: 'Content failed moderation checks',
            code: 'MODERATION_FAILED',
            details: {
              flags: moderationResult.flags,
              suggestions: moderationResult.suggestions
            }
          });
          return;
        }

        // Apply moderation suggestions if available
        if (moderationResult.suggestions.length > 0) {
          metadata.moderationSuggestions = moderationResult.suggestions;
        }
      }

      // Step 3: Fact verification (if enabled)
      if (enableFactCheck) {
        const factCheckResult = await this.factVerificationService.verifyFacts({
          content: processedContent,
          claims: [], // Auto-extract claims
          context: {
            topic: 'general',
            educational: true
          }
        });

        metadata.factCheck = {
          overallStatus: factCheckResult.overall.verificationStatus,
          confidence: factCheckResult.overall.confidence,
          credibilityScore: factCheckResult.overall.credibilityScore,
          claims: factCheckResult.claims.length,
          recommendations: factCheckResult.recommendations
        };

        // Handle fact check concerns
        if (factCheckResult.overall.verificationStatus === 'false' ||
            factCheckResult.overall.confidence < factCheckConfidence) {
          metadata.factCheckWarning = true;
          metadata.factCheckDetails = factCheckResult.recommendations;
        }
      }

      // Step 4: Return enhanced content
      res.status(200).json({
        success: true,
        data: {
          content: processedContent,
          metadata,
          quality: {
            overall: this.calculateOverallQuality(metadata),
            breakdown: {
              aiQuality: aiResponse.quality || 0.8,
              moderationScore: metadata.moderation?.confidence || 1,
              factualAccuracy: metadata.factCheck?.confidence || 0.8
            }
          }
        }
      });

      logger.info('✅ Advanced AI content generation completed', {
        component: 'AdvancedAiController',
        userId,
        provider: aiResponse.provider,
        moderationApproved: metadata.moderation?.approved,
        factCheckStatus: metadata.factCheck?.overallStatus
      });

    } catch (error) {
      logger.error('❌ Advanced AI content generation failed', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Advanced AI content generation failed',
        code: 'AI_GENERATION_FAILED',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * Get available AI providers and their status
   */
  public async getProviderStatus(req: Request, res: Response): Promise<void> {
    try {
      const healthStatuses = this.multiProviderService.getProviderHealthStatuses();
      const metrics = this.multiProviderService.getProviderMetrics();

      res.status(200).json({
        success: true,
        data: {
          providers: healthStatuses.map(health => ({
            id: health.providerId,
            ...metrics[health.providerId],
            health: {
              isHealthy: health.isHealthy,
              responseTime: health.responseTime,
              successRate: health.successRate,
              uptime: health.uptime,
              lastCheck: health.lastCheck
            }
          }))
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get provider status', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get provider status',
        code: 'PROVIDER_STATUS_FAILED'
      });
    }
  }

  /**
   * Update load balancing strategy
   */
  public async updateLoadBalancingStrategy(req: Request, res: Response): Promise<void> {
    try {
      const { strategy } = req.body;

      if (!strategy || !strategy.type) {
        res.status(400).json({
          success: false,
          error: 'Strategy type is required',
          code: 'INVALID_STRATEGY'
        });
        return;
      }

      this.multiProviderService.updateLoadBalancingStrategy(strategy);

      res.status(200).json({
        success: true,
        message: 'Load balancing strategy updated successfully',
        data: { strategy }
      });

    } catch (error) {
      logger.error('❌ Failed to update load balancing strategy', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update load balancing strategy',
        code: 'STRATEGY_UPDATE_FAILED'
      });
    }
  }

  /**
   * Moderate content independently
   */
  public async moderateContent(req: Request, res: Response): Promise<void> {
    try {
      const { content, contentType = 'user_input', context } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Content is required and must be a string',
          code: 'INVALID_CONTENT'
        });
        return;
      }

      const result = await this.moderationService.moderateContent({
        content,
        contentType,
        context: {
          ...context,
          userId: (req as any).user.id
        }
      });

      res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('❌ Content moderation failed', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Content moderation failed',
        code: 'MODERATION_FAILED'
      });
    }
  }

  /**
   * Batch moderate multiple content items
   */
  public async batchModerateContent(req: Request, res: Response): Promise<void> {
    try {
      const { contents } = req.body;

      if (!Array.isArray(contents) || contents.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Contents array is required and must not be empty',
          code: 'INVALID_CONTENTS'
        });
        return;
      }

      if (contents.length > 50) {
        res.status(400).json({
          success: false,
          error: 'Maximum 50 items allowed in batch moderation',
          code: 'BATCH_SIZE_EXCEEDED'
        });
        return;
      }

      const requests = contents.map((item: any) => ({
        content: item.content,
        contentType: item.contentType || 'user_input',
        context: {
          ...item.context,
          userId: (req as any).user.id
        }
      }));

      const results = await this.moderationService.batchModerateContent(requests);

      res.status(200).json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            approved: results.filter(r => r.approved).length,
            rejected: results.filter(r => !r.approved).length,
            averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length
          }
        }
      });

    } catch (error) {
      logger.error('❌ Batch content moderation failed', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Batch content moderation failed',
        code: 'BATCH_MODERATION_FAILED'
      });
    }
  }

  /**
   * Verify facts in content
   */
  public async verifyFacts(req: Request, res: Response): Promise<void> {
    try {
      const { content, claims = [], context } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Content is required and must be a string',
          code: 'INVALID_CONTENT'
        });
        return;
      }

      const result = await this.factVerificationService.verifyFacts({
        content,
        claims,
        context
      });

      res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('❌ Fact verification failed', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Fact verification failed',
        code: 'FACT_VERIFICATION_FAILED'
      });
    }
  }

  /**
   * Get moderation statistics
   */
  public async getModerationStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.moderationService.getModerationStatistics();

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('❌ Failed to get moderation statistics', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get moderation statistics',
        code: 'STATS_FAILED'
      });
    }
  }

  /**
   * Get fact verification statistics
   */
  public async getFactVerificationStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.factVerificationService.getVerificationStatistics();

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('❌ Failed to get fact verification statistics', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get fact verification statistics',
        code: 'STATS_FAILED'
      });
    }
  }

  /**
   * Update moderation thresholds
   */
  public async updateModerationThresholds(req: Request, res: Response): Promise<void> {
    try {
      const { thresholds } = req.body;

      if (!thresholds || typeof thresholds !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Thresholds object is required',
          code: 'INVALID_THRESHOLDS'
        });
        return;
      }

      this.moderationService.updateModerationThresholds(thresholds);

      res.status(200).json({
        success: true,
        message: 'Moderation thresholds updated successfully',
        data: { thresholds }
      });

    } catch (error) {
      logger.error('❌ Failed to update moderation thresholds', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update moderation thresholds',
        code: 'THRESHOLD_UPDATE_FAILED'
      });
    }
  }

  /**
   * Get human review queue
   */
  public async getHumanReviewQueue(req: Request, res: Response): Promise<void> {
    try {
      const { priority } = req.query;
      const queue = this.moderationService.getHumanReviewQueue(priority as string);

      res.status(200).json({
        success: true,
        data: {
          queue,
          summary: {
            total: queue.length,
            byPriority: {
              urgent: queue.filter(item => item.priority === 'urgent').length,
              high: queue.filter(item => item.priority === 'high').length,
              medium: queue.filter(item => item.priority === 'medium').length,
              low: queue.filter(item => item.priority === 'low').length
            }
          }
        }
      });

    } catch (error) {
      logger.error('❌ Failed to get human review queue', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get human review queue',
        code: 'QUEUE_FAILED'
      });
    }
  }

  /**
   * Process human review decision
   */
  public async processHumanReview(req: Request, res: Response): Promise<void> {
    try {
      const { reviewId, decision, feedback, modifiedContent } = req.body;
      const moderatorId = (req as any).user.id;

      if (!reviewId || !decision) {
        res.status(400).json({
          success: false,
          error: 'Review ID and decision are required',
          code: 'INVALID_REVIEW_DATA'
        });
        return;
      }

      if (!['approve', 'reject', 'modify'].includes(decision)) {
        res.status(400).json({
          success: false,
          error: 'Decision must be approve, reject, or modify',
          code: 'INVALID_DECISION'
        });
        return;
      }

      await this.moderationService.processHumanReview(
        reviewId,
        decision,
        moderatorId,
        feedback,
        modifiedContent
      );

      res.status(200).json({
        success: true,
        message: 'Human review decision processed successfully',
        data: {
          reviewId,
          decision,
          processedBy: moderatorId
        }
      });

    } catch (error) {
      logger.error('❌ Failed to process human review', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process human review',
        code: 'REVIEW_PROCESSING_FAILED'
      });
    }
  }

  /**
   * Add verified fact to database
   */
  public async addVerifiedFact(req: Request, res: Response): Promise<void> {
    try {
      const { fact, domain = 'general' } = req.body;

      if (!fact || !fact.statement) {
        res.status(400).json({
          success: false,
          error: 'Fact with statement is required',
          code: 'INVALID_FACT'
        });
        return;
      }

      await this.factVerificationService.addVerifiedFact(fact, domain);

      res.status(200).json({
        success: true,
        message: 'Verified fact added successfully',
        data: { fact, domain }
      });

    } catch (error) {
      logger.error('❌ Failed to add verified fact', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to add verified fact',
        code: 'FACT_ADD_FAILED'
      });
    }
  }

  /**
   * Get comprehensive system health
   */
  public async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const providerHealth = this.multiProviderService.getProviderHealthStatuses();
      const moderationStats = this.moderationService.getModerationStatistics();
      const factVerificationStats = this.factVerificationService.getVerificationStatistics();

      const systemHealth = {
        overall: 'healthy',
        services: {
          multiProviderAI: {
            status: providerHealth.some(p => p.isHealthy) ? 'healthy' : 'degraded',
            providers: providerHealth.length,
            healthyProviders: providerHealth.filter(p => p.isHealthy).length
          },
          contentModeration: {
            status: 'healthy',
            totalRequests: moderationStats.totalRequests,
            approvalRate: moderationStats.approvalRate,
            queueSize: moderationStats.humanReviewQueueSize
          },
          factVerification: {
            status: 'healthy',
            totalRequests: factVerificationStats.totalRequests,
            verificationRate: factVerificationStats.accuracy?.verificationRate || 0,
            factDatabaseSize: factVerificationStats.factDatabaseSize
          }
        },
        metrics: {
          providerAverageResponseTime: providerHealth.reduce((sum, p) => sum + p.responseTime, 0) / Math.max(1, providerHealth.length),
          moderationAverageProcessingTime: moderationStats.averageProcessingTime,
          factVerificationAverageTime: factVerificationStats.averageProcessingTime
        }
      };

      res.status(200).json({
        success: true,
        data: systemHealth
      });

    } catch (error) {
      logger.error('❌ Failed to get system health', {
        component: 'AdvancedAiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get system health',
        code: 'HEALTH_CHECK_FAILED'
      });
    }
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallQuality(metadata: any): number {
    const weights = {
      aiQuality: 0.4,
      moderationScore: 0.3,
      factualAccuracy: 0.3
    };

    const aiQuality = metadata.quality?.aiQuality || 0.8;
    const moderationScore = metadata.moderation?.approved ? 
      metadata.moderation.confidence : 
      Math.max(0, 1 - metadata.moderation?.confidence || 0);
    const factualAccuracy = metadata.factCheck?.confidence || 0.8;

    return (
      aiQuality * weights.aiQuality +
      moderationScore * weights.moderationScore +
      factualAccuracy * weights.factualAccuracy
    );
  }
}

export default AdvancedAiController;

