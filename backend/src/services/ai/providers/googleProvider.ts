/**
 * Google Provider Implementation
 * Supports Gemini models for question generation and content validation
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
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

export interface GoogleProviderConfig {
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
}

export class GoogleProvider implements IAiProvider {
  public readonly name = 'google';
  public readonly type = AiProviderType.GOOGLE;
  
  private client: GoogleGenerativeAI;
  private config: GoogleProviderConfig;
  
  // Model configurations with cost and capability information
  private models: AiModelConfig[] = [
    {
      name: 'gemini-1.5-pro-latest',
      displayName: 'Gemini 1.5 Pro',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.FACT_CHECKING,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 2000000,
      costPerToken: 0.0000035, // $3.50 per 1M input tokens
      qualityScore: 0.9,
      speedScore: 0.8,
      reliabilityScore: 0.85,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.9,
        topK: 40
      }
    },
    {
      name: 'gemini-1.5-flash-latest',
      displayName: 'Gemini 1.5 Flash',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 1000000,
      costPerToken: 0.00000035, // $0.35 per 1M input tokens
      qualityScore: 0.85,
      speedScore: 0.95,
      reliabilityScore: 0.9,
      isActive: true,
      isDefault: true,
      configuration: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.9,
        topK: 40
      }
    },
    {
      name: 'gemini-pro',
      displayName: 'Gemini Pro',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 30720,
      costPerToken: 0.0000005, // $0.50 per 1M input tokens
      qualityScore: 0.8,
      speedScore: 0.85,
      reliabilityScore: 0.8,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.9,
        topK: 40
      }
    }
  ];

  constructor(config: GoogleProviderConfig) {
    this.config = config;
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  /**
   * Check if Google Gemini service is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent('Test');
      return !!result.response.text();
    } catch (error) {
      logger.warn('Google Gemini availability check failed', {
        component: 'GoogleProvider',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Generate content using Google Gemini models
   */
  public async generateContent(request: AiRequest): Promise<AiResponse> {
    const startTime = Date.now();
    
    try {
      // Select model (use requested model or fallback to default)
      const modelName = request.model || this.getDefaultModel();
      const modelConfig = this.models.find(m => m.name === modelName);
      
      if (!modelConfig) {
        throw new Error(`Model ${modelName} not found in Google provider`);
      }

      // Get the generative model
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: request.parameters?.temperature ?? modelConfig.configuration.temperature,
          maxOutputTokens: Math.min(
            request.parameters?.maxTokens ?? modelConfig.configuration.maxOutputTokens,
            modelConfig.configuration.maxOutputTokens
          ),
          topP: request.parameters?.topP ?? modelConfig.configuration.topP,
          topK: modelConfig.configuration.topK
        }
      });

      // Prepare prompt with system instruction if provided
      let prompt = request.prompt;
      
      if (request.parameters?.systemPrompt) {
        prompt = `${request.parameters.systemPrompt}\n\n${prompt}`;
      }

      // Add examples if provided
      if (request.parameters?.examples) {
        const examples = request.parameters.examples.join('\n\nExample: ');
        prompt = `${prompt}\n\nExamples:\n${examples}`;
      }

      logger.debug('Making Google Gemini API request', {
        component: 'GoogleProvider',
        model: modelName,
        requestId: request.id,
        promptLength: prompt.length
      });

      // Make API call
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract content
      const content = response.text();
      
      if (!content) {
        throw new Error('Empty response from Google Gemini');
      }

      // Calculate usage - Gemini doesn't provide detailed token counts in free tier
      // We'll estimate based on text length
      const estimatedInputTokens = Math.ceil(prompt.length / 4); // Rough estimation
      const estimatedOutputTokens = Math.ceil(content.length / 4);
      
      const usage: AiUsageStats = {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens: estimatedInputTokens + estimatedOutputTokens,
        requests: 1
      };

      const cost = this.calculateCost(usage, modelConfig);

      // Build successful response
      const apiResponse: AiResponse = {
        id: `google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
          retryCount: 0,
          finishReason: response.candidates?.[0]?.finishReason || 'stop'
        },
        duration,
        timestamp: new Date()
      };

      logger.debug('Google Gemini request completed successfully', {
        component: 'GoogleProvider',
        requestId: request.id,
        model: modelName,
        usage,
        cost: cost.totalCost,
        duration
      });

      return apiResponse;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Google Gemini request failed', {
        component: 'GoogleProvider',
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      // Map Google errors to our error codes
      const aiError = this.mapError(error);
      
      return {
        id: `google_error_${Date.now()}`,
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
   * Validate Google Gemini response
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

      // Check for Gemini-specific safety issues
      const safetyPatterns = [
        'I cannot provide', 'I am not able to generate', 'I apologize, but I cannot',
        'This request violates', 'I cannot assist with', 'I am unable to',
        'That request is inappropriate'
      ];
      
      for (const pattern of safetyPatterns) {
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
          issues.push({
            type: 'CONTENT_FILTERED' as any,
            severity: 'HIGH' as any,
            description: 'Response was filtered for safety',
            field: 'content',
            autoFixable: false
          });
          score -= 0.5;
          break;
        }
      }

      // Check for incomplete responses
      if (content.endsWith('...') || content.includes('[INCOMPLETE]')) {
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
        suggestions: issues.length > 0 ? ['Adjust prompt parameters', 'Try different model', 'Modify content request'] : [],
        autoFixApplied: false,
        humanReviewRequired: score < 0.7
      };

    } catch (error) {
      logger.error('Response validation failed', {
        component: 'GoogleProvider',
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
    const outputCost = usage.outputTokens * (selectedModel.costPerToken || 0) * 3; // Google output costs more
    const requestCost = 0; // Google doesn't charge per request
    
    return {
      inputCost,
      outputCost,
      requestCost,
      totalCost: inputCost + outputCost + requestCost,
      currency: 'USD',
      estimated: true // Google token counting is estimated
    };
  }

  /**
   * Get available models
   */
  public getModels(): AiModelConfig[] {
    return this.models.filter(model => model.isActive);
  }

  /**
   * Health check for Google Gemini service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent('Health check');
      const response = await result.response;
      
      return !!response.text();
    } catch (error) {
      logger.error('Google Gemini health check failed', {
        component: 'GoogleProvider',
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
    return defaultModel?.name || 'gemini-1.5-flash-latest';
  }

  /**
   * Map Google errors to our error system
   */
  private mapError(error: any): AiError {
    let code: AiErrorCode = AiErrorCode.INTERNAL_ERROR;
    let message = 'Unknown error';
    let retryable = false;

    if (error?.message) {
      message = error.message;
      
      // Check for common Google API error patterns
      if (message.includes('API key')) {
        code = AiErrorCode.API_KEY_INVALID;
      } else if (message.includes('quota') || message.includes('limit')) {
        code = AiErrorCode.RATE_LIMIT_EXCEEDED;
        retryable = true;
      } else if (message.includes('safety') || message.includes('blocked')) {
        code = AiErrorCode.CONTENT_FILTERED;
      } else if (message.includes('timeout') || message.includes('deadline')) {
        code = AiErrorCode.TIMEOUT;
        retryable = true;
      } else if (message.includes('unavailable') || message.includes('overloaded')) {
        code = AiErrorCode.SERVICE_UNAVAILABLE;
        retryable = true;
      } else if (message.includes('invalid') || message.includes('bad request')) {
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

export default GoogleProvider;
