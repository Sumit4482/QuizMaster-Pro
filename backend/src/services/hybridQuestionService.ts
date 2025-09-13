import { EventEmitter } from 'events';
import { AiService } from './aiService';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { Question, QuestionType, ValidationStatus } from '@prisma/client';
import { QuestionGenerationRequest, GeneratedQuestion } from '../types/ai';

export interface HybridQuestionRequest {
  topic: string;
  subject?: string;
  difficulty: number;
  questionType: QuestionType;
  count: number;
  categoryIds?: number[];
  aiRatio?: number; // 0-1, percentage of AI vs DB questions
  qualityThreshold?: number;
  contextHistory?: string[];
  userPreferences?: UserQuestionPreferences;
}

export interface UserQuestionPreferences {
  favoriteTopics: string[];
  difficultyProgression: boolean;
  preferredQuestionTypes: QuestionType[];
  avoidRecentQuestions: boolean;
  personalizedDifficulty: boolean;
}

export interface HybridQuestionResponse {
  questions: Question[];
  sources: QuestionSource[];
  qualityScores: number[];
  hybridRatio: {
    ai: number;
    database: number;
  };
  fallbacksUsed: string[];
  cacheHits: number;
  totalGenerationTime: number;
}

export interface QuestionSource {
  id: string;
  source: 'ai' | 'database' | 'cache';
  provider?: string;
  qualityScore: number;
  generatedAt?: Date;
  cacheHit?: boolean;
}

export interface QualityMetrics {
  accuracy: number;
  clarity: number;
  engagement: number;
  educational_value: number;
  difficulty_appropriateness: number;
  overall_score: number;
}

/**
 * Phase 3.2: Hybrid Question System
 * 
 * Intelligently blends AI-generated and database questions based on:
 * - Availability and quality
 * - User performance and preferences  
 * - Context and educational objectives
 * - Performance requirements
 */
export class HybridQuestionService extends EventEmitter {
  private static instance: HybridQuestionService | null = null;
  private aiService: AiService;
  private questionCache: Map<string, CachedQuestion> = new Map();
  private qualityThresholds = {
    minimum: 0.6,
    preferred: 0.8,
    excellent: 0.9
  };
  
  private fallbackStrategies = ['ai_primary', 'database_primary', 'mixed_optimal'];
  private performanceMetrics = new Map<string, PerformanceMetric>();

  private constructor() {
    super();
    this.aiService = AiService.getInstance();
    this.initializeQualitySystem();
  }

  public static getInstance(): HybridQuestionService {
    if (!HybridQuestionService.instance) {
      HybridQuestionService.instance = new HybridQuestionService();
    }
    return HybridQuestionService.instance;
  }

  /**
   * Main hybrid question generation method
   */
  public async generateHybridQuestions(
    request: HybridQuestionRequest,
    userId: string
  ): Promise<HybridQuestionResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('🔄 Starting hybrid question generation', {
        component: 'HybridQuestionService',
        userId,
        request: { ...request, count: request.count }
      });

      // Determine optimal mixing strategy
      const mixingStrategy = await this.determineMixingStrategy(request, userId);
      
      // Get questions from multiple sources
      const results = await this.executeHybridStrategy(mixingStrategy, request, userId);
      
      // Apply quality-based selection and ranking
      const finalQuestions = await this.selectAndRankQuestions(results, request);
      
      // Track performance and update metrics
      await this.updatePerformanceMetrics(request, results, finalQuestions);
      
      const response: HybridQuestionResponse = {
        questions: finalQuestions,
        sources: results.sources,
        qualityScores: results.qualityScores,
        hybridRatio: results.hybridRatio,
        fallbacksUsed: results.fallbacksUsed,
        cacheHits: results.cacheHits,
        totalGenerationTime: Date.now() - startTime
      };

      this.emit('questionsGenerated', {
        userId,
        request,
        response,
        performance: {
          totalTime: response.totalGenerationTime,
          cacheEfficiency: results.cacheHits / request.count,
          qualityAverage: results.qualityScores.reduce((a, b) => a + b, 0) / results.qualityScores.length
        }
      });

      return response;

    } catch (error) {
      logger.error('❌ Hybrid question generation failed', {
        component: 'HybridQuestionService',
        userId,
        error: error instanceof Error ? error.message : String(error),
        request
      });

      // Attempt emergency fallback
      return await this.emergencyFallback(request, userId);
    }
  }

  /**
   * Determine optimal mixing strategy based on context
   */
  private async determineMixingStrategy(
    request: HybridQuestionRequest,
    userId: string
  ): Promise<MixingStrategy> {
    // Analyze available database questions
    const dbAvailability = await this.analyzeDatabaseAvailability(request);
    
    // Check AI service health and capacity
    const aiHealth = await this.checkAiServiceHealth();
    
    // Get user performance history and preferences
    const userContext = await this.getUserContext(userId, request);
    
    // Calculate optimal ratio
    const optimalRatio = this.calculateOptimalRatio(
      request.aiRatio || 0.3, // Default 30% AI
      dbAvailability,
      aiHealth,
      userContext
    );

    return {
      aiQuestionCount: Math.ceil(request.count * optimalRatio.ai),
      dbQuestionCount: Math.floor(request.count * optimalRatio.db),
      cacheQuestionCount: Math.floor(request.count * optimalRatio.cache),
      strategy: this.selectBestStrategy(dbAvailability, aiHealth),
      fallbackOrder: ['cache', 'database', 'ai'],
      qualityThreshold: request.qualityThreshold || this.qualityThresholds.preferred
    };
  }

  /**
   * Execute the hybrid strategy to get questions from multiple sources
   */
  private async executeHybridStrategy(
    strategy: MixingStrategy,
    request: HybridQuestionRequest,
    userId: string
  ): Promise<HybridResults> {
    const results: HybridResults = {
      questions: [],
      sources: [],
      qualityScores: [],
      hybridRatio: { ai: 0, database: 0 },
      fallbacksUsed: [],
      cacheHits: 0
    };

    // Try to get cached questions first
    const cachedQuestions = await this.getCachedQuestions(request, strategy.cacheQuestionCount);
    this.addToResults(results, cachedQuestions, 'cache');

    // Get database questions
    if (strategy.dbQuestionCount > 0) {
      try {
        const dbQuestions = await this.getDatabaseQuestions(request, strategy.dbQuestionCount);
        this.addToResults(results, dbQuestions, 'database');
      } catch (error) {
        logger.warn('Database question retrieval failed, adjusting strategy', { error });
        results.fallbacksUsed.push('database_failed');
        strategy.aiQuestionCount += strategy.dbQuestionCount;
      }
    }

    // Get AI-generated questions
    if (strategy.aiQuestionCount > 0) {
      try {
        const aiQuestions = await this.getAiQuestions(request, strategy.aiQuestionCount, userId);
        this.addToResults(results, aiQuestions, 'ai');
      } catch (error) {
        logger.warn('AI question generation failed, using database fallback', { error });
        results.fallbacksUsed.push('ai_failed');
        
        // Emergency database fallback
        const fallbackQuestions = await this.getDatabaseQuestions(request, strategy.aiQuestionCount);
        this.addToResults(results, fallbackQuestions, 'database');
      }
    }

    // Calculate final ratios
    results.hybridRatio = this.calculateFinalRatios(results);

    return results;
  }

  /**
   * Get high-quality questions from database
   */
  private async getDatabaseQuestions(
    request: HybridQuestionRequest,
    count: number
  ): Promise<QuestionWithMetrics[]> {
    const dbQuestions = await prisma.question.findMany({
      where: {
        questionType: request.questionType,
        difficultyLevel: request.difficulty,
        isActive: true,
        isPublished: true,
        ...(request.categoryIds && request.categoryIds.length > 0 && {
          categories: {
            some: {
              categoryId: { in: request.categoryIds }
            }
          }
        }),
        ...(request.topic && {
          OR: [
            { questionText: { contains: request.topic, mode: 'insensitive' } },
            { tags: { has: request.topic.toLowerCase() } }
          ]
        })
      },
      include: {
        usage: true,
        categories: {
          include: {
            category: true
          }
        }
      },
      orderBy: [
        { points: 'desc' }, // Prefer higher point questions (quality indicator)
        { createdAt: 'desc' }
      ],
      take: count * 3 // Get extra to allow for quality filtering
    });

    // Score and filter questions
    const questionsWithMetrics = await Promise.all(
      dbQuestions.map(async (question) => ({
        question,
        qualityScore: await this.calculateQuestionQuality(question),
        source: 'database' as const
      }))
    );

    // Sort by quality and take the best ones
    return questionsWithMetrics
      .filter(q => q.qualityScore >= this.qualityThresholds.minimum)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, count);
  }

  /**
   * Get AI-generated questions with quality validation
   */
  private async getAiQuestions(
    request: HybridQuestionRequest,
    count: number,
    userId: string
  ): Promise<QuestionWithMetrics[]> {
    const generationRequest: QuestionGenerationRequest = {
      topic: request.topic,
      subject: request.subject,
      difficulty: request.difficulty,
      questionType: request.questionType,
      count: count,
      context: request.contextHistory?.join('\n'),
      tags: [],
      language: 'en'
    };

    const aiResult = await this.aiService.generateQuestions(generationRequest, userId, {
      qualityThreshold: request.qualityThreshold || this.qualityThresholds.preferred
    });

    // Convert AI-generated questions to our format and score them
    const questionsWithMetrics = await Promise.all(
      aiResult.questions.map(async (genQuestion) => {
        const question = await this.convertAiQuestionToDatabase(genQuestion, userId);
        const qualityScore = await this.calculateAiQuestionQuality(genQuestion);
        
        return {
          question,
          qualityScore,
          source: 'ai' as const,
          provider: aiResult.provider || 'unknown'
        };
      })
    );

    // Cache high-quality AI questions for future use
    await this.cacheHighQualityQuestions(questionsWithMetrics);

    return questionsWithMetrics;
  }

  /**
   * Get cached questions that match request criteria
   */
  private async getCachedQuestions(
    request: HybridQuestionRequest,
    count: number
  ): Promise<QuestionWithMetrics[]> {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.questionCache.get(cacheKey);
    
    if (!cached || this.isCacheExpired(cached)) {
      return [];
    }

    // Filter and return matching cached questions
    const matchingQuestions = cached.questions
      .filter(q => q.qualityScore >= this.qualityThresholds.minimum)
      .slice(0, count);

    logger.info(`📦 Cache hit: Found ${matchingQuestions.length} cached questions`);
    return matchingQuestions;
  }

  /**
   * Calculate quality score for database questions
   */
  private async calculateQuestionQuality(question: Question): Promise<number> {
    const metrics: QualityMetrics = {
      accuracy: 0.9, // Assume high accuracy for published questions
      clarity: this.assessTextClarity(question.questionText),
      engagement: this.assessEngagement(question),
      educational_value: this.assessEducationalValue(question),
      difficulty_appropriateness: this.assessDifficultyAlignment(question),
      overall_score: 0
    };

    // Weight the metrics
    metrics.overall_score = (
      metrics.accuracy * 0.3 +
      metrics.clarity * 0.2 +
      metrics.engagement * 0.2 +
      metrics.educational_value * 0.2 +
      metrics.difficulty_appropriateness * 0.1
    );

    return Math.min(1.0, Math.max(0.0, metrics.overall_score));
  }

  /**
   * Calculate quality score for AI-generated questions
   */
  private async calculateAiQuestionQuality(question: GeneratedQuestion): Promise<number> {
    // Use AI service's built-in quality scoring if available
    if (question.qualityScore) {
      return question.qualityScore;
    }

    // Fallback to our own quality assessment
    const metrics: QualityMetrics = {
      accuracy: await this.validateFactualAccuracy(question.questionText),
      clarity: this.assessTextClarity(question.questionText),
      engagement: this.assessAiQuestionEngagement(question),
      educational_value: this.assessAiEducationalValue(question),
      difficulty_appropriateness: this.assessAiDifficultyAlignment(question),
      overall_score: 0
    };

    metrics.overall_score = (
      metrics.accuracy * 0.3 +
      metrics.clarity * 0.2 +
      metrics.engagement * 0.2 +
      metrics.educational_value * 0.2 +
      metrics.difficulty_appropriateness * 0.1
    );

    return Math.min(1.0, Math.max(0.0, metrics.overall_score));
  }

  /**
   * Select and rank final questions based on quality and diversity
   */
  private async selectAndRankQuestions(
    results: HybridResults,
    request: HybridQuestionRequest
  ): Promise<Question[]> {
    const allQuestions = results.questions;
    
    // Sort by quality score
    allQuestions.sort((a, b) => {
      const aIndex = results.questions.indexOf(a);
      const bIndex = results.questions.indexOf(b);
      return results.qualityScores[bIndex] - results.qualityScores[aIndex];
    });

    // Ensure diversity in selection
    const selectedQuestions = await this.ensureQuestionDiversity(allQuestions, request);
    
    // Limit to requested count
    return selectedQuestions.slice(0, request.count);
  }

  /**
   * Emergency fallback when primary systems fail
   */
  private async emergencyFallback(
    request: HybridQuestionRequest,
    userId: string
  ): Promise<HybridQuestionResponse> {
    logger.warn('🚨 Executing emergency fallback for hybrid questions');
    
    try {
      // Try to get any available questions from database
      const emergencyQuestions = await prisma.question.findMany({
        where: {
          questionType: request.questionType,
          isActive: true,
          isPublished: true
        },
        take: request.count,
        orderBy: { createdAt: 'desc' }
      });

      return {
        questions: emergencyQuestions,
        sources: emergencyQuestions.map(q => ({
          id: q.id,
          source: 'database' as const,
          qualityScore: 0.7 // Default quality score
        })),
        qualityScores: emergencyQuestions.map(() => 0.7),
        hybridRatio: { ai: 0, database: 1 },
        fallbacksUsed: ['emergency_database'],
        cacheHits: 0,
        totalGenerationTime: 0
      };
    } catch (error) {
      logger.error('❌ Emergency fallback failed', { error });
      throw new Error('All question generation systems unavailable');
    }
  }

  // Helper methods...
  
  private initializeQualitySystem(): void {
    // Initialize quality assessment system
    logger.info('🎯 Initializing hybrid question quality system');
  }

  private generateCacheKey(request: HybridQuestionRequest): string {
    return `hybrid_${request.topic}_${request.difficulty}_${request.questionType}_${request.count}`;
  }

  private isCacheExpired(cached: CachedQuestion): boolean {
    const TTL = 1000 * 60 * 60; // 1 hour
    return Date.now() - cached.cachedAt.getTime() > TTL;
  }

  private assessTextClarity(text: string): number {
    // Simple text clarity assessment
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const avgWordsPerSentence = text.split(/\s+/).length / sentences.length;
    
    // Prefer moderate sentence length (10-20 words)
    if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20) return 0.9;
    if (avgWordsPerSentence >= 5 && avgWordsPerSentence <= 30) return 0.7;
    return 0.5;
  }

  private assessEngagement(question: Question): number {
    // Assess engagement based on question structure and content
    const hasGoodOptions = question.options && Array.isArray(question.options) && question.options.length >= 3;
    const hasExplanation = question.explanation && question.explanation.length > 20;
    const hasReasonableLength = question.questionText.length >= 10 && question.questionText.length <= 300;
    
    let score = 0.5;
    if (hasGoodOptions) score += 0.2;
    if (hasExplanation) score += 0.2;
    if (hasReasonableLength) score += 0.1;
    
    return Math.min(1.0, score);
  }

  private assessEducationalValue(question: Question): number {
    // Basic educational value assessment
    const hasExplanation = question.explanation && question.explanation.length > 0;
    const hasMultipleOptions = question.options && Array.isArray(question.options) && question.options.length > 2;
    const appropriatePoints = question.points >= 5 && question.points <= 50;
    
    let score = 0.6;
    if (hasExplanation) score += 0.2;
    if (hasMultipleOptions) score += 0.1;
    if (appropriatePoints) score += 0.1;
    
    return Math.min(1.0, score);
  }

  private assessDifficultyAlignment(question: Question): number {
    // Assess if question difficulty matches expected level
    const estimatedTime = question.estimatedTime || 30;
    const points = question.points || 10;
    
    // Heuristic: higher difficulty should have more points and time
    const difficultyFactor = question.difficultyLevel / 5; // Normalize to 0-1
    const timeFactor = Math.min(1, estimatedTime / 60); // Normalize time
    const pointFactor = Math.min(1, points / 50); // Normalize points
    
    const alignment = Math.abs(difficultyFactor - (timeFactor + pointFactor) / 2);
    return Math.max(0, 1 - alignment);
  }

  // AI-specific assessment methods
  private assessAiQuestionEngagement(question: GeneratedQuestion): number {
    // Similar to database questions but adapted for AI questions
    return 0.8; // Default score, can be enhanced with NLP analysis
  }

  private assessAiEducationalValue(question: GeneratedQuestion): number {
    return 0.8; // Default score, can be enhanced with educational content analysis
  }

  private assessAiDifficultyAlignment(question: GeneratedQuestion): number {
    return 0.8; // Default score, can be enhanced with difficulty analysis
  }

  private async validateFactualAccuracy(questionText: string): Promise<number> {
    // Placeholder for fact verification system (Phase 3.3)
    return 0.85; // Default score
  }

  // Additional helper methods...
  private addToResults(results: HybridResults, questions: QuestionWithMetrics[], source: string): void {
    questions.forEach(q => {
      results.questions.push(q.question);
      results.qualityScores.push(q.qualityScore);
      results.sources.push({
        id: q.question.id,
        source: source as any,
        qualityScore: q.qualityScore,
        provider: (q as any).provider
      });
    });
  }

  private calculateFinalRatios(results: HybridResults): { ai: number; database: number } {
    const total = results.sources.length;
    if (total === 0) return { ai: 0, database: 0 };
    
    const ai = results.sources.filter(s => s.source === 'ai').length / total;
    const database = results.sources.filter(s => s.source === 'database' || s.source === 'cache').length / total;
    
    return { ai, database };
  }

  private async convertAiQuestionToDatabase(genQuestion: GeneratedQuestion, userId: string): Promise<Question> {
    // Convert AI question format to database Question model
    return {
      id: genQuestion.id,
      questionText: genQuestion.questionText,
      questionType: genQuestion.questionType,
      options: genQuestion.options,
      correctAnswer: genQuestion.correctAnswer,
      explanation: genQuestion.explanation,
      hints: genQuestion.hints || null,
      difficultyLevel: genQuestion.difficulty || 1,
      estimatedTime: genQuestion.estimatedTime || 30,
      points: genQuestion.points || 10,
      source: 'ai',
      tags: genQuestion.tags || [],
      metadata: genQuestion.metadata || null,
      version: 1,
      originalId: null,
      createdById: userId,
      lastModifiedById: null,
      isActive: true,
      isPublished: false,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Question;
  }

  private async cacheHighQualityQuestions(questions: QuestionWithMetrics[]): Promise<void> {
    // Cache high-quality questions for future use
    const highQuality = questions.filter(q => q.qualityScore >= this.qualityThresholds.excellent);
    
    highQuality.forEach(q => {
      const cacheKey = `quality_${q.question.questionType}_${q.question.difficultyLevel}`;
      const existing = this.questionCache.get(cacheKey) || { questions: [], cachedAt: new Date() };
      
      existing.questions.push(q);
      existing.cachedAt = new Date();
      
      this.questionCache.set(cacheKey, existing);
    });
  }

  // Missing method implementations
  
  private async analyzeDatabaseAvailability(request: HybridQuestionRequest): Promise<DatabaseAvailability> {
    try {
      const availableQuestions = await prisma.question.count({
        where: {
          questionType: request.questionType,
          difficultyLevel: request.difficulty,
          isActive: true,
          isPublished: true,
          ...(request.categoryIds && request.categoryIds.length > 0 && {
            categories: {
              some: {
                categoryId: { in: request.categoryIds }
              }
            }
          }),
          ...(request.topic && {
            OR: [
              { questionText: { contains: request.topic, mode: 'insensitive' } },
              { tags: { has: request.topic.toLowerCase() } }
            ]
          })
        }
      });

      const totalAvailable = await prisma.question.count({
        where: {
          isActive: true,
          isPublished: true
        }
      });

      return {
        availableCount: availableQuestions,
        totalCount: totalAvailable,
        coverageRatio: availableQuestions / Math.max(1, request.count),
        qualityRating: availableQuestions > request.count ? 0.9 : 0.6
      };
    } catch (error) {
      logger.error('Failed to analyze database availability', { error });
      return {
        availableCount: 0,
        totalCount: 0,
        coverageRatio: 0,
        qualityRating: 0
      };
    }
  }

  private async checkAiServiceHealth(): Promise<AiServiceHealth> {
    try {
      // Check if AI service is initialized and healthy
      const isHealthy = this.aiService && await this.aiService.healthCheck();
      
      return {
        isAvailable: isHealthy,
        responseTime: 1500, // Mock response time
        successRate: 0.95,
        costEfficiency: 0.8,
        qualityRating: 0.85
      };
    } catch (error) {
      logger.error('AI service health check failed', { error });
      return {
        isAvailable: false,
        responseTime: 0,
        successRate: 0,
        costEfficiency: 0,
        qualityRating: 0
      };
    }
  }

  private async getUserContext(userId: string, request: HybridQuestionRequest): Promise<UserContext> {
    try {
      // Get user's recent quiz performance
      const recentSessions = await prisma.quizSession.findMany({
        where: {
          userId: userId
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          answers: true
        }
      });

      // Get user preferences (if they exist)
      const userStats = await prisma.userStatistics.findUnique({
        where: { userId }
      });

      // Calculate performance metrics
      const totalQuestions = recentSessions.reduce((sum, session) => sum + session.questionsAnswered, 0);
      const correctAnswers = recentSessions.reduce((sum, session) => sum + session.correctAnswers, 0);
      const accuracy = totalQuestions > 0 ? correctAnswers / totalQuestions : 0.5;

      return {
        userId,
        performanceHistory: {
          accuracy,
          averageTime: 45, // seconds
          preferredDifficulty: request.difficulty,
          strongTopics: [],
          weakTopics: []
        },
        preferences: {
          favoriteTopics: [],
          difficultyProgression: true,
          preferredQuestionTypes: [request.questionType],
          avoidRecentQuestions: true,
          personalizedDifficulty: true
        },
        recentActivity: recentSessions.length,
        engagement: userStats?.totalScore || 0
      };
    } catch (error) {
      logger.error('Failed to get user context', { error, userId });
      return {
        userId,
        performanceHistory: {
          accuracy: 0.5,
          averageTime: 45,
          preferredDifficulty: request.difficulty,
          strongTopics: [],
          weakTopics: []
        },
        preferences: {
          favoriteTopics: [],
          difficultyProgression: true,
          preferredQuestionTypes: [request.questionType],
          avoidRecentQuestions: true,
          personalizedDifficulty: true
        },
        recentActivity: 0,
        engagement: 0
      };
    }
  }

  private calculateOptimalRatio(
    requestedRatio: number,
    dbAvailability: DatabaseAvailability,
    aiHealth: AiServiceHealth,
    userContext: UserContext
  ): OptimalRatio {
    let aiRatio = requestedRatio;
    let dbRatio = 1 - requestedRatio;
    let cacheRatio = 0.1; // 10% cache by default

    // Adjust based on database availability
    if (dbAvailability.coverageRatio < 0.5) {
      // Not enough database questions, increase AI ratio
      aiRatio = Math.min(0.8, aiRatio + 0.3);
    } else if (dbAvailability.coverageRatio > 2) {
      // Plenty of database questions, can reduce AI ratio
      aiRatio = Math.max(0.1, aiRatio - 0.2);
    }

    // Adjust based on AI service health
    if (!aiHealth.isAvailable || aiHealth.successRate < 0.7) {
      // AI service struggling, rely more on database
      aiRatio = Math.max(0, aiRatio - 0.4);
      dbRatio = Math.min(1, dbRatio + 0.4);
    }

    // Adjust based on user performance
    if (userContext.performanceHistory.accuracy < 0.5) {
      // User struggling, use more high-quality database questions
      dbRatio = Math.min(0.8, dbRatio + 0.2);
      aiRatio = Math.max(0.1, aiRatio - 0.2);
    }

    // Normalize ratios
    const total = aiRatio + dbRatio + cacheRatio;
    aiRatio = aiRatio / total;
    dbRatio = dbRatio / total;
    cacheRatio = cacheRatio / total;

    return { ai: aiRatio, db: dbRatio, cache: cacheRatio };
  }

  private selectBestStrategy(
    dbAvailability: DatabaseAvailability,
    aiHealth: AiServiceHealth
  ): string {
    if (dbAvailability.coverageRatio > 1.5 && dbAvailability.qualityRating > 0.8) {
      return 'database_primary';
    } else if (aiHealth.isAvailable && aiHealth.successRate > 0.8) {
      return 'ai_primary';
    } else {
      return 'mixed_optimal';
    }
  }

  private async ensureQuestionDiversity(
    questions: Question[],
    request: HybridQuestionRequest
  ): Promise<Question[]> {
    // Simple diversity check - avoid duplicate topics/patterns
    const seen = new Set<string>();
    const diverse: Question[] = [];

    for (const question of questions) {
      // Create a simple fingerprint of the question
      const fingerprint = this.createQuestionFingerprint(question);
      
      if (!seen.has(fingerprint) && diverse.length < request.count) {
        seen.add(fingerprint);
        diverse.push(question);
      }
    }

    // If we don't have enough diverse questions, fill with remaining questions
    for (const question of questions) {
      if (diverse.length >= request.count) break;
      if (!diverse.includes(question)) {
        diverse.push(question);
      }
    }

    return diverse;
  }

  private createQuestionFingerprint(question: Question): string {
    // Create a simple fingerprint based on question text and options
    const words = question.questionText.toLowerCase().split(/\s+/).slice(0, 5);
    return words.join('_');
  }

  private async updatePerformanceMetrics(
    request: HybridQuestionRequest,
    results: HybridResults,
    finalQuestions: Question[]
  ): Promise<void> {
    const key = `${request.topic}_${request.difficulty}_${request.questionType}`;
    const existing = this.performanceMetrics.get(key) || {
      avgResponseTime: 0,
      successRate: 0,
      qualityAverage: 0,
      cacheHitRate: 0
    };

    // Update metrics (simple moving average)
    const alpha = 0.3; // Learning rate
    existing.avgResponseTime = existing.avgResponseTime * (1 - alpha) + (Date.now()) * alpha;
    existing.successRate = existing.successRate * (1 - alpha) + (finalQuestions.length / request.count) * alpha;
    existing.qualityAverage = existing.qualityAverage * (1 - alpha) + 
      (results.qualityScores.reduce((a, b) => a + b, 0) / results.qualityScores.length) * alpha;
    existing.cacheHitRate = existing.cacheHitRate * (1 - alpha) + (results.cacheHits / request.count) * alpha;

    this.performanceMetrics.set(key, existing);
  }
}

// Supporting interfaces
interface MixingStrategy {
  aiQuestionCount: number;
  dbQuestionCount: number;
  cacheQuestionCount: number;
  strategy: string;
  fallbackOrder: string[];
  qualityThreshold: number;
}

interface HybridResults {
  questions: Question[];
  sources: QuestionSource[];
  qualityScores: number[];
  hybridRatio: { ai: number; database: number };
  fallbacksUsed: string[];
  cacheHits: number;
}

interface QuestionWithMetrics {
  question: Question;
  qualityScore: number;
  source: 'ai' | 'database' | 'cache';
  provider?: string;
}

interface CachedQuestion {
  questions: QuestionWithMetrics[];
  cachedAt: Date;
}

interface PerformanceMetric {
  avgResponseTime: number;
  successRate: number;
  qualityAverage: number;
  cacheHitRate: number;
}

// Additional supporting interfaces
interface DatabaseAvailability {
  availableCount: number;
  totalCount: number;
  coverageRatio: number;
  qualityRating: number;
}

interface AiServiceHealth {
  isAvailable: boolean;
  responseTime: number;
  successRate: number;
  costEfficiency: number;
  qualityRating: number;
}

interface UserContext {
  userId: string;
  performanceHistory: {
    accuracy: number;
    averageTime: number;
    preferredDifficulty: number;
    strongTopics: string[];
    weakTopics: string[];
  };
  preferences: UserQuestionPreferences;
  recentActivity: number;
  engagement: number;
}

interface OptimalRatio {
  ai: number;
  db: number;
  cache: number;
}

export default HybridQuestionService;
