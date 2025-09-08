/**
 * OpenAI Provider Implementation
 * Supports GPT models for question generation and content validation
 */

import OpenAI from 'openai';
import { logger } from '@/config/logger';
import {
  IAiProvider,
  AiRequest,
  AiResponse,
  AiModelConfig,
  AiUsageStats,
  AiCostBreakdown,
  AiError,
  AiErrorCode,
  AiProviderType,
  AiModelType,
  AiCapability,
  ValidationResult,
  ValidationIssue,
  ValidationIssueType,
  ValidationSeverity
} from '@/types/ai';

export interface OpenAIProviderConfig {
  apiKey: string;
  timeout?: number;
  baseURL?: string;
  organization?: string;
  maxRetries?: number;
}

export class OpenAIProvider implements IAiProvider {
  public readonly name = 'openai';
  public readonly type = AiProviderType.OPENAI;
  
  private client: OpenAI;
  private config: OpenAIProviderConfig;
  
  // Model configurations with cost and capability information
  private models: AiModelConfig[] = [
    {
      name: 'gpt-4-turbo-preview',
      displayName: 'GPT-4 Turbo',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.FACT_CHECKING,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 128000,
      costPerToken: 0.00001, // $0.01 per 1K input tokens
      qualityScore: 0.95,
      speedScore: 0.8,
      reliabilityScore: 0.95,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      }
    },
    {
      name: 'gpt-4',
      displayName: 'GPT-4',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.FACT_CHECKING,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 8192,
      costPerToken: 0.00003, // $0.03 per 1K input tokens
      qualityScore: 0.9,
      speedScore: 0.6,
      reliabilityScore: 0.9,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      }
    },
    {
      name: 'gpt-3.5-turbo',
      displayName: 'GPT-3.5 Turbo',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 16385,
      costPerToken: 0.0000005, // $0.0005 per 1K input tokens
      qualityScore: 0.8,
      speedScore: 0.9,
      reliabilityScore: 0.9,
      isActive: true,
      isDefault: true,
      configuration: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      }
    }
  ];

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
      baseURL: config.baseURL,
      organization: config.organization,
      maxRetries: config.maxRetries || 3
    });
  }

  /**
   * Check if OpenAI service is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      logger.warn('OpenAI availability check failed', {
        component: 'OpenAIProvider',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Generate content using OpenAI models
   */
  public async generateContent(request: AiRequest): Promise<AiResponse> {
    const startTime = Date.now();
    
    try {
      // Select model (use requested model or fallback to default)
      const modelName = request.model || this.getDefaultModel();
      const model = this.models.find(m => m.name === modelName);
      
      if (!model) {
        throw new Error(`Model ${modelName} not found in OpenAI provider`);
      }

      // Prepare messages for chat completion
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      
      // Add system prompt if provided
      if (request.parameters?.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.parameters.systemPrompt
        });
      }
      
      // Add user prompt
      messages.push({
        role: 'user',
        content: request.prompt
      });

      // Add examples if provided
      if (request.parameters?.examples) {
        for (const example of request.parameters.examples) {
          messages.push({
            role: 'assistant',
            content: example
          });
        }
      }

      // Configure request parameters
      const requestConfig: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: modelName,
        messages,
        temperature: request.parameters?.temperature ?? model.configuration.temperature,
        max_tokens: Math.min(
          request.parameters?.maxTokens ?? model.configuration.maxTokens,
          model.maxTokens || 4000
        ),
        top_p: request.parameters?.topP ?? model.configuration.topP,
        frequency_penalty: request.parameters?.frequencyPenalty,
        presence_penalty: request.parameters?.presencePenalty,
        stop: request.parameters?.stop
      };

      logger.debug('Making OpenAI API request', {
        component: 'OpenAIProvider',
        model: modelName,
        requestId: request.id,
        messageCount: messages.length
      });

      // Make API call
      const completion = await this.client.chat.completions.create(requestConfig);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract content
      const content = completion.choices[0]?.message?.content || '';
      
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Calculate usage and cost
      const usage: AiUsageStats = {
        inputTokens: completion.usage?.prompt_tokens || 0,
        outputTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        requests: 1
      };

      const cost = this.calculateCost(usage, model);

      // Build successful response
      const response: AiResponse = {
        id: `openai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        requestId: request.id,
        success: true,
        model: modelName,
        provider: this.name,
        content,
        usage,
        cost,
        metadata: {
          modelVersion: completion.model,
          processingTime: duration,
          queueTime: 0,
          retryCount: 0,
          finishReason: completion.choices[0]?.finish_reason
        },
        duration,
        timestamp: new Date()
      };

      logger.debug('OpenAI request completed successfully', {
        component: 'OpenAIProvider',
        requestId: request.id,
        model: modelName,
        usage,
        cost: cost.totalCost,
        duration
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('OpenAI request failed', {
        component: 'OpenAIProvider',
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      // Map OpenAI errors to our error codes
      const aiError = this.mapError(error);
      
      return {
        id: `openai_error_${Date.now()}`,
        requestId: request.id,
        success: false,
        model: request.model || this.getDefaultModel(),
        provider: this.name,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 1 },
        cost: { inputCost: 0, outputCost: 0, requestCost: 0, totalCost: 0, currency: 'USD', estimated: true },
        metadata: { processingTime: duration, queueTime: 0, retryCount: 0 },
        error: aiError,
        duration,
        timestamp: new Date()
      };
    }
  }

  /**
   * Validate OpenAI response
   */
  public async validateResponse(response: any): Promise<ValidationResult> {
    try {
      const content = typeof response === 'string' ? response : response.content;
      
      if (!content || typeof content !== 'string') {
        return {
          valid: false,
          score: 0,
          issues: [{
            type: 'FORMAT_ERROR' as any,
            severity: 'CRITICAL' as any,
            description: 'Response content is empty or invalid',
            field: 'content',
            autoFixable: false
          }],
          suggestions: ['Regenerate content with different parameters'],
          autoFixApplied: false,
          humanReviewRequired: true
        };
      }

      // Basic validation checks
      const issues: ValidationIssue[] = [];
      let score = 1.0;

      // Check for minimum length
      if (content.length < 10) {
        issues.push({
          type: ValidationIssueType.CONTENT_QUALITY,
          severity: ValidationSeverity.HIGH,
          description: 'Response is too short',
          field: 'content',
          autoFixable: false
        });
        score -= 0.3;
      }

      // Check for potential AI refusal patterns
      const refusalPatterns = [
        'I cannot', 'I am not able to', 'I apologize, but I cannot',
        'I am not allowed to', 'I cannot provide', 'I am unable to'
      ];
      
      for (const pattern of refusalPatterns) {
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
          issues.push({
            type: ValidationIssueType.CONTENT_QUALITY,
            severity: ValidationSeverity.HIGH,
            description: 'Response contains refusal pattern',
            field: 'content',
            autoFixable: false
          });
          score -= 0.4;
          break;
        }
      }

      return {
        valid: score > 0.5,
        score: Math.max(0, score),
        issues,
        suggestions: issues.length > 0 ? ['Adjust prompt parameters', 'Try different model'] : [],
        autoFixApplied: false,
        humanReviewRequired: score < 0.7
      };

    } catch (error) {
      logger.error('Response validation failed', {
        component: 'OpenAIProvider',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        score: 0,
        issues: [{
          type: 'FORMAT_ERROR' as any,
          severity: 'CRITICAL' as any,
          description: 'Validation process failed',
          field: 'content',
          autoFixable: false
        }],
        suggestions: ['Retry validation', 'Manual review required'],
        autoFixApplied: false,
        humanReviewRequired: true
      };
    }
  }

  /**
   * Calculate cost based on usage
   */
  public calculateCost(usage: AiUsageStats, model?: AiModelConfig): AiCostBreakdown {
    const selectedModel = model || this.models.find(m => m.isDefault) || this.models[0];
    
    const inputCost = usage.inputTokens * (selectedModel.costPerToken || 0);
    const outputCost = usage.outputTokens * (selectedModel.costPerToken || 0) * 2; // Output usually costs more
    const requestCost = 0; // OpenAI doesn't charge per request
    
    return {
      inputCost,
      outputCost,
      requestCost,
      totalCost: inputCost + outputCost + requestCost,
      currency: 'USD',
      estimated: false
    };
  }

  /**
   * Get available models
   */
  public getModels(): AiModelConfig[] {
    return this.models.filter(model => model.isActive);
  }

  /**
   * Health check for OpenAI service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1
      });
      
      return !!response.choices[0]?.message;
    } catch (error) {
      logger.error('OpenAI health check failed', {
        component: 'OpenAIProvider',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get default model name
   */
  private getDefaultModel(): string {
    const defaultModel = this.models.find(m => m.isDefault);
    return defaultModel?.name || 'gpt-3.5-turbo';
  }

  /**
   * Map OpenAI errors to our error system
   */
  private mapError(error: any): AiError {
    let code: AiErrorCode = AiErrorCode.INTERNAL_ERROR;
    let message = 'Unknown error';
    let retryable = false;

    if (error?.error) {
      const openaiError = error.error;
      message = openaiError.message || message;

      switch (openaiError.type) {
        case 'invalid_request_error':
          code = AiErrorCode.INVALID_REQUEST;
          break;
        case 'authentication_error':
          code = AiErrorCode.AUTHENTICATION_FAILED;
          break;
        case 'permission_error':
          code = AiErrorCode.API_KEY_INVALID;
          break;
        case 'rate_limit_error':
          code = AiErrorCode.RATE_LIMIT_EXCEEDED;
          retryable = true;
          break;
        case 'quota_exceeded_error':
          code = AiErrorCode.QUOTA_EXCEEDED;
          break;
        case 'server_error':
          code = AiErrorCode.SERVICE_UNAVAILABLE;
          retryable = true;
          break;
        case 'timeout':
          code = AiErrorCode.TIMEOUT;
          retryable = true;
          break;
        default:
          code = AiErrorCode.INTERNAL_ERROR;
      }
    } else if (error?.code) {
      switch (error.code) {
        case 'ECONNRESET':
        case 'ENOTFOUND':
        case 'EAI_AGAIN':
          code = AiErrorCode.NETWORK_ERROR;
          retryable = true;
          break;
        case 'ETIMEDOUT':
          code = AiErrorCode.TIMEOUT;
          retryable = true;
          break;
      }
    }

    return {
      code,
      message,
      details: error,
      provider: this.name,
      retryable,
      timestamp: new Date()
    };
  }
}

export default OpenAIProvider;
