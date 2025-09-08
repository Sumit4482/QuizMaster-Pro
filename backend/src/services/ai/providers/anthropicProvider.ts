/**
 * Anthropic Provider Implementation
 * Supports Claude models for question generation and content validation
 */

import Anthropic from '@anthropic-ai/sdk';
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

export interface AnthropicProviderConfig {
  apiKey: string;
  timeout?: number;
  baseURL?: string;
  maxRetries?: number;
}

export class AnthropicProvider implements IAiProvider {
  public readonly name = 'anthropic';
  public readonly type = AiProviderType.ANTHROPIC;
  
  private client: Anthropic;
  private config: AnthropicProviderConfig;
  
  // Model configurations with cost and capability information
  private models: AiModelConfig[] = [
    {
      name: 'claude-3-opus-20240229',
      displayName: 'Claude 3 Opus',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.FACT_CHECKING,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 200000,
      costPerToken: 0.000015, // $15 per MTok input
      qualityScore: 0.95,
      speedScore: 0.7,
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
      name: 'claude-3-sonnet-20240229',
      displayName: 'Claude 3 Sonnet',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.FACT_CHECKING,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 200000,
      costPerToken: 0.000003, // $3 per MTok input
      qualityScore: 0.9,
      speedScore: 0.8,
      reliabilityScore: 0.9,
      isActive: true,
      isDefault: true,
      configuration: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      }
    },
    {
      name: 'claude-3-haiku-20240307',
      displayName: 'Claude 3 Haiku',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 200000,
      costPerToken: 0.00000025, // $0.25 per MTok input
      qualityScore: 0.8,
      speedScore: 0.9,
      reliabilityScore: 0.85,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      }
    }
  ];

  constructor(config: AnthropicProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
      baseURL: config.baseURL,
      maxRetries: config.maxRetries || 3
    });
  }

  /**
   * Check if Anthropic service is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      // Test with a minimal request
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      return true;
    } catch (error) {
      logger.warn('Anthropic availability check failed', {
        component: 'AnthropicProvider',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Generate content using Anthropic models
   */
  public async generateContent(request: AiRequest): Promise<AiResponse> {
    const startTime = Date.now();
    
    try {
      // Select model (use requested model or fallback to default)
      const modelName = request.model || this.getDefaultModel();
      const model = this.models.find(m => m.name === modelName);
      
      if (!model) {
        throw new Error(`Model ${modelName} not found in Anthropic provider`);
      }

      // Prepare messages for Claude
      const messages: Array<{ role: 'user' | 'assistant', content: string }> = [];
      
      // Add user prompt
      messages.push({
        role: 'user',
        content: request.prompt
      });

      // Add examples if provided (alternating user/assistant)
      if (request.parameters?.examples) {
        for (let i = 0; i < request.parameters.examples.length; i++) {
          messages.push({
            role: i % 2 === 0 ? 'assistant' : 'user',
            content: request.parameters.examples[i]
          });
        }
      }

      // Configure request parameters
      const requestConfig: any = {
        model: modelName,
        messages,
        max_tokens: Math.min(
          request.parameters?.maxTokens ?? model.configuration.maxTokens,
          model.maxTokens || 4000
        ),
        temperature: request.parameters?.temperature ?? model.configuration.temperature,
        top_p: request.parameters?.topP ?? model.configuration.topP,
        stop_sequences: request.parameters?.stop
      };

      // Add system prompt if provided
      if (request.parameters?.systemPrompt) {
        requestConfig.system = request.parameters.systemPrompt;
      }

      logger.debug('Making Anthropic API request', {
        component: 'AnthropicProvider',
        model: modelName,
        requestId: request.id,
        messageCount: messages.length
      });

      // Make API call
      const completion = await this.client.messages.create(requestConfig);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract content
      const contentBlock = completion.content[0];
      const content = contentBlock && 'text' in contentBlock ? contentBlock.text : '';
      
      if (!content) {
        throw new Error('Empty response from Anthropic');
      }

      // Calculate usage and cost
      const usage: AiUsageStats = {
        inputTokens: completion.usage?.input_tokens || 0,
        outputTokens: completion.usage?.output_tokens || 0,
        totalTokens: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0),
        requests: 1
      };

      const cost = this.calculateCost(usage, model);

      // Build successful response
      const response: AiResponse = {
        id: `anthropic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
          stopReason: completion.stop_reason || undefined
        },
        duration,
        timestamp: new Date()
      };

      logger.debug('Anthropic request completed successfully', {
        component: 'AnthropicProvider',
        requestId: request.id,
        model: modelName,
        usage,
        cost: cost.totalCost,
        duration
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Anthropic request failed', {
        component: 'AnthropicProvider',
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      // Map Anthropic errors to our error codes
      const aiError = this.mapError(error);
      
      return {
        id: `anthropic_error_${Date.now()}`,
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
   * Validate Anthropic response
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

      // Check for Claude-specific refusal patterns
      const refusalPatterns = [
        'I cannot', 'I am not able to', 'I apologize, but I cannot',
        'I am not allowed to', 'I cannot provide', 'I am unable to',
        'I should not', 'I would not be comfortable'
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
        component: 'AnthropicProvider',
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
    const outputCost = usage.outputTokens * (selectedModel.costPerToken || 0) * 5; // Anthropic output costs more
    const requestCost = 0; // Anthropic doesn't charge per request
    
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
   * Health check for Anthropic service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1
      });
      
      const contentBlock = response.content[0];
      return !!(contentBlock && 'text' in contentBlock && contentBlock.text);
    } catch (error) {
      logger.error('Anthropic health check failed', {
        component: 'AnthropicProvider',
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
    return defaultModel?.name || 'claude-3-sonnet-20240229';
  }

  /**
   * Map Anthropic errors to our error system
   */
  private mapError(error: any): AiError {
    let code: AiErrorCode = AiErrorCode.INTERNAL_ERROR;
    let message = 'Unknown error';
    let retryable = false;

    if (error?.error) {
      const anthropicError = error.error;
      message = anthropicError.message || message;

      switch (anthropicError.type) {
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
        case 'overloaded_error':
          code = AiErrorCode.SERVICE_UNAVAILABLE;
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

export default AnthropicProvider;
