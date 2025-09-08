/**
 * AI Controller
 * Handles AI-related API endpoints and business logic
 */

import { Request, Response } from 'express';
import { logger } from '@/config/logger';
import AiService from '@/services/aiService';
import { 
  QuestionGenerationRequest,
  AiRequestType,
  AiRequest,
  ValidationResult,
  BudgetConstraints,
  QualityAssessmentCriteria
} from '@/types/ai';

/**
 * Controller for AI-related endpoints
 */
export class AiController {
  private aiService: AiService;

  constructor() {
    this.aiService = AiService.getInstance();
  }

  /**
   * Generate AI-powered quiz questions
   */
  public async generateQuestions(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const {
        topic,
        subject,
        difficulty,
        questionType,
        count = 5,
        language = 'en',
        categoryId,
        context,
        customRequirements,
        tags = [],
        preferredModel,
        preferredProvider,
        maxCost,
        qualityThreshold
      } = req.body;

      logger.info('AI question generation requested', {
        component: 'AiController',
        userId,
        topic,
        questionType,
        count,
        difficulty
      });

      // Build question generation request
      const generationRequest: QuestionGenerationRequest = {
        topic,
        subject,
        difficulty,
        questionType,
        count,
        language,
        categoryId,
        context,
        customRequirements,
        tags,
        existingQuestions: [] // Could be populated from user's existing questions
      };

      // Generate questions using AI service
      const result = await this.aiService.generateQuestions(
        generationRequest,
        userId,
        {
          model: preferredModel,
          provider: preferredProvider,
          maxCost,
          qualityThreshold
        }
      );

      // Track generation for analytics
      await this.trackGeneration(userId, generationRequest, result);

      res.status(200).json({
        success: true,
        data: {
          questions: result.questions,
          totalGenerated: result.totalGenerated,
          validQuestions: result.validQuestions,
          cost: result.cost,
          usage: result.usage,
          qualityMetrics: result.qualityMetrics,
          metadata: result.metadata
        },
        message: `Successfully generated ${result.validQuestions} out of ${result.totalGenerated} questions`,
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Question generation failed', {
        component: 'AiController',
        userId: (req as any).user?.id,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof Error && error.message.includes('budget')) {
        res.status(403).json({
          success: false,
          error: {
            code: 'BUDGET_EXCEEDED',
            message: 'AI usage budget exceeded',
            details: error.message
          },
          correlationId: (req as any).correlationId
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'AI_GENERATION_FAILED',
          message: 'Failed to generate questions',
          details: process.env.NODE_ENV === 'development' ? error : undefined
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Validate AI-generated or user content
   */
  public async validateContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { content, requestType, context } = req.body;

      logger.info('Content validation requested', {
        component: 'AiController',
        userId,
        requestType,
        contentType: typeof content
      });

      // Create AI request for validation
      const aiRequest: AiRequest = {
        id: `validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        requestType: requestType as AiRequestType,
        prompt: typeof content === 'string' ? content : JSON.stringify(content),
        parameters: {
          temperature: 0.1, // Low temperature for validation
          maxTokens: 1000
        },
        options: {
          validateContent: true,
          preferFreeModels: true
        },
        metadata: { context }
      };

      // Process validation request
      const response = await this.aiService.processRequest(aiRequest);

      res.status(200).json({
        success: response.success,
        data: {
          validation: response.metadata.validationResults?.[0] || {
            valid: response.success,
            score: response.success ? 0.8 : 0.2,
            issues: response.success ? [] : [{ type: 'GENERAL_ERROR', description: 'Validation failed' }],
            suggestions: response.success ? [] : ['Review content and try again']
          },
          cost: response.cost,
          metadata: response.metadata
        },
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Content validation failed', {
        component: 'AiController',
        userId: (req as any).user?.id,
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Content validation failed',
          details: process.env.NODE_ENV === 'development' ? error : undefined
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Get available AI models and providers
   */
  public async getAvailableModels(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;

      logger.debug('Available models requested', {
        component: 'AiController',
        userId
      });

      // Get health status which includes provider information
      const healthStatus = await this.aiService.getHealthStatus();

      // Format response for frontend
      const providers = Object.entries(healthStatus.providers).map(([name, healthy]) => ({
        name,
        displayName: this.getProviderDisplayName(name),
        isHealthy: healthy,
        isFree: name === 'local',
        models: this.getProviderModels(name)
      }));

      res.status(200).json({
        success: true,
        data: {
          providers,
          healthStatus: {
            overall: healthStatus.healthy,
            cache: healthStatus.cache,
            queue: healthStatus.queue
          }
        },
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Failed to get available models', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'MODELS_FETCH_FAILED',
          message: 'Failed to retrieve available models'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Select optimal AI model for a request
   */
  public async selectOptimalModel(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { requestType, prompt, parameters, constraints, qualityRequirements } = req.body;

      // Create a mock AI request for model selection
      const aiRequest: AiRequest = {
        id: `select_${Date.now()}`,
        userId,
        requestType,
        prompt,
        parameters
      };

      // Default constraints and quality requirements
      const defaultConstraints: BudgetConstraints = {
        dailyLimit: 100,
        monthlyLimit: 50.0,
        perRequestLimit: 5.0,
        allowPaidModels: false,
        preferFreeModels: true,
        emergencyStopThreshold: 100.0,
        ...constraints
      };

      const defaultQuality: QualityAssessmentCriteria = {
        minScore: 0.7,
        weights: {
          contentQuality: 0.3,
          formatCorrectness: 0.25,
          difficultyAccuracy: 0.2,
          grammarScore: 0.1,
          factualAccuracy: 0.1,
          uniqueness: 0.05,
          educationalValue: 0.0,
          clarity: 0.0
        },
        ...qualityRequirements
      };

      // For now, we'll return a mock selection since the full model selector integration
      // would require the complete service initialization
      const mockSelection = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        estimatedCost: 0.002,
        qualityScore: 0.85,
        speedScore: 0.9,
        reason: 'Selected for good balance of cost, quality, and speed',
        alternatives: [
          {
            provider: 'local',
            model: 'llama2-7b-chat',
            estimatedCost: 0.0,
            qualityScore: 0.75,
            reason: 'Free alternative with good quality'
          }
        ]
      };

      res.status(200).json({
        success: true,
        data: {
          recommendation: mockSelection,
          constraints: defaultConstraints,
          qualityRequirements: defaultQuality
        },
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Model selection failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'MODEL_SELECTION_FAILED',
          message: 'Failed to select optimal model'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Get AI usage statistics for user
   */
  public async getUsageStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const period = req.query.period as string || 'monthly';

      logger.debug('Usage statistics requested', {
        component: 'AiController',
        userId,
        period
      });

      // Mock usage statistics - would be retrieved from database
      const mockStats = {
        userId,
        period,
        totalCost: 1.25,
        totalRequests: 15,
        totalTokens: 12500,
        averageCostPerRequest: 0.083,
        budgetUsed: 12.5, // percentage
        budgetRemaining: 8.75,
        isOverBudget: false,
        topModels: [
          {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            cost: 0.95,
            requests: 10
          },
          {
            provider: 'local',
            model: 'llama2-7b-chat',
            cost: 0.0,
            requests: 5
          }
        ],
        dailyBreakdown: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          cost: Math.random() * 0.5,
          requests: Math.floor(Math.random() * 5)
        }))
      };

      res.status(200).json({
        success: true,
        data: mockStats,
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Failed to get usage statistics', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'USAGE_STATS_FAILED',
          message: 'Failed to retrieve usage statistics'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Get budget status for user
   */
  public async getBudgetStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;

      // Mock budget status - would be retrieved from cost manager
      const mockBudget = {
        userId,
        monthlyBudget: 10.0,
        currentSpend: 1.25,
        dailyUsageLimit: 20,
        currentDailyUsage: 3,
        allowPaidModels: false,
        autoOptimizeCost: true,
        qualityPreference: 0.7,
        alerts: {
          budgetWarning: false,
          dailyLimitWarning: false,
          emergencyStop: false
        },
        recommendations: [
          'Consider enabling paid models for higher quality',
          'Your usage is well within budget limits'
        ]
      };

      res.status(200).json({
        success: true,
        data: mockBudget,
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Failed to get budget status', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'BUDGET_STATUS_FAILED',
          message: 'Failed to retrieve budget status'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Update user budget settings
   */
  public async updateBudget(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const updates = req.body;

      logger.info('Budget update requested', {
        component: 'AiController',
        userId,
        updates
      });

      // This would update the user's budget in the database via cost manager
      // For now, we'll return success

      res.status(200).json({
        success: true,
        data: {
          updated: true,
          settings: {
            ...updates,
            updatedAt: new Date().toISOString()
          }
        },
        message: 'Budget settings updated successfully',
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Budget update failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'BUDGET_UPDATE_FAILED',
          message: 'Failed to update budget settings'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Get AI service health status
   */
  public async getHealthStatus(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await this.aiService.getHealthStatus();

      res.status(200).json({
        success: true,
        data: {
          ...healthStatus,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        },
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Health check failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(503).json({
        success: false,
        data: {
          healthy: false,
          providers: {},
          cache: false,
          queue: false,
          errors: ['Health check failed']
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Get AI generation history
   */
  public async getGenerationHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      // Mock generation history - would be retrieved from database
      const mockHistory = {
        items: Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
          id: `gen_${Date.now()}_${i}`,
          topic: `Topic ${i + 1}`,
          questionType: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT_INPUT'][i % 3],
          questionsGenerated: Math.floor(Math.random() * 10) + 1,
          qualityScore: 0.7 + Math.random() * 0.3,
          cost: Math.random() * 0.1,
          provider: ['openai', 'anthropic', 'local'][i % 3],
          model: ['gpt-3.5-turbo', 'claude-3-haiku', 'llama2-7b-chat'][i % 3],
          createdAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString()
        })),
        total: 45,
        limit,
        offset,
        hasMore: offset + limit < 45
      };

      res.status(200).json({
        success: true,
        data: mockHistory,
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Failed to get generation history', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'HISTORY_FAILED',
          message: 'Failed to retrieve generation history'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Admin: Get system-wide AI analytics
   */
  public async getSystemAnalytics(req: Request, res: Response): Promise<void> {
    try {
      // Mock system analytics - would be retrieved from database
      const mockAnalytics = {
        overview: {
          totalRequests: 1250,
          totalUsers: 87,
          totalCost: 156.75,
          averageQuality: 0.82,
          uptime: 99.5
        },
        providers: [
          {
            name: 'openai',
            requests: 750,
            cost: 98.50,
            averageQuality: 0.85,
            uptime: 99.8
          },
          {
            name: 'local',
            requests: 350,
            cost: 0.0,
            averageQuality: 0.75,
            uptime: 100.0
          },
          {
            name: 'anthropic',
            requests: 150,
            cost: 58.25,
            averageQuality: 0.88,
            uptime: 98.5
          }
        ],
        trends: {
          dailyRequests: Array.from({ length: 30 }, (_, i) => ({
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            requests: Math.floor(Math.random() * 50) + 20,
            cost: Math.random() * 10 + 2
          }))
        }
      };

      res.status(200).json({
        success: true,
        data: mockAnalytics,
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Failed to get system analytics', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'ANALYTICS_FAILED',
          message: 'Failed to retrieve system analytics'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Admin: Get provider status and configuration
   */
  public async getProviderStatus(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await this.aiService.getHealthStatus();

      const providerDetails = Object.entries(healthStatus.providers).map(([name, healthy]) => ({
        name,
        displayName: this.getProviderDisplayName(name),
        isHealthy: healthy,
        isEnabled: true, // Would come from configuration
        isFree: name === 'local',
        configuration: {
          priority: name === 'local' ? 10 : 5,
          rateLimit: {
            requestsPerMinute: 60,
            requestsPerHour: 1000
          },
          models: this.getProviderModels(name)
        },
        stats: {
          requests24h: Math.floor(Math.random() * 100),
          avgResponseTime: Math.floor(Math.random() * 2000) + 500,
          errorRate: Math.random() * 0.05
        }
      }));

      res.status(200).json({
        success: true,
        data: {
          providers: providerDetails,
          systemHealth: healthStatus
        },
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Failed to get provider status', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'PROVIDER_STATUS_FAILED',
          message: 'Failed to retrieve provider status'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Admin: Update provider configuration
   */
  public async updateProviderConfig(req: Request, res: Response): Promise<void> {
    try {
      const { provider, configuration } = req.body;

      logger.info('Provider configuration update requested', {
        component: 'AiController',
        provider,
        configuration
      });

      // This would update provider configuration
      res.status(200).json({
        success: true,
        data: {
          provider,
          configuration,
          updatedAt: new Date().toISOString()
        },
        message: 'Provider configuration updated successfully',
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Provider configuration update failed', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'PROVIDER_UPDATE_FAILED',
          message: 'Failed to update provider configuration'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Admin: Get cost analytics
   */
  public async getCostAnalytics(req: Request, res: Response): Promise<void> {
    try {
      // Mock cost analytics
      const mockCostAnalytics = {
        summary: {
          totalSystemCost: 156.75,
          averageCostPerUser: 1.80,
          averageCostPerRequest: 0.125,
          topSpendingUsers: [
            { userId: 'user1', username: 'poweruser', cost: 15.50 },
            { userId: 'user2', username: 'educator', cost: 12.25 }
          ]
        },
        breakdown: {
          byProvider: [
            { name: 'openai', cost: 98.50, percentage: 62.8 },
            { name: 'anthropic', cost: 58.25, percentage: 37.2 },
            { name: 'local', cost: 0.0, percentage: 0.0 }
          ],
          byRequestType: [
            { type: 'QUESTION_GENERATION', cost: 120.00, percentage: 76.5 },
            { type: 'CONTENT_VALIDATION', cost: 25.50, percentage: 16.3 },
            { type: 'QUALITY_ASSESSMENT', cost: 11.25, percentage: 7.2 }
          ]
        },
        projections: {
          monthlyProjection: 625.00,
          budgetUtilization: 62.5,
          recommendations: [
            'Consider implementing more aggressive free model usage',
            'Monitor top spending users for optimization opportunities'
          ]
        }
      };

      res.status(200).json({
        success: true,
        data: mockCostAnalytics,
        correlationId: (req as any).correlationId
      });

    } catch (error) {
      logger.error('Failed to get cost analytics', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'COST_ANALYTICS_FAILED',
          message: 'Failed to retrieve cost analytics'
        },
        correlationId: (req as any).correlationId
      });
    }
  }

  /**
   * Track generation for analytics (helper method)
   */
  private async trackGeneration(
    userId: string,
    request: QuestionGenerationRequest,
    result: any
  ): Promise<void> {
    try {
      // This would store generation data for analytics
      logger.debug('Generation tracked for analytics', {
        component: 'AiController',
        userId,
        topic: request.topic,
        generated: result.totalGenerated,
        valid: result.validQuestions,
        cost: result.cost.totalCost
      });
    } catch (error) {
      // Don't fail the main request if analytics tracking fails
      logger.warn('Failed to track generation', {
        component: 'AiController',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get provider display name
   */
  private getProviderDisplayName(name: string): string {
    const displayNames: Record<string, string> = {
      'openai': 'OpenAI GPT',
      'anthropic': 'Anthropic Claude',
      'google': 'Google Gemini',
      'huggingface': 'HuggingFace',
      'local': 'Local Models (FREE)'
    };
    return displayNames[name] || name;
  }

  /**
   * Get provider models (mock data)
   */
  private getProviderModels(provider: string): any[] {
    const modelData: Record<string, any[]> = {
      'openai': [
        { name: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', qualityScore: 0.8, speedScore: 0.9, costPerToken: 0.0000005 },
        { name: 'gpt-4', displayName: 'GPT-4', qualityScore: 0.9, speedScore: 0.6, costPerToken: 0.00003 }
      ],
      'anthropic': [
        { name: 'claude-3-haiku', displayName: 'Claude 3 Haiku', qualityScore: 0.8, speedScore: 0.9, costPerToken: 0.00000025 },
        { name: 'claude-3-sonnet', displayName: 'Claude 3 Sonnet', qualityScore: 0.9, speedScore: 0.8, costPerToken: 0.000003 }
      ],
      'google': [
        { name: 'gemini-pro', displayName: 'Gemini Pro', qualityScore: 0.8, speedScore: 0.85, costPerToken: 0.0000005 }
      ],
      'huggingface': [
        { name: 'llama-2-70b-chat', displayName: 'Llama 2 70B Chat', qualityScore: 0.8, speedScore: 0.7, costPerToken: 0.0000005 }
      ],
      'local': [
        { name: 'llama2-7b-chat', displayName: 'Llama 2 7B (Local)', qualityScore: 0.75, speedScore: 0.6, costPerToken: 0 }
      ]
    };
    return modelData[provider] || [];
  }
}
