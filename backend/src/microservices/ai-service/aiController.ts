import { Request, Response } from 'express';
import { AiService } from './aiService';
import { logger } from '../../utils/logger';
import { 
  successResponse, 
  errorResponse,
  badRequestResponse
} from '../../utils/responseUtils';
import { AuthenticatedRequest } from '../../types/auth';

export class AiController {
  private aiService: AiService;

  constructor() {
    this.aiService = new AiService();
  }

  /**
   * Generate questions using AI
   */
  public generateQuestions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        topic,
        difficulty,
        type,
        category,
        subject,
        context,
        constraints,
        count = 1
      } = req.body;

      if (!topic || !difficulty || !type || !category || !subject) {
        badRequestResponse(res, 'Missing required fields: topic, difficulty, type, category, subject');
        return;
      }

      if (count < 1 || count > 20) {
        badRequestResponse(res, 'Count must be between 1 and 20');
        return;
      }

      const questions = await this.aiService.generateQuestions({
        topic,
        difficulty,
        type,
        category,
        subject,
        context,
        constraints
      }, count);

      logger.info('Questions generated via AI successfully', {
        component: 'AiController',
        count: questions.length,
        topic,
        difficulty,
        type,
        userId: req.user?.id
      });

      successResponse(res, {
        questions,
        metadata: {
          generatedCount: questions.length,
          requestedCount: count,
          averageQualityScore: questions.reduce((sum, q) => sum + q.metadata.qualityScore, 0) / questions.length,
          totalProcessingTime: questions.reduce((sum, q) => sum + q.metadata.processingTime, 0)
        }
      }, 'Questions generated successfully', 201);
    } catch (error) {
      logger.error('AI question generation failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to generate questions');
    }
  };

  /**
   * Moderate content
   */
  public moderateContent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { content, type, context } = req.body;

      if (!content || !type) {
        badRequestResponse(res, 'Content and type are required');
        return;
      }

      if (!['question', 'answer', 'comment', 'discussion'].includes(type)) {
        badRequestResponse(res, 'Invalid content type. Must be: question, answer, comment, or discussion');
        return;
      }

      const result = await this.aiService.moderateContent({
        content,
        type,
        context
      });

      logger.info('Content moderated successfully', {
        component: 'AiController',
        approved: result.approved,
        flags: result.flags.length,
        severity: result.severity,
        contentLength: content.length
      });

      successResponse(res, result, 'Content moderated successfully');
    } catch (error) {
      logger.error('Content moderation failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to moderate content');
    }
  };

  /**
   * Verify facts
   */
  public verifyFacts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { claim, context, domain } = req.body;

      if (!claim) {
        badRequestResponse(res, 'Claim is required for fact verification');
        return;
      }

      const result = await this.aiService.verifyFacts({
        claim,
        context,
        domain
      });

      logger.info('Facts verified successfully', {
        component: 'AiController',
        accuracy: result.accuracy,
        confidence: result.confidence,
        sourcesCount: result.sources.length,
        claimLength: claim.length
      });

      successResponse(res, result, 'Facts verified successfully');
    } catch (error) {
      logger.error('Fact verification failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to verify facts');
    }
  };

  /**
   * Enhance content
   */
  public enhanceContent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { content, type, targetLanguage, maxLength, style } = req.body;

      if (!content || !type) {
        badRequestResponse(res, 'Content and type are required');
        return;
      }

      if (!['improve', 'summarize', 'expand', 'translate'].includes(type)) {
        badRequestResponse(res, 'Invalid enhancement type. Must be: improve, summarize, expand, or translate');
        return;
      }

      if (type === 'translate' && !targetLanguage) {
        badRequestResponse(res, 'Target language is required for translation');
        return;
      }

      const result = await this.aiService.enhanceContent({
        content,
        type,
        targetLanguage,
        maxLength,
        style
      });

      logger.info('Content enhanced successfully', {
        component: 'AiController',
        type,
        originalLength: result.original.length,
        enhancedLength: result.enhanced.length,
        changesCount: result.changes.length,
        readabilityImprovement: result.metrics.readabilityScore
      });

      successResponse(res, result, 'Content enhanced successfully');
    } catch (error) {
      logger.error('Content enhancement failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to enhance content');
    }
  };

  /**
   * Batch process multiple AI operations
   */
  public batchProcess = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { operations } = req.body;

      if (!operations || !Array.isArray(operations)) {
        badRequestResponse(res, 'Operations array is required');
        return;
      }

      if (operations.length > 10) {
        badRequestResponse(res, 'Maximum 10 operations allowed per batch');
        return;
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        
        try {
          let result;
          
          switch (operation.type) {
            case 'generateQuestions':
              result = await this.aiService.generateQuestions(operation.params, operation.count || 1);
              break;
            
            case 'moderateContent':
              result = await this.aiService.moderateContent(operation.params);
              break;
            
            case 'verifyFacts':
              result = await this.aiService.verifyFacts(operation.params);
              break;
            
            case 'enhanceContent':
              result = await this.aiService.enhanceContent(operation.params);
              break;
            
            default:
              throw new Error(`Unknown operation type: ${operation.type}`);
          }

          results.push({
            index: i,
            type: operation.type,
            success: true,
            result
          });
        } catch (error) {
          errors.push({
            index: i,
            type: operation.type,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logger.info('Batch AI operations completed', {
        component: 'AiController',
        totalOperations: operations.length,
        successfulOperations: results.length,
        failedOperations: errors.length,
        userId: req.user?.id
      });

      successResponse(res, {
        results,
        errors,
        summary: {
          total: operations.length,
          successful: results.length,
          failed: errors.length
        }
      }, 'Batch operations completed');
    } catch (error) {
      logger.error('Batch AI processing failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to process batch operations');
    }
  };

  /**
   * Get AI service capabilities
   */
  public getCapabilities = async (req: Request, res: Response): Promise<void> => {
    try {
      const capabilities = {
        questionGeneration: {
          supported: true,
          maxCount: 20,
          supportedTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY'],
          supportedDifficulties: ['EASY', 'MEDIUM', 'HARD', 'EXPERT'],
          features: ['contextual-generation', 'quality-scoring', 'explanation-generation']
        },
        contentModeration: {
          supported: true,
          supportedTypes: ['question', 'answer', 'comment', 'discussion'],
          features: ['bias-detection', 'toxicity-filtering', 'appropriateness-check', 'educational-suitability']
        },
        factVerification: {
          supported: true,
          features: ['source-verification', 'credibility-scoring', 'accuracy-assessment', 'multi-source-validation']
        },
        contentEnhancement: {
          supported: true,
          supportedTypes: ['improve', 'summarize', 'expand', 'translate'],
          supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'],
          features: ['style-adaptation', 'readability-optimization', 'length-control']
        },
        batchProcessing: {
          supported: true,
          maxOperations: 10,
          parallelProcessing: true
        }
      };

      successResponse(res, capabilities, 'AI service capabilities retrieved successfully');
    } catch (error) {
      logger.error('Failed to get AI capabilities', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to get AI capabilities');
    }
  };

  /**
   * Get AI service statistics
   */
  public getStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      // Mock statistics for now - in a real implementation, this would come from a metrics store
      const stats = {
        totalRequests: 15420,
        requestsToday: 342,
        averageResponseTime: 1250,
        successRate: 0.987,
        operationBreakdown: {
          questionGeneration: { count: 8945, averageTime: 2100, successRate: 0.992 },
          contentModeration: { count: 4321, averageTime: 650, successRate: 0.995 },
          factVerification: { count: 1876, averageTime: 3200, successRate: 0.945 },
          contentEnhancement: { count: 278, averageTime: 1800, successRate: 0.988 }
        },
        aiProviderUsage: {
          'openai': { percentage: 65, averageResponseTime: 1100, successRate: 0.99 },
          'anthropic': { percentage: 25, averageResponseTime: 1350, successRate: 0.98 },
          'google': { percentage: 10, averageResponseTime: 980, successRate: 0.975 }
        },
        qualityMetrics: {
          averageQuestionQuality: 0.84,
          moderationAccuracy: 0.96,
          factCheckAccuracy: 0.91,
          enhancementSatisfaction: 0.89
        }
      };

      successResponse(res, stats, 'AI service statistics retrieved successfully');
    } catch (error) {
      logger.error('Failed to get AI statistics', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to get AI statistics');
    }
  };

  /**
   * Health check for AI service
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.aiService.healthCheck();

      if (health.status === 'healthy') {
        successResponse(res, health, 'AI service is healthy');
      } else {
        errorResponse(res, 'AI service is unhealthy', 503, health);
      }
    } catch (error) {
      logger.error('AI service health check failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'AI service is unhealthy', 503);
    }
  };
}

export default AiController;

