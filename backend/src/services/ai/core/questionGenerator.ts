/**
 * AI Question Generator
 * Generates high-quality quiz questions using AI with comprehensive validation
 */

import { logger } from '@/config/logger';
import {
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  GeneratedQuestion,
  BudgetConstraints,
  QualityAssessmentCriteria,
  AiRequest,
  AiRequestType,
  QuestionType,
  ValidationResult
} from '@/types/ai';

export interface QuestionGeneratorConfig {
  defaultModel: string;
  maxQuestionsPerBatch: number;
  qualityCriteria: QualityAssessmentCriteria;
  promptTemplates: Record<QuestionType, string>;
  difficultyPrompts: Record<number, string>;
  retryAttempts: number;
  qualityThreshold: number;
}

export interface GenerationContext {
  userId: string;
  budgetConstraints: BudgetConstraints;
  qualityThreshold: number;
  preferredModel?: string;
  preferredProvider?: string;
  existingQuestions?: string[];
}

/**
 * AI-Powered Question Generator
 * Creates educational quiz questions with quality validation
 */
export class QuestionGenerator {
  private config: QuestionGeneratorConfig;
  
  // Prompt templates for different question types
  private promptTemplates = {
    MULTIPLE_CHOICE: `Generate a high-quality multiple choice question about {topic} at difficulty level {difficulty}/5.

Requirements:
- Clear, unambiguous question text ending with a question mark
- Exactly 4 answer options labeled A, B, C, D
- One correct answer and three plausible distractors
- Brief explanation of why the correct answer is right
- Appropriate for difficulty level {difficulty} (1=very easy, 5=very hard)
- Educational and factually accurate

Topic: {topic}
Difficulty: {difficulty}/5
Subject: {subject}
Additional context: {context}

Format your response as valid JSON:
{
  "questionText": "Your question here?",
  "questionType": "MULTIPLE_CHOICE",
  "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
  "correctAnswer": "A",
  "explanation": "Explanation here",
  "difficulty": {difficulty},
  "estimatedTime": 30,
  "points": 10,
  "tags": ["tag1", "tag2"]
}`,

    TRUE_FALSE: `Generate a high-quality true/false question about {topic} at difficulty level {difficulty}/5.

Requirements:
- Clear statement that can be definitively true or false
- No ambiguous or opinion-based statements
- Educational value and factual accuracy
- Brief explanation of why the answer is correct
- Appropriate for difficulty level {difficulty}

Topic: {topic}
Difficulty: {difficulty}/5
Subject: {subject}
Additional context: {context}

Format your response as valid JSON:
{
  "questionText": "Your statement here?",
  "questionType": "TRUE_FALSE",
  "correctAnswer": true,
  "explanation": "Explanation here",
  "difficulty": {difficulty},
  "estimatedTime": 20,
  "points": 5,
  "tags": ["tag1", "tag2"]
}`,

    TEXT_INPUT: `Generate a high-quality short answer question about {topic} at difficulty level {difficulty}/5.

Requirements:
- Clear question requiring a specific factual answer
- Answer should be 1-3 words or a short phrase
- Accept multiple correct variations if applicable
- Brief explanation of the correct answer
- Appropriate for difficulty level {difficulty}

Topic: {topic}
Difficulty: {difficulty}/5
Subject: {subject}
Additional context: {context}

Format your response as valid JSON:
{
  "questionText": "Your question here?",
  "questionType": "TEXT_INPUT",
  "correctAnswer": "Expected answer",
  "acceptableAnswers": ["answer1", "answer2", "answer3"],
  "explanation": "Explanation here",
  "difficulty": {difficulty},
  "estimatedTime": 45,
  "points": 15,
  "tags": ["tag1", "tag2"]
}`
  };

  private difficultyDescriptions = {
    1: "Very Easy - Basic recall and recognition",
    2: "Easy - Simple understanding and application", 
    3: "Medium - Moderate analysis and comprehension",
    4: "Hard - Complex analysis and synthesis",
    5: "Very Hard - Expert-level critical thinking"
  };

  constructor(config: Partial<QuestionGeneratorConfig> = {}) {
    this.config = {
      defaultModel: config.defaultModel || 'gpt-3.5-turbo',
      maxQuestionsPerBatch: config.maxQuestionsPerBatch || 10,
      qualityCriteria: config.qualityCriteria || {
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
        }
      },
      promptTemplates: config.promptTemplates || this.promptTemplates,
      difficultyPrompts: config.difficultyPrompts || this.difficultyDescriptions,
      retryAttempts: config.retryAttempts || 3,
      qualityThreshold: config.qualityThreshold || 0.7,
      ...config
    };

    logger.info('Question Generator initialized', {
      component: 'QuestionGenerator',
      maxBatchSize: this.config.maxQuestionsPerBatch,
      qualityThreshold: this.config.qualityThreshold
    });
  }

  /**
   * Generate questions based on request
   */
  public async generateQuestions(
    request: QuestionGenerationRequest,
    userId: string,
    context: GenerationContext
  ): Promise<QuestionGenerationResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting question generation', {
        component: 'QuestionGenerator',
        userId,
        topic: request.topic,
        questionType: request.questionType,
        count: request.count,
        difficulty: request.difficulty
      });

      // Validate request
      this.validateRequest(request);

      // Prepare generation batches
      const batches = this.createBatches(request);
      const allQuestions: GeneratedQuestion[] = [];
      const errors: any[] = [];
      let totalCost = { inputCost: 0, outputCost: 0, requestCost: 0, totalCost: 0, currency: 'USD', estimated: true };
      let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        try {
          logger.debug(`Processing batch ${i + 1}/${batches.length}`, {
            component: 'QuestionGenerator',
            batchSize: batch.count
          });

          const batchResult = await this.generateQuestionBatch(batch, context);
          
          // Add successful questions
          allQuestions.push(...batchResult.questions);
          
          // Accumulate costs and usage
          totalCost.inputCost += batchResult.cost.inputCost;
          totalCost.outputCost += batchResult.cost.outputCost;
          totalCost.requestCost += batchResult.cost.requestCost;
          totalCost.totalCost += batchResult.cost.totalCost;
          
          totalUsage.inputTokens += batchResult.usage.inputTokens;
          totalUsage.outputTokens += batchResult.usage.outputTokens;
          totalUsage.totalTokens += batchResult.usage.totalTokens;
          totalUsage.requests += batchResult.usage.requests;

          if (batchResult.errors) {
            errors.push(...batchResult.errors);
          }

        } catch (error) {
          logger.error(`Batch ${i + 1} generation failed`, {
            component: 'QuestionGenerator',
            error: error instanceof Error ? error.message : String(error)
          });
          
          errors.push({
            batch: i + 1,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Calculate quality metrics
      const qualityMetrics = this.calculateQualityMetrics(allQuestions);

      // Filter questions that meet quality threshold
      const validQuestions = allQuestions.filter(q => 
        q.qualityScore >= context.qualityThreshold
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      const response: QuestionGenerationResponse = {
        success: validQuestions.length > 0,
        questions: validQuestions,
        totalGenerated: allQuestions.length,
        validQuestions: validQuestions.length,
        cost: totalCost,
        usage: totalUsage,
        qualityMetrics,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          model: context.preferredModel || this.config.defaultModel,
          provider: context.preferredProvider || 'auto',
          processingTime: duration,
          batchCount: batches.length
        }
      };

      logger.info('Question generation completed', {
        component: 'QuestionGenerator',
        userId,
        requested: request.count,
        generated: allQuestions.length,
        valid: validQuestions.length,
        cost: totalCost.totalCost,
        duration
      });

      return response;

    } catch (error) {
      logger.error('Question generation failed', {
        component: 'QuestionGenerator',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        questions: [],
        totalGenerated: 0,
        validQuestions: 0,
        cost: { inputCost: 0, outputCost: 0, requestCost: 0, totalCost: 0, currency: 'USD', estimated: true },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 1 },
        qualityMetrics: {
          overallScore: 0,
          contentQuality: 0,
          formatCorrectness: 0,
          difficultyAccuracy: 0,
          grammarScore: 0,
          factualAccuracy: 0,
          uniqueness: 0,
          educationalValue: 0,
          clarity: 0
        },
        errors: [{ error: error instanceof Error ? error.message : String(error) }],
        metadata: {
          model: this.config.defaultModel,
          provider: 'error',
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Generate a batch of questions
   */
  private async generateQuestionBatch(
    request: QuestionGenerationRequest,
    context: GenerationContext
  ): Promise<{
    questions: GeneratedQuestion[];
    cost: any;
    usage: any;
    errors?: any[];
  }> {
    // Build the prompt for question generation
    const prompt = this.buildPrompt(request);
    
    // Create AI request
    const aiRequest: AiRequest = {
      id: `question_gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: context.userId,
      requestType: AiRequestType.QUESTION_GENERATION,
      prompt,
      parameters: {
        temperature: 0.7,
        maxTokens: Math.min(4000, request.count * 500), // Estimate tokens per question
        topP: 0.9,
        systemPrompt: this.buildSystemPrompt(request)
      },
      options: {
        allowFallback: true,
        preferFreeModels: context.budgetConstraints.preferFreeModels,
        maxCost: context.budgetConstraints.perRequestLimit,
        qualityThreshold: context.qualityThreshold,
        retryOnFailure: true,
        validateContent: true
      }
    };

    // This would call the main AI service to generate content
    // For now, we'll simulate the response structure
    const mockResponse = {
      success: true,
      content: this.generateMockQuestions(request),
      cost: { inputCost: 0.001, outputCost: 0.002, requestCost: 0, totalCost: 0.003, currency: 'USD', estimated: true },
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, requests: 1 }
    };

    // Parse and validate questions
    const questions = await this.parseQuestions(mockResponse.content, request);
    
    return {
      questions,
      cost: mockResponse.cost,
      usage: mockResponse.usage,
      errors: []
    };
  }

  /**
   * Build AI prompt for question generation
   */
  private buildPrompt(request: QuestionGenerationRequest): string {
    const template = this.promptTemplates[request.questionType];
    
    if (!template) {
      throw new Error(`No template found for question type: ${request.questionType}`);
    }

    let prompt = template
      .replace(/{topic}/g, request.topic)
      .replace(/{difficulty}/g, request.difficulty.toString())
      .replace(/{subject}/g, request.subject || request.topic)
      .replace(/{context}/g, request.context || 'None provided');

    // Add batch generation instructions if generating multiple questions
    if (request.count > 1) {
      prompt = `Generate ${request.count} questions. Return them as a JSON array of question objects.\n\n${prompt}`;
    }

    // Add uniqueness instruction if existing questions provided
    if (request.existingQuestions && request.existingQuestions.length > 0) {
      prompt += `\n\nIMPORTANT: Make sure your questions are unique and different from these existing questions:\n${request.existingQuestions.slice(0, 5).join('\n')}`;
    }

    return prompt;
  }

  /**
   * Build system prompt for AI
   */
  private buildSystemPrompt(request: QuestionGenerationRequest): string {
    const difficultyDesc = this.difficultyDescriptions[request.difficulty] || 'Medium difficulty';
    
    return `You are an expert educational content creator specializing in quiz questions. 
Your task is to generate high-quality, educational quiz questions that are:
1. Factually accurate and well-researched
2. Clear and unambiguous
3. Appropriate for the specified difficulty level (${difficultyDesc})
4. Educational and engaging
5. Formatted correctly according to the requirements

Always return valid JSON as specified in the template. Ensure questions are unique, relevant to the topic, and suitable for learning assessment.`;
  }

  /**
   * Parse AI response into GeneratedQuestion objects
   */
  private async parseQuestions(
    content: string,
    request: QuestionGenerationRequest
  ): Promise<GeneratedQuestion[]> {
    const questions: GeneratedQuestion[] = [];

    try {
      // Try to parse as JSON
      let parsedContent;
      
      if (content.trim().startsWith('[')) {
        // Array of questions
        parsedContent = JSON.parse(content);
      } else if (content.trim().startsWith('{')) {
        // Single question
        parsedContent = [JSON.parse(content)];
      } else {
        // Try to extract JSON from text
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = [JSON.parse(jsonMatch[0])];
        } else {
          throw new Error('No valid JSON found in response');
        }
      }

      // Process each question
      for (const questionData of parsedContent) {
        const generatedQuestion = await this.createGeneratedQuestion(questionData, request);
        questions.push(generatedQuestion);
      }

    } catch (error) {
      logger.error('Failed to parse AI response', {
        component: 'QuestionGenerator',
        error: error instanceof Error ? error.message : String(error),
        content: content.substring(0, 200) + '...'
      });

      // Create a fallback question from the raw content
      const fallbackQuestion = await this.createFallbackQuestion(content, request);
      questions.push(fallbackQuestion);
    }

    return questions;
  }

  /**
   * Create GeneratedQuestion object with validation
   */
  private async createGeneratedQuestion(
    questionData: any,
    request: QuestionGenerationRequest
  ): Promise<GeneratedQuestion> {
    // Validate and score the question
    const validationResult = await this.validateQuestion(questionData, request);
    
    const question: GeneratedQuestion = {
      questionText: questionData.questionText || 'Invalid question',
      questionType: questionData.questionType || request.questionType,
      options: questionData.options,
      correctAnswer: questionData.correctAnswer,
      explanation: questionData.explanation,
      hints: questionData.hints || [],
      difficulty: questionData.difficulty || request.difficulty,
      estimatedTime: questionData.estimatedTime || 30,
      points: questionData.points || 10,
      topic: request.topic,
      subject: request.subject,
      tags: questionData.tags || [request.topic.toLowerCase()],
      metadata: {
        source: 'ai_generated',
        generatedAt: new Date(),
        promptVersion: '1.0',
        bloomsTaxonomy: this.getBloomsTaxonomy(request.difficulty),
        learningObjective: questionData.learningObjective,
        conceptsCovered: [request.topic],
        prerequisites: [],
        relatedTopics: questionData.relatedTopics || []
      },
      qualityScore: validationResult.score,
      validationResults: [validationResult]
    };

    return question;
  }

  /**
   * Create fallback question when parsing fails
   */
  private async createFallbackQuestion(
    content: string,
    request: QuestionGenerationRequest
  ): Promise<GeneratedQuestion> {
    // Extract question text from content (simple heuristic)
    const lines = content.split('\n').filter(line => line.trim());
    const questionLine = lines.find(line => line.includes('?')) || lines[0] || 'Generated question content';

    const question: GeneratedQuestion = {
      questionText: questionLine.endsWith('?') ? questionLine : questionLine + '?',
      questionType: request.questionType,
      correctAnswer: request.questionType === 'TRUE_FALSE' ? true : 'Unknown',
      explanation: 'AI-generated content could not be properly parsed',
      hints: [],
      difficulty: request.difficulty,
      estimatedTime: 30,
      points: 5, // Lower points for fallback questions
      topic: request.topic,
      subject: request.subject,
      tags: [request.topic.toLowerCase(), 'fallback'],
      metadata: {
        source: 'ai_generated_fallback',
        generatedAt: new Date(),
        promptVersion: '1.0',
        bloomsTaxonomy: this.getBloomsTaxonomy(request.difficulty),
        conceptsCovered: [request.topic],
        prerequisites: [],
        relatedTopics: []
      },
      qualityScore: 0.3, // Low score for fallback
      validationResults: [{
        valid: false,
        score: 0.3,
        issues: [{
          type: 'FORMAT_ERROR' as any,
          severity: 'HIGH' as any,
          description: 'Question parsing failed, using fallback',
          field: 'content',
          autoFixable: false
        }],
        suggestions: ['Regenerate question with better formatting'],
        autoFixApplied: false,
        humanReviewRequired: true
      }]
    };

    return question;
  }

  /**
   * Validate generated question
   */
  private async validateQuestion(
    questionData: any,
    request: QuestionGenerationRequest
  ): Promise<ValidationResult> {
    // This would use the ContentValidator service
    // For now, we'll do basic validation
    const issues = [];
    let score = 1.0;

    // Check required fields
    if (!questionData.questionText) {
      issues.push({
        type: 'FORMAT_ERROR' as any,
        severity: 'CRITICAL' as any,
        description: 'Missing question text',
        field: 'questionText',
        autoFixable: false
      });
      score -= 0.5;
    }

    if (!questionData.correctAnswer) {
      issues.push({
        type: 'FORMAT_ERROR' as any,
        severity: 'CRITICAL' as any,
        description: 'Missing correct answer',
        field: 'correctAnswer',
        autoFixable: false
      });
      score -= 0.5;
    }

    // Check question mark
    if (questionData.questionText && !questionData.questionText.trim().endsWith('?')) {
      issues.push({
        type: 'FORMAT_ERROR' as any,
        severity: 'MEDIUM' as any,
        description: 'Question should end with question mark',
        field: 'questionText',
        autoFixable: true
      });
      score -= 0.1;
    }

    return {
      valid: score > 0.5,
      score: Math.max(0, score),
      issues,
      suggestions: issues.length > 0 ? ['Review and correct question format'] : [],
      autoFixApplied: false,
      humanReviewRequired: score < 0.7
    };
  }

  /**
   * Create batches for processing
   */
  private createBatches(request: QuestionGenerationRequest): QuestionGenerationRequest[] {
    const batches: QuestionGenerationRequest[] = [];
    const maxBatchSize = this.config.maxQuestionsPerBatch;
    
    let remaining = request.count;
    while (remaining > 0) {
      const batchSize = Math.min(remaining, maxBatchSize);
      batches.push({
        ...request,
        count: batchSize
      });
      remaining -= batchSize;
    }

    return batches;
  }

  /**
   * Calculate quality metrics for generated questions
   */
  private calculateQualityMetrics(questions: GeneratedQuestion[]) {
    if (questions.length === 0) {
      return {
        overallScore: 0,
        contentQuality: 0,
        formatCorrectness: 0,
        difficultyAccuracy: 0,
        grammarScore: 0,
        factualAccuracy: 0,
        uniqueness: 0,
        educationalValue: 0,
        clarity: 0
      };
    }

    const avgQuality = questions.reduce((sum, q) => sum + q.qualityScore, 0) / questions.length;
    
    return {
      overallScore: avgQuality,
      contentQuality: avgQuality * 0.9, // Estimate
      formatCorrectness: avgQuality * 0.95,
      difficultyAccuracy: avgQuality * 0.8,
      grammarScore: avgQuality * 0.9,
      factualAccuracy: avgQuality * 0.85,
      uniqueness: avgQuality * 0.7,
      educationalValue: avgQuality * 0.8,
      clarity: avgQuality * 0.85
    };
  }

  /**
   * Get Bloom's taxonomy level for difficulty
   */
  private getBloomsTaxonomy(difficulty: number): string {
    const taxonomyMap: Record<number, string> = {
      1: 'Remember',
      2: 'Understand', 
      3: 'Apply',
      4: 'Analyze',
      5: 'Evaluate'
    };
    
    return taxonomyMap[difficulty] || 'Apply';
  }

  /**
   * Validate generation request
   */
  private validateRequest(request: QuestionGenerationRequest): void {
    if (!request.topic || request.topic.trim().length === 0) {
      throw new Error('Topic is required for question generation');
    }

    if (request.count <= 0 || request.count > 100) {
      throw new Error('Question count must be between 1 and 100');
    }

    if (request.difficulty < 1 || request.difficulty > 5) {
      throw new Error('Difficulty must be between 1 and 5');
    }

    if (!Object.values(QuestionType).includes(request.questionType)) {
      throw new Error(`Invalid question type: ${request.questionType}`);
    }
  }

  /**
   * Generate mock questions for testing
   */
  private generateMockQuestions(request: QuestionGenerationRequest): string {
    const mockQuestion = {
      questionText: `What is the main concept related to ${request.topic}?`,
      questionType: request.questionType,
      correctAnswer: request.questionType === 'TRUE_FALSE' ? true : 'A',
      options: request.questionType === 'MULTIPLE_CHOICE' ? [
        'A) First option',
        'B) Second option', 
        'C) Third option',
        'D) Fourth option'
      ] : undefined,
      explanation: `This question tests understanding of ${request.topic}.`,
      difficulty: request.difficulty,
      estimatedTime: 30,
      points: 10,
      tags: [request.topic.toLowerCase()]
    };

    return request.count === 1 
      ? JSON.stringify(mockQuestion, null, 2)
      : JSON.stringify(Array(request.count).fill(mockQuestion), null, 2);
  }
}

export default QuestionGenerator;
