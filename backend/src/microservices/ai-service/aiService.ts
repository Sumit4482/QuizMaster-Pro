import { logger } from '../../utils/logger';
import { generateSecureToken } from '../../utils/crypto';
import { MultiProviderAiService } from '../../services/multiProviderAiService';
import { ContentModerationService } from '../../services/contentModerationService';
import { FactVerificationService } from '../../services/factVerificationService';

interface GenerateQuestionRequest {
  topic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_IN_THE_BLANK' | 'ESSAY';
  category: string;
  subject: string;
  context?: string;
  constraints?: {
    maxLength?: number;
    minOptions?: number;
    maxOptions?: number;
    language?: string;
    includeExplanation?: boolean;
  };
}

interface GeneratedQuestion {
  id: string;
  content: string;
  options: string[];
  correctAnswers: number[];
  explanation: string;
  difficulty: string;
  type: string;
  category: string;
  subject: string;
  metadata: {
    aiProvider: string;
    generatedAt: string;
    qualityScore: number;
    confidence: number;
    processingTime: number;
  };
}

interface ContentModerationRequest {
  content: string;
  type: 'question' | 'answer' | 'comment' | 'discussion';
  context?: string;
}

interface ModerationResult {
  approved: boolean;
  confidence: number;
  flags: string[];
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  suggestedActions: string[];
  metadata: {
    checkedAt: string;
    processingTime: number;
  };
}

interface FactCheckRequest {
  claim: string;
  context?: string;
  domain?: string;
}

interface FactCheckResult {
  accuracy: 'accurate' | 'inaccurate' | 'partially-accurate' | 'uncertain';
  confidence: number;
  sources: Array<{
    url: string;
    title: string;
    credibility: number;
    relevance: number;
  }>;
  explanation: string;
  metadata: {
    checkedAt: string;
    processingTime: number;
  };
}

interface ContentEnhancementRequest {
  content: string;
  type: 'improve' | 'summarize' | 'expand' | 'translate';
  targetLanguage?: string;
  maxLength?: number;
  style?: 'formal' | 'casual' | 'academic' | 'conversational';
}

interface EnhancedContent {
  original: string;
  enhanced: string;
  changes: Array<{
    type: string;
    description: string;
    impact: 'minor' | 'moderate' | 'major';
  }>;
  metrics: {
    readabilityScore: number;
    complexityReduction: number;
    lengthChange: number;
  };
  metadata: {
    enhancedAt: string;
    processingTime: number;
    aiProvider: string;
  };
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  aiProviders: Record<string, {
    status: 'online' | 'offline' | 'degraded';
    responseTime: number;
    successRate: number;
  }>;
  services: {
    questionGeneration: boolean;
    contentModeration: boolean;
    factVerification: boolean;
    contentEnhancement: boolean;
  };
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
}

export class AiService {
  private multiProviderAi: MultiProviderAiService;
  private contentModeration: ContentModerationService;
  private factVerification: FactVerificationService;

  constructor() {
    this.multiProviderAi = new MultiProviderAiService();
    this.contentModeration = new ContentModerationService();
    this.factVerification = new FactVerificationService();
  }

  /**
   * Generate questions using AI
   */
  async generateQuestions(
    request: GenerateQuestionRequest,
    count: number = 1
  ): Promise<GeneratedQuestion[]> {
    const startTime = Date.now();
    
    try {
      const questions: GeneratedQuestion[] = [];

      for (let i = 0; i < count; i++) {
        const questionStart = Date.now();
        
        // Create prompt for question generation
        const prompt = this.buildQuestionPrompt(request);
        
        // Generate question using AI
        const response = await this.multiProviderAi.generateContent({
          prompt,
          maxTokens: 1000,
          temperature: 0.7,
          model: 'gpt-3.5-turbo'
        });

        // Parse and validate the AI response
        const parsedQuestion = this.parseQuestionResponse(response.content);
        
        if (parsedQuestion) {
          // Generate quality score
          const qualityScore = await this.assessQuestionQuality(parsedQuestion, request);
          
          const question: GeneratedQuestion = {
            id: generateSecureToken(16),
            content: parsedQuestion.content,
            options: parsedQuestion.options,
            correctAnswers: parsedQuestion.correctAnswers,
            explanation: parsedQuestion.explanation,
            difficulty: request.difficulty,
            type: request.type,
            category: request.category,
            subject: request.subject,
            metadata: {
              aiProvider: response.provider,
              generatedAt: new Date().toISOString(),
              qualityScore,
              confidence: response.confidence || 0.8,
              processingTime: Date.now() - questionStart
            }
          };

          questions.push(question);
        }
      }

      logger.info('Questions generated successfully', {
        component: 'AiService',
        count: questions.length,
        requestedCount: count,
        topic: request.topic,
        difficulty: request.difficulty,
        processingTime: Date.now() - startTime
      });

      return questions;
    } catch (error) {
      logger.error('Failed to generate questions', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error),
        request,
        count,
        processingTime: Date.now() - startTime
      });
      throw new Error('Failed to generate questions');
    }
  }

  /**
   * Moderate content
   */
  async moderateContent(request: ContentModerationRequest): Promise<ModerationResult> {
    const startTime = Date.now();

    try {
      const result = await this.contentModeration.moderateContent(
        request.content,
        request.type as any,
        request.context
      );

      const moderationResult: ModerationResult = {
        approved: result.approved,
        confidence: result.confidence,
        flags: result.flags,
        severity: result.severity as any,
        explanation: result.explanation,
        suggestedActions: result.suggestedActions,
        metadata: {
          checkedAt: new Date().toISOString(),
          processingTime: Date.now() - startTime
        }
      };

      logger.info('Content moderated successfully', {
        component: 'AiService',
        approved: result.approved,
        flags: result.flags.length,
        severity: result.severity,
        processingTime: Date.now() - startTime
      });

      return moderationResult;
    } catch (error) {
      logger.error('Failed to moderate content', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error),
        request,
        processingTime: Date.now() - startTime
      });
      throw new Error('Failed to moderate content');
    }
  }

  /**
   * Verify facts
   */
  async verifyFacts(request: FactCheckRequest): Promise<FactCheckResult> {
    const startTime = Date.now();

    try {
      const result = await this.factVerification.verifyFacts(
        request.claim,
        request.context,
        { domain: request.domain }
      );

      const factCheckResult: FactCheckResult = {
        accuracy: result.accuracy as any,
        confidence: result.confidence,
        sources: result.sources.map(source => ({
          url: source.url,
          title: source.title,
          credibility: source.credibility,
          relevance: source.relevance
        })),
        explanation: result.explanation,
        metadata: {
          checkedAt: new Date().toISOString(),
          processingTime: Date.now() - startTime
        }
      };

      logger.info('Facts verified successfully', {
        component: 'AiService',
        accuracy: result.accuracy,
        confidence: result.confidence,
        sourcesFound: result.sources.length,
        processingTime: Date.now() - startTime
      });

      return factCheckResult;
    } catch (error) {
      logger.error('Failed to verify facts', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error),
        request,
        processingTime: Date.now() - startTime
      });
      throw new Error('Failed to verify facts');
    }
  }

  /**
   * Enhance content
   */
  async enhanceContent(request: ContentEnhancementRequest): Promise<EnhancedContent> {
    const startTime = Date.now();

    try {
      const prompt = this.buildEnhancementPrompt(request);
      
      const response = await this.multiProviderAi.generateContent({
        prompt,
        maxTokens: 2000,
        temperature: 0.3,
        model: 'gpt-4'
      });

      const enhanced = this.parseEnhancementResponse(response.content, request);

      const result: EnhancedContent = {
        original: request.content,
        enhanced: enhanced.content,
        changes: enhanced.changes,
        metrics: enhanced.metrics,
        metadata: {
          enhancedAt: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          aiProvider: response.provider
        }
      };

      logger.info('Content enhanced successfully', {
        component: 'AiService',
        type: request.type,
        originalLength: request.content.length,
        enhancedLength: enhanced.content.length,
        changesCount: enhanced.changes.length,
        processingTime: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('Failed to enhance content', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error),
        request,
        processingTime: Date.now() - startTime
      });
      throw new Error('Failed to enhance content');
    }
  }

  /**
   * Get AI service health status
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Check all AI providers
      const providerStatuses = await this.multiProviderAi.checkAllProviders();
      
      // Check individual services
      const services = {
        questionGeneration: true,
        contentModeration: true,
        factVerification: true,
        contentEnhancement: true
      };

      try {
        await this.contentModeration.healthCheck();
      } catch {
        services.contentModeration = false;
      }

      try {
        await this.factVerification.healthCheck();
      } catch {
        services.factVerification = false;
      }

      const allServicesHealthy = Object.values(services).every(status => status);
      const anyProviderOnline = Object.values(providerStatuses).some(provider => provider.status === 'online');

      return {
        status: allServicesHealthy && anyProviderOnline ? 'healthy' : 'unhealthy',
        aiProviders: providerStatuses,
        services,
        timestamp: new Date().toISOString(),
        service: 'ai-service',
        version: '1.0.0',
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('AI service health check failed', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        aiProviders: {},
        services: {
          questionGeneration: false,
          contentModeration: false,
          factVerification: false,
          contentEnhancement: false
        },
        timestamp: new Date().toISOString(),
        service: 'ai-service',
        version: '1.0.0',
        uptime: process.uptime()
      };
    }
  }

  /**
   * Build question generation prompt
   */
  private buildQuestionPrompt(request: GenerateQuestionRequest): string {
    const constraints = request.constraints || {};
    
    let prompt = `Generate a ${request.difficulty.toLowerCase()} level ${request.type.replace('_', ' ').toLowerCase()} question about ${request.topic} in the ${request.category} category for ${request.subject} subject.\n\n`;
    
    if (request.context) {
      prompt += `Context: ${request.context}\n\n`;
    }

    if (request.type === 'MULTIPLE_CHOICE') {
      const minOptions = constraints.minOptions || 4;
      const maxOptions = constraints.maxOptions || 4;
      prompt += `Provide ${minOptions === maxOptions ? minOptions : `${minOptions}-${maxOptions}`} answer options with only one correct answer.\n`;
    }

    if (constraints.includeExplanation !== false) {
      prompt += `Include a clear explanation for the correct answer.\n`;
    }

    prompt += `\nFormat your response as JSON with the following structure:
{
  "content": "The question text",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "correctAnswers": [0],
  "explanation": "Explanation for the correct answer"
}`;

    return prompt;
  }

  /**
   * Parse AI response for question generation
   */
  private parseQuestionResponse(response: string): any {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // If no JSON found, try to parse the entire response
      return JSON.parse(response);
    } catch (error) {
      logger.warn('Failed to parse AI question response', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error),
        response: response.substring(0, 200)
      });
      return null;
    }
  }

  /**
   * Assess question quality
   */
  private async assessQuestionQuality(question: any, request: GenerateQuestionRequest): Promise<number> {
    let score = 0.5; // Base score

    // Content length check
    if (question.content && question.content.length > 20 && question.content.length < 500) {
      score += 0.1;
    }

    // Options quality check
    if (question.options && question.options.length >= 2) {
      score += 0.1;
      if (question.options.every((option: string) => option.length > 3)) {
        score += 0.1;
      }
    }

    // Explanation quality check
    if (question.explanation && question.explanation.length > 20) {
      score += 0.1;
    }

    // Correct answers validation
    if (question.correctAnswers && question.correctAnswers.length > 0) {
      score += 0.1;
    }

    // Difficulty appropriateness (simplified check)
    const contentComplexity = question.content.split(' ').length;
    if (request.difficulty === 'EASY' && contentComplexity < 20) score += 0.1;
    if (request.difficulty === 'MEDIUM' && contentComplexity >= 15 && contentComplexity <= 30) score += 0.1;
    if (request.difficulty === 'HARD' && contentComplexity > 20) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Build content enhancement prompt
   */
  private buildEnhancementPrompt(request: ContentEnhancementRequest): string {
    let prompt = `Please ${request.type} the following content`;
    
    if (request.style) {
      prompt += ` in a ${request.style} style`;
    }
    
    if (request.targetLanguage) {
      prompt += ` and translate it to ${request.targetLanguage}`;
    }
    
    if (request.maxLength) {
      prompt += ` keeping it under ${request.maxLength} characters`;
    }

    prompt += `:\n\n"${request.content}"\n\n`;
    
    prompt += `Provide your response as JSON with this structure:
{
  "content": "The enhanced content",
  "changes": [{"type": "change_type", "description": "what was changed", "impact": "minor|moderate|major"}],
  "metrics": {"readabilityScore": 0.8, "complexityReduction": 0.2, "lengthChange": 0.1}
}`;

    return prompt;
  }

  /**
   * Parse content enhancement response
   */
  private parseEnhancementResponse(response: string, request: ContentEnhancementRequest): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          content: parsed.content || request.content,
          changes: parsed.changes || [],
          metrics: parsed.metrics || {
            readabilityScore: 0.7,
            complexityReduction: 0.0,
            lengthChange: (parsed.content?.length || 0) / request.content.length - 1
          }
        };
      }
      
      // Fallback: treat entire response as enhanced content
      return {
        content: response,
        changes: [{ type: 'enhancement', description: 'Content enhanced by AI', impact: 'moderate' }],
        metrics: {
          readabilityScore: 0.7,
          complexityReduction: 0.1,
          lengthChange: response.length / request.content.length - 1
        }
      };
    } catch (error) {
      logger.warn('Failed to parse enhancement response', {
        component: 'AiService',
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        content: request.content,
        changes: [],
        metrics: { readabilityScore: 0.5, complexityReduction: 0.0, lengthChange: 0.0 }
      };
    }
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    // Cleanup if needed
    logger.info('AI Service disconnecting', { component: 'AiService' });
  }
}

export default AiService;

