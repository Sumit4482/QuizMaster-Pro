/**
 * AI Model Selector
 * Intelligently selects the best AI model based on requirements, cost constraints, and quality thresholds
 */

import { logger } from '@/config/logger';
import {
  IAiModelSelector,
  IAiProvider,
  AiRequest,
  AiProviderConfig,
  AiModelConfig,
  BudgetConstraints,
  QualityAssessmentCriteria,
  AiCapability,
  AiRequestType
} from '@/types/ai';

export interface ModelSelectionResult {
  provider: string;
  model: string;
  estimatedCost: number;
  qualityScore: number;
  speedScore: number;
  reason: string;
  alternatives: Array<{
    provider: string;
    model: string;
    estimatedCost: number;
    qualityScore: number;
    reason: string;
  }>;
}

export interface ModelSelectorConfig {
  preferFreeModels: boolean;
  maxCostPerRequest: number;
  minQualityThreshold: number;
  prioritizeSpeed: boolean;
  fallbackToAnyModel: boolean;
}

/**
 * Intelligent AI Model Selector
 * Chooses optimal models based on cost, quality, speed, and capability requirements
 */
export class AiModelSelector implements IAiModelSelector {
  private providers: IAiProvider[];
  private providerConfigs: AiProviderConfig[];
  private config: ModelSelectorConfig;
  
  // Model performance history for learning
  private performanceHistory: Map<string, {
    averageQuality: number;
    averageSpeed: number;
    successRate: number;
    totalRequests: number;
    lastUpdated: Date;
  }> = new Map();

  constructor(
    providers: IAiProvider[],
    providerConfigs: AiProviderConfig[],
    config: Partial<ModelSelectorConfig> = {}
  ) {
    this.providers = providers;
    this.providerConfigs = providerConfigs;
    this.config = {
      preferFreeModels: config.preferFreeModels ?? true,
      maxCostPerRequest: config.maxCostPerRequest ?? 1.0,
      minQualityThreshold: config.minQualityThreshold ?? 0.7,
      prioritizeSpeed: config.prioritizeSpeed ?? false,
      fallbackToAnyModel: config.fallbackToAnyModel ?? true,
      ...config
    };
  }

  /**
   * Select the best model for a given request
   */
  public async selectBestModel(
    request: AiRequest,
    constraints: BudgetConstraints,
    qualityRequirements: QualityAssessmentCriteria
  ): Promise<ModelSelectionResult> {
    try {
      logger.debug('Starting model selection process', {
        component: 'AiModelSelector',
        requestId: request.id,
        requestType: request.requestType,
        constraints,
        qualityRequirements
      });

      // Get all available models
      const availableModels = await this.getAvailableModels();
      
      if (availableModels.length === 0) {
        throw new Error('No AI models are currently available');
      }

      // Filter models based on capabilities
      const capableModels = this.filterByCapabilities(availableModels, request.requestType);
      
      if (capableModels.length === 0) {
        if (this.config.fallbackToAnyModel) {
          logger.warn('No models support required capability, using any available model', {
            component: 'AiModelSelector',
            requestType: request.requestType
          });
        } else {
          throw new Error(`No models support capability: ${request.requestType}`);
        }
      }

      // Apply user preferences and constraints
      const modelsToConsider = capableModels.length > 0 ? capableModels : availableModels;
      
      // Score and rank models
      const scoredModels = await this.scoreModels(
        modelsToConsider,
        request,
        constraints,
        qualityRequirements
      );

      // Select the best model
      const bestModel = this.selectOptimalModel(scoredModels, constraints);
      
      if (!bestModel) {
        throw new Error('No suitable model found for the request');
      }

      const result: ModelSelectionResult = {
        provider: bestModel.provider,
        model: bestModel.model,
        estimatedCost: bestModel.estimatedCost,
        qualityScore: bestModel.totalScore,
        speedScore: bestModel.speedScore,
        reason: bestModel.reason,
        alternatives: scoredModels.slice(1, 4).map(alt => ({
          provider: alt.provider,
          model: alt.model,
          estimatedCost: alt.estimatedCost,
          qualityScore: alt.totalScore,
          reason: alt.reason
        }))
      };

      logger.info('Model selected successfully', {
        component: 'AiModelSelector',
        requestId: request.id,
        selectedProvider: result.provider,
        selectedModel: result.model,
        estimatedCost: result.estimatedCost,
        qualityScore: result.qualityScore
      });

      return result;

    } catch (error) {
      logger.error('Model selection failed', {
        component: 'AiModelSelector',
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get all available models from all providers
   */
  private async getAvailableModels(): Promise<Array<{
    provider: string;
    providerConfig: AiProviderConfig;
    model: AiModelConfig;
  }>> {
    const models: Array<{
      provider: string;
      providerConfig: AiProviderConfig;
      model: AiModelConfig;
    }> = [];

    for (const providerConfig of this.providerConfigs) {
      if (!providerConfig.isActive) continue;
      
      const provider = this.providers.find(p => p.name === providerConfig.name);
      if (!provider) continue;

      try {
        // Check if provider is available
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          logger.warn(`Provider ${provider.name} is not available`, {
            component: 'AiModelSelector'
          });
          continue;
        }

        // Get models from provider
        const providerModels = provider.getModels();
        for (const model of providerModels) {
          if (model.isActive) {
            models.push({
              provider: provider.name,
              providerConfig,
              model
            });
          }
        }
      } catch (error) {
        logger.warn(`Failed to get models from provider ${provider.name}`, {
          component: 'AiModelSelector',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return models;
  }

  /**
   * Filter models by required capabilities
   */
  private filterByCapabilities(
    models: Array<{ provider: string; providerConfig: AiProviderConfig; model: AiModelConfig }>,
    requestType: AiRequestType
  ): Array<{ provider: string; providerConfig: AiProviderConfig; model: AiModelConfig }> {
    const requiredCapability = this.mapRequestTypeToCapability(requestType);
    
    if (!requiredCapability) {
      return models; // No specific capability required
    }

    return models.filter(({ model }) => 
      model.capabilities.includes(requiredCapability)
    );
  }

  /**
   * Map request type to required capability
   */
  private mapRequestTypeToCapability(requestType: AiRequestType): AiCapability | null {
    const mapping: Record<AiRequestType, AiCapability | null> = {
      [AiRequestType.QUESTION_GENERATION]: AiCapability.QUESTION_GENERATION,
      [AiRequestType.BATCH_GENERATION]: AiCapability.QUESTION_GENERATION,
      [AiRequestType.CONTENT_VALIDATION]: AiCapability.CONTENT_VALIDATION,
      [AiRequestType.QUALITY_ASSESSMENT]: AiCapability.CONTENT_VALIDATION,
      [AiRequestType.FACT_CHECK]: AiCapability.FACT_CHECKING,
      [AiRequestType.OPTIMIZATION]: null,
      [AiRequestType.ANALYSIS]: AiCapability.CLASSIFICATION
    };

    return mapping[requestType] || null;
  }

  /**
   * Score and rank models based on various criteria
   */
  private async scoreModels(
    models: Array<{ provider: string; providerConfig: AiProviderConfig; model: AiModelConfig }>,
    request: AiRequest,
    constraints: BudgetConstraints,
    qualityRequirements: QualityAssessmentCriteria
  ): Promise<Array<{
    provider: string;
    model: string;
    estimatedCost: number;
    qualityScore: number;
    speedScore: number;
    reliabilityScore: number;
    totalScore: number;
    reason: string;
  }>> {
    const scoredModels: Array<{
      provider: string;
      model: string;
      estimatedCost: number;
      qualityScore: number;
      speedScore: number;
      reliabilityScore: number;
      totalScore: number;
      reason: string;
    }> = [];

    for (const { provider, providerConfig, model } of models) {
      try {
        // Estimate cost
        const estimatedCost = this.estimateRequestCost(request, model);
        
        // Check budget constraints
        if (!constraints.allowPaidModels && estimatedCost > 0) {
          continue; // Skip paid models if not allowed
        }
        
        if (estimatedCost > constraints.perRequestLimit) {
          continue; // Skip models that exceed per-request limit
        }

        // Get performance scores
        const performance = this.getModelPerformance(provider, model.name);
        const qualityScore = performance?.averageQuality || model.qualityScore;
        const speedScore = performance?.averageSpeed || model.speedScore;
        const reliabilityScore = performance?.successRate || model.reliabilityScore;

        // Check quality threshold
        if (qualityScore < qualityRequirements.minScore) {
          continue; // Skip models below quality threshold
        }

        // Calculate total score
        const totalScore = this.calculateTotalScore({
          qualityScore,
          speedScore,
          reliabilityScore,
          cost: estimatedCost,
          isFree: providerConfig.isFree,
          priority: providerConfig.priority
        }, constraints);

        // Generate selection reason
        const reason = this.generateSelectionReason({
          provider,
          model: model.name,
          cost: estimatedCost,
          qualityScore,
          speedScore,
          isFree: providerConfig.isFree
        });

        scoredModels.push({
          provider,
          model: model.name,
          estimatedCost,
          qualityScore,
          speedScore,
          reliabilityScore,
          totalScore,
          reason
        });

      } catch (error) {
        logger.warn(`Failed to score model ${provider}/${model.name}`, {
          component: 'AiModelSelector',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Sort by total score (descending)
    return scoredModels.sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Estimate the cost of a request for a given model
   */
  private estimateRequestCost(request: AiRequest, model: AiModelConfig): number {
    if (model.costPerToken === null || model.costPerToken === undefined) {
      return 0; // Free model
    }

    // Estimate token usage
    const promptTokens = Math.ceil(request.prompt.length / 4); // Rough estimation
    const maxOutputTokens = request.parameters?.maxTokens || 1000;
    
    const inputCost = promptTokens * model.costPerToken;
    const outputCost = maxOutputTokens * model.costPerToken * 2; // Output usually costs more
    
    return inputCost + outputCost;
  }

  /**
   * Get historical performance data for a model
   */
  private getModelPerformance(provider: string, modelName: string) {
    const key = `${provider}:${modelName}`;
    return this.performanceHistory.get(key);
  }

  /**
   * Calculate total score for model selection
   */
  private calculateTotalScore(metrics: {
    qualityScore: number;
    speedScore: number;
    reliabilityScore: number;
    cost: number;
    isFree: boolean;
    priority: number;
  }, constraints: BudgetConstraints): number {
    let score = 0;

    // Base quality score (40% weight)
    score += metrics.qualityScore * 0.4;

    // Speed score (20% weight, more if prioritized)
    const speedWeight = this.config.prioritizeSpeed ? 0.3 : 0.2;
    score += metrics.speedScore * speedWeight;

    // Reliability score (20% weight)
    score += metrics.reliabilityScore * 0.2;

    // Cost penalty/bonus (20% weight)
    if (metrics.isFree || metrics.cost === 0) {
      // Free models get a bonus
      score += 0.2;
      if (this.config.preferFreeModels) {
        score += 0.1; // Additional bonus if preferring free models
      }
    } else {
      // Paid models get penalized based on cost
      const costRatio = metrics.cost / Math.max(constraints.perRequestLimit, 0.01);
      const costPenalty = Math.min(costRatio * 0.2, 0.2);
      score = Math.max(0, score - costPenalty);
    }

    // Provider priority bonus (up to 10%)
    const priorityBonus = (metrics.priority / 10) * 0.1;
    score += priorityBonus;

    return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
  }

  /**
   * Select the optimal model from scored models
   */
  private selectOptimalModel(scoredModels: Array<{
    provider: string;
    model: string;
    estimatedCost: number;
    qualityScore: number;
    speedScore: number;
    reliabilityScore: number;
    totalScore: number;
    reason: string;
  }>, constraints: BudgetConstraints) {
    if (scoredModels.length === 0) {
      return null;
    }

    // If preferring free models, prioritize them
    if (this.config.preferFreeModels) {
      const freeModels = scoredModels.filter(model => model.estimatedCost === 0);
      if (freeModels.length > 0) {
        return freeModels[0]; // Return best free model
      }
      
      if (!constraints.allowPaidModels) {
        return null; // No free models available and paid not allowed
      }
    }

    // Return the highest-scored model
    return scoredModels[0];
  }

  /**
   * Generate human-readable reason for model selection
   */
  private generateSelectionReason(model: {
    provider: string;
    model: string;
    cost: number;
    qualityScore: number;
    speedScore: number;
    isFree: boolean;
  }): string {
    const reasons: string[] = [];

    if (model.isFree) {
      reasons.push('free model');
    } else {
      reasons.push(`$${model.cost.toFixed(4)} estimated cost`);
    }

    if (model.qualityScore > 0.9) {
      reasons.push('high quality');
    } else if (model.qualityScore > 0.8) {
      reasons.push('good quality');
    }

    if (model.speedScore > 0.9) {
      reasons.push('fast response');
    } else if (model.speedScore > 0.8) {
      reasons.push('quick response');
    }

    return `Selected for ${reasons.join(', ')}`;
  }

  /**
   * Update model performance based on actual usage
   */
  public updateModelPerformance(
    provider: string,
    modelName: string,
    metrics: {
      qualityScore?: number;
      responseTime?: number;
      success: boolean;
    }
  ): void {
    const key = `${provider}:${modelName}`;
    const existing = this.performanceHistory.get(key);
    
    const totalRequests = (existing?.totalRequests || 0) + 1;
    const successRate = existing 
      ? (existing.successRate * existing.totalRequests + (metrics.success ? 1 : 0)) / totalRequests
      : (metrics.success ? 1 : 0);

    let averageQuality = existing?.averageQuality || 0.8;
    if (metrics.qualityScore !== undefined) {
      averageQuality = existing
        ? (existing.averageQuality * existing.totalRequests + metrics.qualityScore) / totalRequests
        : metrics.qualityScore;
    }

    let averageSpeed = existing?.averageSpeed || 0.8;
    if (metrics.responseTime !== undefined) {
      // Convert response time to speed score (faster = higher score)
      const speedScore = Math.max(0, 1 - (metrics.responseTime / 10000)); // 10 second baseline
      averageSpeed = existing
        ? (existing.averageSpeed * existing.totalRequests + speedScore) / totalRequests
        : speedScore;
    }

    this.performanceHistory.set(key, {
      averageQuality,
      averageSpeed,
      successRate,
      totalRequests,
      lastUpdated: new Date()
    });

    logger.debug('Updated model performance', {
      component: 'AiModelSelector',
      provider,
      model: modelName,
      totalRequests,
      averageQuality,
      averageSpeed,
      successRate
    });
  }

  /**
   * Get performance statistics
   */
  public getPerformanceStats(): Array<{
    provider: string;
    model: string;
    averageQuality: number;
    averageSpeed: number;
    successRate: number;
    totalRequests: number;
  }> {
    const stats: Array<{
      provider: string;
      model: string;
      averageQuality: number;
      averageSpeed: number;
      successRate: number;
      totalRequests: number;
    }> = [];
    
    for (const [key, data] of this.performanceHistory) {
      const [provider, model] = key.split(':');
      stats.push({
        provider,
        model,
        averageQuality: data.averageQuality,
        averageSpeed: data.averageSpeed,
        successRate: data.successRate,
        totalRequests: data.totalRequests
      });
    }

    return stats.sort((a, b) => b.totalRequests - a.totalRequests);
  }
}

export default AiModelSelector;
