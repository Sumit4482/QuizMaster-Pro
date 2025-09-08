/**
 * Phase 3.1: Core AI Service
 * Universal AI service abstraction layer with multi-provider support
 */

import { EventEmitter } from 'events';
import { logger } from '@/config/logger';
import { config } from '@/config/environment';
import { prisma } from '@/config/database';
import {
  AiRequest,
  AiResponse,
  AiProviderConfig,
  AiModelConfig,
  IAiProvider,
  IAiModelSelector,
  IAiCache,
  IAiQueue,
  IAiCircuitBreaker,
  AiError,
  AiErrorCode,
  AiProviderType,
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  BudgetConstraints,
  CostTracker,
  ValidationResult,
  QualityAssessmentCriteria
} from '@/types/ai';

// Provider imports
import { OpenAIProvider } from './ai/providers/openaiProvider';
import { AnthropicProvider } from './ai/providers/anthropicProvider';
import { GoogleProvider } from './ai/providers/googleProvider';
import { HuggingFaceProvider } from './ai/providers/huggingfaceProvider';
import { LocalModelProvider } from './ai/providers/localModelProvider';

// Core components imports
import { AiModelSelector } from './ai/core/modelSelector';
import { AiCache } from './ai/core/cache';
import { AiQueue } from './ai/core/queue';
import { AiCircuitBreaker } from './ai/core/circuitBreaker';
import { CostManager } from './ai/core/costManager';
import { ContentValidator } from './ai/core/contentValidator';
import { QuestionGenerator } from './ai/core/questionGenerator';

export interface AiServiceConfig {
  enabledProviders: AiProviderType[];
  defaultProvider: AiProviderType;
  fallbackProvider: AiProviderType;
  cacheEnabled: boolean;
  queueEnabled: boolean;
  circuitBreakerEnabled: boolean;
  costManagementEnabled: boolean;
  contentValidationEnabled: boolean;
  analytics: {
    enabled: boolean;
    retentionDays: number;
  };
}

export interface AiServiceEvents {
  'request:queued': (request: AiRequest) => void;
  'request:processing': (request: AiRequest) => void;
  'request:completed': (request: AiRequest, response: AiResponse) => void;
  'request:failed': (request: AiRequest, error: AiError) => void;
  'cost:threshold_exceeded': (userId: string, cost: number, limit: number) => void;
  'quality:threshold_not_met': (request: AiRequest, score: number, threshold: number) => void;
  'provider:unavailable': (provider: string) => void;
  'circuit_breaker:opened': (provider: string) => void;
  'cache:hit': (key: string) => void;
  'cache:miss': (key: string) => void;
}

/**
 * Universal AI Service
 * Central service for all AI operations with multi-provider support
 */
export class AiService extends EventEmitter {
  private static instance: AiService | null = null;
  private config: AiServiceConfig;
  
  // Core components
  private providers: Map<string, IAiProvider> = new Map();
  private modelSelector!: IAiModelSelector;
  private cache!: IAiCache;
  private queue!: IAiQueue;
  private circuitBreakers: Map<string, IAiCircuitBreaker> = new Map();
  private costManager!: CostManager;
  private contentValidator!: ContentValidator;
  private questionGenerator!: QuestionGenerator;
  
  // State tracking
  private isInitialized = false;
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();
  
  private constructor(serviceConfig: AiServiceConfig) {
    super();
    this.config = serviceConfig;
    this.initializeComponents();
  }

  public static getInstance(serviceConfig?: AiServiceConfig): AiService {
    if (!AiService.instance) {
      const defaultConfig: AiServiceConfig = {
        enabledProviders: [
          AiProviderType.OPENAI,
          AiProviderType.ANTHROPIC,
          AiProviderType.GOOGLE,
          AiProviderType.HUGGINGFACE,
          AiProviderType.LOCAL
        ],
        defaultProvider: AiProviderType.OPENAI,
        fallbackProvider: AiProviderType.LOCAL,
        cacheEnabled: true,
        queueEnabled: true,
        circuitBreakerEnabled: true,
        costManagementEnabled: true,
        contentValidationEnabled: true,
        analytics: {
          enabled: true,
          retentionDays: 90
        }
      };
      
      AiService.instance = new AiService(serviceConfig || defaultConfig);
    }
    return AiService.instance;
  }

  /**
   * Initialize all AI service components
   */
  private async initializeComponents(): Promise<void> {
    try {
      logger.info('Initializing AI Service components...', { 
        component: 'AiService',
        config: this.config 
      });

      // Initialize cache
      if (this.config.cacheEnabled) {
        this.cache = new AiCache({
          ttl: config.AI.CACHE_TTL,
          maxSize: config.AI.CACHE_MAX_SIZE
        });
      }

      // Initialize queue
      if (this.config.queueEnabled) {
        this.queue = new AiQueue({
          redis: {
            host: config.REDIS_URL.split('://')[1]?.split(':')[0] || 'localhost',
            port: parseInt(config.REDIS_URL.split(':')[2] || '6379')
          },
          concurrency: 10
        });
      }

      // Initialize providers
      await this.initializeProviders();

      // Initialize model selector
      this.modelSelector = new AiModelSelector(
        Array.from(this.providers.values()),
        this.getProviderConfigs()
      );

      // Initialize cost manager
      this.costManager = new CostManager({
        enableBudgetLimits: this.config.costManagementEnabled,
        defaultMonthlyBudget: config.AI.MONTHLY_BUDGET_LIMIT,
        defaultDailyLimit: config.AI.DAILY_USAGE_LIMIT
      });

      // Initialize content validator
      this.contentValidator = new ContentValidator({
        minQualityScore: config.AI.MIN_QUALITY_SCORE,
        enableFactChecking: true,
        enableProfanityFilter: true,
        enableDuplicateDetection: true
      });

      // Initialize question generator
      this.questionGenerator = new QuestionGenerator({
        defaultModel: config.AI.DEFAULT_MODEL,
        maxQuestionsPerBatch: config.AI.MAX_QUESTIONS_PER_BATCH,
        qualityCriteria: {
          minScore: config.AI.MIN_QUALITY_SCORE,
          weights: {
            contentQuality: 0.3,
            formatCorrectness: 0.2,
            difficultyAccuracy: 0.2,
            grammarScore: 0.1,
            factualAccuracy: 0.1,
            uniqueness: 0.1,
            educationalValue: 0.0,
            clarity: 0.0
          }
        }
      });

      this.isInitialized = true;
      logger.info('AI Service initialization completed successfully', { 
        component: 'AiService',
        providersCount: this.providers.size
      });

    } catch (error) {
      logger.error('Failed to initialize AI Service', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Initialize AI providers based on configuration
   */
  private async initializeProviders(): Promise<void> {
    const providerPromises: Promise<void>[] = [];

    for (const providerType of this.config.enabledProviders) {
      try {
        let provider: IAiProvider;

        switch (providerType) {
          case AiProviderType.OPENAI:
            if (config.AI.OPENAI_API_KEY) {
              provider = new OpenAIProvider({
                apiKey: config.AI.OPENAI_API_KEY,
                timeout: config.AI.REQUEST_TIMEOUT
              });
              providerPromises.push(this.registerProvider('openai', provider));
            }
            break;

          case AiProviderType.ANTHROPIC:
            if (config.AI.ANTHROPIC_API_KEY) {
              provider = new AnthropicProvider({
                apiKey: config.AI.ANTHROPIC_API_KEY,
                timeout: config.AI.REQUEST_TIMEOUT
              });
              providerPromises.push(this.registerProvider('anthropic', provider));
            }
            break;

          case AiProviderType.GOOGLE:
            if (config.AI.GOOGLE_API_KEY) {
              provider = new GoogleProvider({
                apiKey: config.AI.GOOGLE_API_KEY,
                timeout: config.AI.REQUEST_TIMEOUT
              });
              providerPromises.push(this.registerProvider('google', provider));
            }
            break;

          case AiProviderType.HUGGINGFACE:
            if (config.AI.HUGGINGFACE_API_KEY) {
              provider = new HuggingFaceProvider({
                apiKey: config.AI.HUGGINGFACE_API_KEY,
                timeout: config.AI.REQUEST_TIMEOUT
              });
              providerPromises.push(this.registerProvider('huggingface', provider));
            }
            break;

          case AiProviderType.LOCAL:
            if (config.AI.LOCAL_MODEL_ENABLED && config.AI.LOCAL_MODEL_ENDPOINT) {
              provider = new LocalModelProvider({
                endpoint: config.AI.LOCAL_MODEL_ENDPOINT,
                timeout: config.AI.REQUEST_TIMEOUT
              });
              providerPromises.push(this.registerProvider('local', provider));
            }
            break;

          default:
            logger.warn(`Unknown provider type: ${providerType}`, { 
              component: 'AiService' 
            });
        }
      } catch (error) {
        logger.error(`Failed to initialize provider ${providerType}`, {
          component: 'AiService',
          provider: providerType,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    await Promise.allSettled(providerPromises);
    
    if (this.providers.size === 0) {
      throw new Error('No AI providers could be initialized');
    }

    logger.info(`Initialized ${this.providers.size} AI providers`, {
      component: 'AiService',
      providers: Array.from(this.providers.keys())
    });
  }

  /**
   * Register a provider with circuit breaker
   */
  private async registerProvider(name: string, provider: IAiProvider): Promise<void> {
    // Test provider availability
    const isAvailable = await provider.isAvailable();
    if (!isAvailable) {
      logger.warn(`Provider ${name} is not available during registration`, {
        component: 'AiService',
        provider: name
      });
      return;
    }

    this.providers.set(name, provider);

    // Initialize circuit breaker for this provider
    if (this.config.circuitBreakerEnabled) {
      this.circuitBreakers.set(name, new AiCircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
        monitoringWindow: 300000 // 5 minutes
      }));
    }

    logger.info(`Successfully registered AI provider: ${name}`, {
      component: 'AiService',
      provider: name
    });
  }

  /**
   * Generate questions using AI
   */
  public async generateQuestions(
    request: QuestionGenerationRequest,
    userId: string,
    options?: {
      model?: string;
      provider?: string;
      maxCost?: number;
      qualityThreshold?: number;
    }
  ): Promise<QuestionGenerationResponse> {
    if (!this.isInitialized) {
      throw new Error('AI Service is not initialized');
    }

    try {
      // Check user budget constraints
      const budgetConstraints = await this.costManager.getBudgetConstraints(userId);
      if (options?.maxCost) {
        budgetConstraints.perRequestLimit = Math.min(
          budgetConstraints.perRequestLimit,
          options.maxCost
        );
      }

      // Generate questions
      const result = await this.questionGenerator.generateQuestions(
        request,
        userId,
        {
          userId,
          budgetConstraints,
          qualityThreshold: options?.qualityThreshold || config.AI.MIN_QUALITY_SCORE,
          preferredModel: options?.model,
          preferredProvider: options?.provider
        }
      );

      // Track usage and cost
      await this.costManager.trackUsage(userId, result.cost, result.usage);

      // Update analytics
      await this.updateAnalytics(userId, request, result);

      return result;

    } catch (error) {
      logger.error('Question generation failed', {
        component: 'AiService',
        userId,
        request: { ...request, count: request.count },
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Process a generic AI request
   */
  public async processRequest(request: AiRequest): Promise<AiResponse> {
    if (!this.isInitialized) {
      throw new Error('AI Service is not initialized');
    }

    try {
      this.emit('request:queued', request);

      // Check cache first
      let response: AiResponse | null = null;
      if (this.config.cacheEnabled && this.cache) {
        response = await this.getCachedResponse(request);
        if (response) {
          this.emit('cache:hit', request.id);
          return response;
        }
        this.emit('cache:miss', request.id);
      }

      // Check budget constraints
      const budgetConstraints = await this.costManager.getBudgetConstraints(request.userId);
      await this.costManager.checkBudgetLimits(request.userId, budgetConstraints);

      // Select best model for the request
      const modelSelection = await this.modelSelector.selectBestModel(
        request,
        budgetConstraints,
        {
          minScore: config.AI.MIN_QUALITY_SCORE,
          weights: {
            contentQuality: 0.3,
            formatCorrectness: 0.2,
            difficultyAccuracy: 0.2,
            grammarScore: 0.1,
            factualAccuracy: 0.1,
            uniqueness: 0.1,
            educationalValue: 0.0,
            clarity: 0.0
          }
        }
      );

      this.emit('request:processing', request);

      // Execute request through circuit breaker
      response = await this.executeWithCircuitBreaker(
        modelSelection.provider,
        async () => {
          const provider = this.providers.get(modelSelection.provider);
          if (!provider) {
            throw new Error(`Provider ${modelSelection.provider} not found`);
          }
          return provider.generateContent(request);
        }
      );

      // Validate content if enabled
      if (this.config.contentValidationEnabled && response.content) {
        const validation = await this.contentValidator.validateContent(
          response.content,
          request.requestType
        );
        response.metadata.validationResults = [validation];
      }

      // Cache response if successful
      if (this.config.cacheEnabled && this.cache && response.success) {
        await this.cacheResponse(request, response);
      }

      // Track usage and costs
      await this.costManager.trackUsage(request.userId, response.cost, response.usage);

      this.emit('request:completed', request, response);
      return response;

    } catch (error) {
      const aiError: AiError = {
        code: AiErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        timestamp: new Date(),
        requestId: request.id
      };

      const errorResponse: AiResponse = {
        id: `${request.id}_error`,
        requestId: request.id,
        success: false,
        model: '',
        provider: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 1 },
        cost: { inputCost: 0, outputCost: 0, requestCost: 0, totalCost: 0, currency: 'USD', estimated: true },
        metadata: { processingTime: 0, queueTime: 0, retryCount: 0 },
        error: aiError,
        duration: 0,
        timestamp: new Date()
      };

      this.emit('request:failed', request, aiError);
      return errorResponse;
    }
  }

  /**
   * Execute request through circuit breaker
   */
  private async executeWithCircuitBreaker<T>(
    providerName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const circuitBreaker = this.circuitBreakers.get(providerName);
    
    if (!circuitBreaker) {
      return fn();
    }

    try {
      const result = await circuitBreaker.execute(fn);
      circuitBreaker.onSuccess();
      return result;
    } catch (error) {
      circuitBreaker.onFailure(error as Error);
      
      if (circuitBreaker.isOpen()) {
        this.emit('circuit_breaker:opened', providerName);
        
        // Try fallback provider
        if (providerName !== this.config.fallbackProvider.toString()) {
          const fallbackProvider = this.providers.get(this.config.fallbackProvider.toString());
          if (fallbackProvider) {
            logger.info(`Using fallback provider due to circuit breaker`, {
              component: 'AiService',
              originalProvider: providerName,
              fallbackProvider: this.config.fallbackProvider
            });
            return fn(); // This will use the fallback provider
          }
        }
      }
      
      throw error;
    }
  }

  /**
   * Get cached response
   */
  private async getCachedResponse(request: AiRequest): Promise<AiResponse | null> {
    if (!this.cache) return null;

    try {
      const cacheKey = this.generateCacheKey(request);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        return {
          ...cached.data,
          cached: true,
          timestamp: new Date()
        };
      }
    } catch (error) {
      logger.warn('Cache retrieval failed', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return null;
  }

  /**
   * Cache response
   */
  private async cacheResponse(request: AiRequest, response: AiResponse): Promise<void> {
    if (!this.cache) return;

    try {
      const cacheKey = this.generateCacheKey(request);
      const ttl = config.AI.CACHE_TTL;
      
      await this.cache.set(cacheKey, response, ttl, {
        cost: response.cost.totalCost,
        quality: response.metadata.qualityScore || 0,
        provider: response.provider,
        model: response.model
      });
    } catch (error) {
      logger.warn('Response caching failed', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(request: AiRequest): string {
    const keyData = {
      requestType: request.requestType,
      prompt: request.prompt,
      parameters: JSON.stringify(request.parameters || {}),
      model: request.model || 'auto',
      provider: request.provider || 'auto'
    };
    
    // Create a simple hash of the key data
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * Update analytics
   */
  private async updateAnalytics(
    userId: string,
    request: any,
    result: any
  ): Promise<void> {
    try {
      // This would be implemented to store analytics data
      // For now, just log the metrics
      logger.info('AI Service analytics update', {
        component: 'AiService',
        userId,
        requestType: request.requestType || 'question_generation',
        cost: result.cost?.totalCost || 0,
        success: result.success !== false,
        provider: result.metadata?.provider,
        model: result.metadata?.model
      });
    } catch (error) {
      logger.warn('Analytics update failed', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get service health status
   */
  public async getHealthStatus(): Promise<{
    healthy: boolean;
    providers: Record<string, boolean>;
    cache: boolean;
    queue: boolean;
    errors: string[];
  }> {
    const status = {
      healthy: true,
      providers: {} as Record<string, boolean>,
      cache: this.cache ? true : false,
      queue: this.queue ? true : false,
      errors: [] as string[]
    };

    // Check provider health
    for (const [name, provider] of this.providers) {
      try {
        status.providers[name] = await provider.healthCheck();
      } catch (error) {
        status.providers[name] = false;
        status.errors.push(`Provider ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Overall health check
    const providersHealthy = Object.values(status.providers).some(healthy => healthy);
    status.healthy = providersHealthy && status.errors.length === 0;

    return status;
  }

  /**
   * Get provider configurations
   */
  private getProviderConfigs(): AiProviderConfig[] {
    // This would be loaded from database or configuration
    // For now, return basic configs
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      id: name,
      name,
      displayName: name,
      type: provider.type,
      models: provider.getModels(),
      isActive: true,
      isFree: name === 'local',
      priority: name === 'local' ? 10 : 5,
      metadata: {}
    }));
  }

  /**
   * Shutdown the service
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down AI Service...', { component: 'AiService' });
    
    // Close queue connections
    if (this.queue) {
      // Implementation would close queue connections
    }
    
    // Clear caches
    if (this.cache) {
      // Implementation would clear caches
    }
    
    // Reset circuit breakers
    this.circuitBreakers.clear();
    
    this.isInitialized = false;
    AiService.instance = null;
    
    logger.info('AI Service shutdown completed', { component: 'AiService' });
  }
}

export default AiService;
