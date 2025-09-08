/**
 * HuggingFace Provider Implementation
 * Supports HuggingFace models via API for question generation and content validation
 */

import { HfInference } from '@huggingface/inference';
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

export interface HuggingFaceProviderConfig {
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  baseURL?: string;
}

export class HuggingFaceProvider implements IAiProvider {
  public readonly name = 'huggingface';
  public readonly type = AiProviderType.HUGGINGFACE;
  
  private client: HfInference;
  private config: HuggingFaceProviderConfig;
  
  // Model configurations with cost and capability information
  private models: AiModelConfig[] = [
    {
      name: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      displayName: 'Mixtral 8x7B Instruct',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 32768,
      costPerToken: 0.0000007, // Approximate cost for HF inference
      qualityScore: 0.85,
      speedScore: 0.8,
      reliabilityScore: 0.8,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      }
    },
    {
      name: 'meta-llama/Llama-2-70b-chat-hf',
      displayName: 'Llama 2 70B Chat',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 4096,
      costPerToken: 0.0000005,
      qualityScore: 0.8,
      speedScore: 0.7,
      reliabilityScore: 0.75,
      isActive: true,
      isDefault: true,
      configuration: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      }
    },
    {
      name: 'microsoft/DialoGPT-large',
      displayName: 'DialoGPT Large',
      modelType: AiModelType.TEXT_GENERATION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION
      ],
      maxTokens: 1024,
      costPerToken: 0.0000001, // Very low cost
      qualityScore: 0.7,
      speedScore: 0.9,
      reliabilityScore: 0.8,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.8,
        maxTokens: 1000,
        topP: 0.9
      }
    }
  ];

  constructor(config: HuggingFaceProviderConfig) {
    this.config = config;
    this.client = new HfInference(config.apiKey);
  }

  /**
   * Check if HuggingFace service is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      // Test with a simple text generation request
      await this.client.textGeneration({
        model: 'microsoft/DialoGPT-large',
        inputs: 'Test',
        parameters: {
          max_new_tokens: 1,
          temperature: 0.1
        }
      });
      return true;
    } catch (error) {
      logger.warn('HuggingFace availability check failed', {
        component: 'HuggingFaceProvider',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Generate content using HuggingFace models
   */
  public async generateContent(request: AiRequest): Promise<AiResponse> {
    const startTime = Date.now();
    
    try {
      // Select model (use requested model or fallback to default)
      const modelName = request.model || this.getDefaultModel();
      const modelConfig = this.models.find(m => m.name === modelName);
      
      if (!modelConfig) {
        throw new Error(`Model ${modelName} not found in HuggingFace provider`);
      }

      // Prepare prompt
      let prompt = request.prompt;
      
      // Add system prompt if provided
      if (request.parameters?.systemPrompt) {
        prompt = `${request.parameters.systemPrompt}\n\n${prompt}`;
      }

      // Add examples if provided
      if (request.parameters?.examples) {
        const examples = request.parameters.examples.join('\n\nExample: ');
        prompt = `${prompt}\n\nExamples:\n${examples}`;
      }

      // Configure request parameters
      const requestParams = {
        temperature: request.parameters?.temperature ?? modelConfig.configuration.temperature,
        max_new_tokens: Math.min(
          request.parameters?.maxTokens ?? modelConfig.configuration.maxTokens,
          modelConfig.maxTokens || 4000
        ),
        top_p: request.parameters?.topP ?? modelConfig.configuration.topP,
        do_sample: true,
        return_full_text: false
      };

      logger.debug('Making HuggingFace API request', {
        component: 'HuggingFaceProvider',
        model: modelName,
        requestId: request.id,
        promptLength: prompt.length
      });

      let result: any;
      
      // Different API calls based on model type
      if (modelConfig.modelType === AiModelType.CHAT_COMPLETION) {
        // Use chat completion for chat models
        result = await this.client.chatCompletion({
          model: modelName,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: requestParams.max_new_tokens,
          temperature: requestParams.temperature
        });
      } else {
        // Use text generation for other models
        result = await this.client.textGeneration({
          model: modelName,
          inputs: prompt,
          parameters: requestParams
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract content based on response type
      let content = '';
      if (result.choices && result.choices[0]?.message?.content) {
        // Chat completion response
        content = result.choices[0].message.content;
      } else if (result.generated_text) {
        // Text generation response
        content = result.generated_text;
      } else if (typeof result === 'string') {
        content = result;
      }
      
      if (!content) {
        throw new Error('Empty response from HuggingFace');
      }

      // Calculate usage - HF doesn't provide detailed token counts
      // We'll estimate based on text length
      const estimatedInputTokens = Math.ceil(prompt.length / 4);
      const estimatedOutputTokens = Math.ceil(content.length / 4);
      
      const usage: AiUsageStats = {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens: estimatedInputTokens + estimatedOutputTokens,
        requests: 1
      };

      const cost = this.calculateCost(usage, modelConfig);

      // Build successful response
      const response: AiResponse = {
        id: `huggingface_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        requestId: request.id,
        success: true,
        model: modelName,
        provider: this.name,
        content,
        usage,
        cost,
        metadata: {
          modelVersion: modelName,
          processingTime: duration,
          queueTime: 0,
          retryCount: 0
        },
        duration,
        timestamp: new Date()
      };

      logger.debug('HuggingFace request completed successfully', {
        component: 'HuggingFaceProvider',
        requestId: request.id,
        model: modelName,
        usage,
        cost: cost.totalCost,
        duration
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('HuggingFace request failed', {
        component: 'HuggingFaceProvider',
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      // Map HuggingFace errors to our error codes
      const aiError = this.mapError(error);
      
      return {
        id: `huggingface_error_${Date.now()}`,
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
   * Validate HuggingFace response
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

      // Check for repetitive content (common with some HF models)
      const words = content.toLowerCase().split(/\s+/);
      const uniqueWords = new Set(words);
      const repetitionRatio = uniqueWords.size / words.length;
      
      if (repetitionRatio < 0.3) {
        issues.push({
          type: ValidationIssueType.CONTENT_QUALITY,
          severity: ValidationSeverity.MEDIUM,
          description: 'Response contains repetitive content',
          field: 'content',
          autoFixable: false
        });
        score -= 0.3;
      }

      // Check for incomplete responses
      if (content.endsWith('...') || content.length < 20) {
        issues.push({
          type: ValidationIssueType.CONTENT_QUALITY,
          severity: ValidationSeverity.MEDIUM,
          description: 'Response appears incomplete',
          field: 'content',
          autoFixable: false
        });
        score -= 0.2;
      }

      return {
        valid: score > 0.5,
        score: Math.max(0, score),
        issues,
        suggestions: issues.length > 0 ? ['Adjust prompt parameters', 'Try different model', 'Increase max tokens'] : [],
        autoFixApplied: false,
        humanReviewRequired: score < 0.6
      };

    } catch (error) {
      logger.error('Response validation failed', {
        component: 'HuggingFaceProvider',
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
    const outputCost = usage.outputTokens * (selectedModel.costPerToken || 0);
    const requestCost = 0; // HuggingFace charges per token, not per request
    
    return {
      inputCost,
      outputCost,
      requestCost,
      totalCost: inputCost + outputCost + requestCost,
      currency: 'USD',
      estimated: true // HF pricing can vary
    };
  }

  /**
   * Get available models
   */
  public getModels(): AiModelConfig[] {
    return this.models.filter(model => model.isActive);
  }

  /**
   * Health check for HuggingFace service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.client.textGeneration({
        model: 'microsoft/DialoGPT-large',
        inputs: 'Health check',
        parameters: {
          max_new_tokens: 1,
          temperature: 0.1
        }
      });
      return true;
    } catch (error) {
      logger.error('HuggingFace health check failed', {
        component: 'HuggingFaceProvider',
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
    return defaultModel?.name || 'meta-llama/Llama-2-70b-chat-hf';
  }

  /**
   * Map HuggingFace errors to our error system
   */
  private mapError(error: any): AiError {
    let code: AiErrorCode = AiErrorCode.INTERNAL_ERROR;
    let message = 'Unknown error';
    let retryable = false;

    if (error?.message) {
      message = error.message;
      
      // Check for common HuggingFace error patterns
      if (message.includes('unauthorized') || message.includes('Invalid token')) {
        code = AiErrorCode.API_KEY_INVALID;
      } else if (message.includes('rate limit') || message.includes('too many requests')) {
        code = AiErrorCode.RATE_LIMIT_EXCEEDED;
        retryable = true;
      } else if (message.includes('model is currently loading') || message.includes('model is loading')) {
        code = AiErrorCode.SERVICE_UNAVAILABLE;
        retryable = true;
      } else if (message.includes('timeout') || message.includes('deadline')) {
        code = AiErrorCode.TIMEOUT;
        retryable = true;
      } else if (message.includes('invalid') || message.includes('bad request')) {
        code = AiErrorCode.INVALID_REQUEST;
      } else if (message.includes('not found') || message.includes('does not exist')) {
        code = AiErrorCode.INVALID_REQUEST;
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

export default HuggingFaceProvider;
