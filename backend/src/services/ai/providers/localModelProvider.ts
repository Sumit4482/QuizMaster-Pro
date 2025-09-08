/**
 * Local Model Provider Implementation
 * Supports local/self-hosted AI models via HTTP API for question generation
 * This provides FREE AI capabilities without external API costs
 */

import axios, { AxiosInstance } from 'axios';
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

export interface LocalModelProviderConfig {
  endpoint: string;
  timeout?: number;
  maxRetries?: number;
  apiKey?: string; // Optional API key for secured local endpoints
  modelName?: string; // Override default model name
}

export class LocalModelProvider implements IAiProvider {
  public readonly name = 'local';
  public readonly type = AiProviderType.LOCAL;
  
  private client: AxiosInstance;
  private config: LocalModelProviderConfig;
  
  // Model configurations for local models
  private models: AiModelConfig[] = [
    {
      name: 'llama2-7b-chat',
      displayName: 'Llama 2 7B Chat (Local)',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 4096,
      costPerToken: 0, // Local models are FREE
      qualityScore: 0.75,
      speedScore: 0.6,
      reliabilityScore: 0.8,
      isActive: true,
      isDefault: true,
      configuration: {
        temperature: 0.7,
        maxTokens: 2000,
        topP: 0.9,
        repetitionPenalty: 1.1
      }
    },
    {
      name: 'llama2-13b-chat',
      displayName: 'Llama 2 13B Chat (Local)',
      modelType: AiModelType.CHAT_COMPLETION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION,
        AiCapability.FACT_CHECKING,
        AiCapability.SUMMARIZATION,
        AiCapability.CLASSIFICATION
      ],
      maxTokens: 4096,
      costPerToken: 0, // Local models are FREE
      qualityScore: 0.8,
      speedScore: 0.5,
      reliabilityScore: 0.75,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.7,
        maxTokens: 2000,
        topP: 0.9,
        repetitionPenalty: 1.1
      }
    },
    {
      name: 'codellama-7b',
      displayName: 'Code Llama 7B (Local)',
      modelType: AiModelType.TEXT_GENERATION,
      capabilities: [
        AiCapability.QUESTION_GENERATION,
        AiCapability.CONTENT_VALIDATION
      ],
      maxTokens: 16384,
      costPerToken: 0, // Local models are FREE
      qualityScore: 0.7,
      speedScore: 0.7,
      reliabilityScore: 0.8,
      isActive: true,
      isDefault: false,
      configuration: {
        temperature: 0.5,
        maxTokens: 2000,
        topP: 0.9
      }
    }
  ];

  constructor(config: LocalModelProviderConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.endpoint,
      timeout: config.timeout || 60000, // Local models might be slower
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
      }
    });

    // Override model name if provided
    if (config.modelName) {
      this.models[0].name = config.modelName;
      this.models[0].displayName = `${config.modelName} (Local)`;
    }
  }

  /**
   * Check if local model service is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      // Try to get model info or health check
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      // Try alternative health check endpoints
      try {
        const response = await this.client.get('/v1/models', { timeout: 5000 });
        return response.status === 200;
      } catch (secondError) {
        logger.warn('Local model availability check failed', {
          component: 'LocalModelProvider',
          endpoint: this.config.endpoint,
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    }
  }

  /**
   * Generate content using local models
   */
  public async generateContent(request: AiRequest): Promise<AiResponse> {
    const startTime = Date.now();
    
    try {
      // Select model (use requested model or fallback to default)
      const modelName = request.model || this.config.modelName || this.getDefaultModel();
      const modelConfig = this.models.find(m => m.name === modelName);
      
      if (!modelConfig) {
        throw new Error(`Model ${modelName} not found in Local provider`);
      }

      // Prepare request payload for local model API
      const payload = await this.prepareRequestPayload(request, modelConfig);

      logger.debug('Making Local Model API request', {
        component: 'LocalModelProvider',
        model: modelName,
        requestId: request.id,
        endpoint: this.config.endpoint
      });

      // Try different API endpoints that local models might use
      let response;
      try {
        // OpenAI-compatible format (most common for local models)
        response = await this.client.post('/v1/chat/completions', payload);
      } catch (error) {
        try {
          // Alternative format for text generation
          response = await this.client.post('/generate', {
            prompt: request.prompt,
            ...payload.parameters
          });
        } catch (secondError) {
          // Try simple completion format
          response = await this.client.post('/completion', {
            prompt: request.prompt,
            max_tokens: payload.max_tokens,
            temperature: payload.temperature
          });
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract content based on response format
      let content = '';
      const responseData = response.data;
      
      if (responseData.choices && responseData.choices[0]) {
        // OpenAI-compatible format
        content = responseData.choices[0].message?.content || responseData.choices[0].text || '';
      } else if (responseData.generated_text) {
        // HuggingFace-style format
        content = responseData.generated_text;
      } else if (responseData.text) {
        // Simple text format
        content = responseData.text;
      } else if (typeof responseData === 'string') {
        content = responseData;
      }
      
      if (!content) {
        throw new Error('Empty response from local model');
      }

      // Calculate usage - estimate since local models may not provide token counts
      const usage: AiUsageStats = {
        inputTokens: responseData.usage?.prompt_tokens || Math.ceil(request.prompt.length / 4),
        outputTokens: responseData.usage?.completion_tokens || Math.ceil(content.length / 4),
        totalTokens: responseData.usage?.total_tokens || Math.ceil((request.prompt.length + content.length) / 4),
        requests: 1
      };

      // Cost is always zero for local models
      const cost: AiCostBreakdown = {
        inputCost: 0,
        outputCost: 0,
        requestCost: 0,
        totalCost: 0,
        currency: 'USD',
        estimated: false
      };

      // Build successful response
      const aiResponse: AiResponse = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
          localModel: 'true',
          endpoint: this.config.endpoint
        },
        duration,
        timestamp: new Date()
      };

      logger.debug('Local model request completed successfully', {
        component: 'LocalModelProvider',
        requestId: request.id,
        model: modelName,
        usage,
        duration
      });

      return aiResponse;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Local model request failed', {
        component: 'LocalModelProvider',
        requestId: request.id,
        endpoint: this.config.endpoint,
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      // Map local model errors to our error codes
      const aiError = this.mapError(error);
      
      return {
        id: `local_error_${Date.now()}`,
        requestId: request.id,
        success: false,
        model: request.model || this.getDefaultModel(),
        provider: this.name,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 1 },
        cost: { inputCost: 0, outputCost: 0, requestCost: 0, totalCost: 0, currency: 'USD', estimated: false },
        metadata: { processingTime: duration, queueTime: 0, retryCount: 0, localModel: 'true' },
        error: aiError,
        duration,
        timestamp: new Date()
      };
    }
  }

  /**
   * Prepare request payload for local model API
   */
  private async prepareRequestPayload(request: AiRequest, modelConfig: AiModelConfig): Promise<any> {
    // OpenAI-compatible format (most common for local models)
    const messages: Array<{role: string, content: string}> = [];
    
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

    return {
      model: modelConfig.name,
      messages,
      temperature: request.parameters?.temperature ?? modelConfig.configuration.temperature,
      max_tokens: Math.min(
        request.parameters?.maxTokens ?? modelConfig.configuration.maxTokens,
        modelConfig.maxTokens || 2000
      ),
      top_p: request.parameters?.topP ?? modelConfig.configuration.topP,
      frequency_penalty: request.parameters?.frequencyPenalty ?? 0,
      presence_penalty: request.parameters?.presencePenalty ?? 0,
      stop: request.parameters?.stop,
      stream: false
    };
  }

  /**
   * Validate local model response
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
          suggestions: ['Check local model configuration', 'Verify model is loaded'],
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

      // Check for repetitive content (common with smaller local models)
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
        score -= 0.2;
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

      // Check for common local model artifacts
      const artifacts = ['<|endoftext|>', '<|im_end|>', '</s>', '<unk>'];
      for (const artifact of artifacts) {
        if (content.includes(artifact)) {
          issues.push({
            type: 'FORMAT_ERROR' as any,
            severity: 'LOW' as any,
            description: 'Response contains model artifacts',
            field: 'content',
            autoFixable: true
          });
          score -= 0.1;
        }
      }

      return {
        valid: score > 0.4, // Lower threshold for local models
        score: Math.max(0, score),
        issues,
        suggestions: issues.length > 0 ? [
          'Adjust temperature or other parameters',
          'Try different prompt formatting',
          'Consider using a larger local model'
        ] : [],
        autoFixApplied: false,
        humanReviewRequired: score < 0.5
      };

    } catch (error) {
      logger.error('Response validation failed', {
        component: 'LocalModelProvider',
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
        suggestions: ['Retry validation', 'Check model configuration'],
        autoFixApplied: false,
        humanReviewRequired: true
      };
    }
  }

  /**
   * Calculate cost - always zero for local models
   */
  public calculateCost(usage: AiUsageStats, model?: AiModelConfig): AiCostBreakdown {
    return {
      inputCost: 0,
      outputCost: 0,
      requestCost: 0,
      totalCost: 0, // Local models are FREE!
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
   * Health check for local model service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      // Try to generate a minimal response
      const testRequest: AiRequest = {
        id: 'health_check',
        userId: 'system',
        requestType: 'QUESTION_GENERATION' as any,
        prompt: 'Test',
        parameters: { maxTokens: 1, temperature: 0.1 }
      };
      
      const response = await this.generateContent(testRequest);
      return response.success && !!response.content;
    } catch (error) {
      logger.error('Local model health check failed', {
        component: 'LocalModelProvider',
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
    return defaultModel?.name || 'llama2-7b-chat';
  }

  /**
   * Map local model errors to our error system
   */
  private mapError(error: any): AiError {
    let code: AiErrorCode = AiErrorCode.INTERNAL_ERROR;
    let message = 'Unknown error';
    let retryable = false;

    if (axios.isAxiosError(error)) {
      message = error.message;
      
      if (error.response) {
        switch (error.response.status) {
          case 401:
          case 403:
            code = AiErrorCode.AUTHENTICATION_FAILED;
            break;
          case 404:
            code = AiErrorCode.SERVICE_UNAVAILABLE;
            message = 'Local model endpoint not found';
            break;
          case 429:
            code = AiErrorCode.RATE_LIMIT_EXCEEDED;
            retryable = true;
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            code = AiErrorCode.SERVICE_UNAVAILABLE;
            retryable = true;
            message = 'Local model service error';
            break;
          default:
            code = AiErrorCode.INVALID_REQUEST;
        }
      } else if (error.code) {
        switch (error.code) {
          case 'ECONNREFUSED':
          case 'ENOTFOUND':
            code = AiErrorCode.SERVICE_UNAVAILABLE;
            message = 'Cannot connect to local model service';
            retryable = true;
            break;
          case 'ETIMEDOUT':
            code = AiErrorCode.TIMEOUT;
            message = 'Local model request timed out';
            retryable = true;
            break;
          case 'ECONNRESET':
            code = AiErrorCode.NETWORK_ERROR;
            retryable = true;
            break;
        }
      }
    } else if (error instanceof Error) {
      message = error.message;
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

export default LocalModelProvider;
