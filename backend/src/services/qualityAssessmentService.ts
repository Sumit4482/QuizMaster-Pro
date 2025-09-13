import { EventEmitter } from 'events';
import { Question, QuestionType } from '@prisma/client';
import { GeneratedQuestion } from '../types/ai';
import { logger } from '../config/logger';

export interface QualityAssessmentRequest {
  questionId: string;
  questionData: Question | GeneratedQuestion;
  source: 'ai' | 'database' | 'user';
  context?: {
    topic: string;
    difficulty: number;
    userLevel?: string;
    previousQuestions?: string[];
  };
}

export interface QualityScore {
  overall: number;
  dimensions: {
    accuracy: number;
    clarity: number;
    engagement: number;
    educational_value: number;
    difficulty_appropriateness: number;
    bias_check: number;
    factual_correctness: number;
  };
  confidence: number;
  reasoning: string[];
  improvements: string[];
  flags: QualityFlag[];
}

export interface QualityFlag {
  type: 'warning' | 'error' | 'info';
  category: 'content' | 'structure' | 'bias' | 'accuracy' | 'accessibility';
  message: string;
  severity: number; // 1-10
  suggestions: string[];
}

export interface QualityTrend {
  questionId: string;
  scores: {
    timestamp: Date;
    score: number;
    userRating?: number;
  }[];
  trend: 'improving' | 'declining' | 'stable';
  lastAssessment: Date;
}

/**
 * Phase 3.2: Quality Assessment Service
 * 
 * Advanced quality scoring system for hybrid question generation
 * - Multi-dimensional quality metrics
 * - Real-time assessment during gameplay
 * - User feedback integration
 * - Bias detection and prevention
 * - Educational effectiveness measurement
 */
export class QualityAssessmentService extends EventEmitter {
  private static instance: QualityAssessmentService | null = null;
  private qualityThresholds = {
    minimum: 0.6,
    good: 0.75,
    excellent: 0.9
  };
  
  private qualityWeights = {
    accuracy: 0.25,
    clarity: 0.20,
    engagement: 0.15,
    educational_value: 0.20,
    difficulty_appropriateness: 0.10,
    bias_check: 0.05,
    factual_correctness: 0.05
  };

  private assessmentCache = new Map<string, { score: QualityScore; cachedAt: Date }>();
  private biasPatterns: RegExp[] = [];
  private factCheckKeywords: string[] = [];

  private constructor() {
    super();
    this.initializeQualitySystem();
  }

  public static getInstance(): QualityAssessmentService {
    if (!QualityAssessmentService.instance) {
      QualityAssessmentService.instance = new QualityAssessmentService();
    }
    return QualityAssessmentService.instance;
  }

  /**
   * Assess the quality of a question comprehensively
   */
  public async assessQuestion(request: QualityAssessmentRequest): Promise<QualityScore> {
    try {
      logger.info('🎯 Starting quality assessment', {
        component: 'QualityAssessmentService',
        questionId: request.questionId,
        source: request.source
      });

      // Check cache first
      const cached = this.assessmentCache.get(request.questionId);
      if (cached && !this.isCacheExpired(cached.cachedAt)) {
        logger.info('📦 Using cached quality assessment', { questionId: request.questionId });
        return cached.score;
      }

      // Perform comprehensive assessment
      const score = await this.performQualityAssessment(request);
      
      // Cache the result
      this.assessmentCache.set(request.questionId, {
        score,
        cachedAt: new Date()
      });

      // Emit assessment event for analytics
      this.emit('qualityAssessed', {
        questionId: request.questionId,
        score,
        source: request.source,
        timestamp: new Date()
      });

      logger.info('✅ Quality assessment completed', {
        component: 'QualityAssessmentService',
        questionId: request.questionId,
        overallScore: score.overall,
        confidence: score.confidence
      });

      return score;

    } catch (error) {
      logger.error('❌ Quality assessment failed', {
        component: 'QualityAssessmentService',
        questionId: request.questionId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return a default low-confidence score
      return this.getDefaultQualityScore();
    }
  }

  /**
   * Batch assess multiple questions efficiently
   */
  public async batchAssessQuestions(requests: QualityAssessmentRequest[]): Promise<QualityScore[]> {
    logger.info('📊 Starting batch quality assessment', {
      component: 'QualityAssessmentService',
      count: requests.length
    });

    const results = await Promise.allSettled(
      requests.map(request => this.assessQuestion(request))
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : this.getDefaultQualityScore()
    );
  }

  /**
   * Update quality score based on user feedback
   */
  public async updateWithUserFeedback(
    questionId: string,
    userId: string,
    feedback: {
      rating: number; // 1-5
      comments?: string;
      specific_issues?: string[];
      helpful?: boolean;
    }
  ): Promise<void> {
    try {
      logger.info('👤 Processing user feedback for quality adjustment', {
        component: 'QualityAssessmentService',
        questionId,
        userId,
        rating: feedback.rating
      });

      // Get current assessment
      const current = this.assessmentCache.get(questionId);
      if (!current) {
        logger.warn('No existing quality assessment found for feedback update', { questionId });
        return;
      }

      // Adjust score based on user feedback
      const adjustmentFactor = this.calculateFeedbackAdjustment(feedback);
      const adjustedScore = this.applyFeedbackAdjustment(current.score, adjustmentFactor);

      // Update cache with adjusted score
      this.assessmentCache.set(questionId, {
        score: adjustedScore,
        cachedAt: new Date()
      });

      // Store feedback for future learning
      await this.storeFeedbackForLearning(questionId, userId, feedback);

      this.emit('feedbackProcessed', {
        questionId,
        userId,
        feedback,
        adjustment: adjustmentFactor,
        newScore: adjustedScore.overall
      });

    } catch (error) {
      logger.error('❌ Failed to update quality with user feedback', {
        component: 'QualityAssessmentService',
        questionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get quality trends for questions
   */
  public async getQualityTrends(questionIds: string[]): Promise<QualityTrend[]> {
    const trends: QualityTrend[] = [];

    for (const questionId of questionIds) {
      const cached = this.assessmentCache.get(questionId);
      if (cached) {
        // Mock trend data - in real implementation, this would come from stored history
        trends.push({
          questionId,
          scores: [{
            timestamp: cached.cachedAt,
            score: cached.score.overall
          }],
          trend: 'stable',
          lastAssessment: cached.cachedAt
        });
      }
    }

    return trends;
  }

  /**
   * Validate question meets minimum quality standards
   */
  public async validateMinimumQuality(
    question: Question | GeneratedQuestion,
    threshold: number = this.qualityThresholds.minimum
  ): Promise<{ passes: boolean; score: QualityScore; issues: string[] }> {
    const request: QualityAssessmentRequest = {
      questionId: 'question' in question ? question.id : `temp_${Date.now()}`,
      questionData: question,
      source: 'question' in question ? 'database' : 'ai'
    };

    const score = await this.assessQuestion(request);
    const passes = score.overall >= threshold;
    const issues: string[] = [];

    // Collect critical issues
    score.flags.forEach(flag => {
      if (flag.type === 'error' || flag.severity > 7) {
        issues.push(flag.message);
      }
    });

    if (!passes) {
      issues.push(`Overall quality score ${score.overall.toFixed(2)} below threshold ${threshold}`);
    }

    return { passes, score, issues };
  }

  /**
   * Core quality assessment logic
   */
  private async performQualityAssessment(request: QualityAssessmentRequest): Promise<QualityScore> {
    const questionData = request.questionData;
    const questionText = questionData.questionText;

    // Multi-dimensional assessment
    const dimensions = {
      accuracy: await this.assessAccuracy(questionData),
      clarity: this.assessClarity(questionText),
      engagement: this.assessEngagement(questionData),
      educational_value: this.assessEducationalValue(questionData),
      difficulty_appropriateness: this.assessDifficultyAlignment(questionData, request.context?.difficulty),
      bias_check: this.assessBias(questionText),
      factual_correctness: await this.assessFactualCorrectness(questionText)
    };

    // Calculate weighted overall score
    const overall = Object.entries(dimensions).reduce((sum, [key, value]) => {
      const weight = this.qualityWeights[key as keyof typeof this.qualityWeights];
      return sum + (value * weight);
    }, 0);

    // Assess confidence based on various factors
    const confidence = this.calculateConfidence(dimensions, request);

    // Generate reasoning and improvement suggestions
    const reasoning = this.generateReasoning(dimensions, overall);
    const improvements = this.generateImprovements(dimensions);
    const flags = this.generateQualityFlags(dimensions, questionData);

    return {
      overall: Math.min(1.0, Math.max(0.0, overall)),
      dimensions,
      confidence,
      reasoning,
      improvements,
      flags
    };
  }

  /**
   * Assess factual accuracy
   */
  private async assessAccuracy(questionData: Question | GeneratedQuestion): Promise<number> {
    // Basic accuracy assessment
    let score = 0.8; // Default score

    // Check for well-formed options
    if (questionData.options && Array.isArray(questionData.options)) {
      const options = questionData.options;
      if (options.length >= 3 && options.length <= 6) {
        score += 0.1;
      }
      
      // Check if correct answer exists in options
      if (typeof questionData.correctAnswer === 'string' && options.includes(questionData.correctAnswer)) {
        score += 0.1;
      } else {
        score -= 0.3; // Major penalty for incorrect setup
      }
    }

    // Check for explanation quality
    if (questionData.explanation && questionData.explanation.length > 20) {
      score += 0.05;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Assess text clarity
   */
  private assessClarity(text: string): number {
    let score = 0.7; // Base score

    // Text length assessment
    if (text.length > 10 && text.length < 500) score += 0.1;
    if (text.length < 10 || text.length > 800) score -= 0.2;

    // Sentence structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const avgWordsPerSentence = text.split(/\s+/).length / sentences.length;
    
    if (avgWordsPerSentence >= 8 && avgWordsPerSentence <= 25) {
      score += 0.15;
    } else if (avgWordsPerSentence > 35) {
      score -= 0.1;
    }

    // Check for clear question structure
    if (text.includes('?') || text.toLowerCase().includes('which') || 
        text.toLowerCase().includes('what') || text.toLowerCase().includes('how')) {
      score += 0.1;
    }

    // Penalize excessive jargon or unclear language
    const jargonWords = text.match(/\b[A-Z]{2,}\b/g) || [];
    if (jargonWords.length > 3) score -= 0.05;

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Assess engagement potential
   */
  private assessEngagement(questionData: Question | GeneratedQuestion): number {
    let score = 0.6; // Base score

    const text = questionData.questionText.toLowerCase();

    // Check for engaging question types
    if (text.includes('scenario') || text.includes('imagine') || text.includes('consider')) {
      score += 0.1;
    }

    // Variety in options (if multiple choice)
    if (questionData.options && Array.isArray(questionData.options)) {
      const options = questionData.options;
      const lengths = options.map(opt => opt.length);
      const variance = this.calculateVariance(lengths);
      if (variance > 10 && variance < 100) score += 0.1; // Good variety in option lengths
    }

    // Real-world relevance indicators
    if (text.includes('real') || text.includes('practical') || text.includes('example')) {
      score += 0.1;
    }

    // Interactive elements
    if (text.includes('compare') || text.includes('analyze') || text.includes('evaluate')) {
      score += 0.15;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Assess educational value
   */
  private assessEducationalValue(questionData: Question | GeneratedQuestion): number {
    let score = 0.7; // Base score

    // Check for explanation
    if (questionData.explanation && questionData.explanation.length > 50) {
      score += 0.15;
    }

    // Learning objective alignment
    const text = questionData.questionText.toLowerCase();
    const learningKeywords = ['understand', 'identify', 'explain', 'compare', 'analyze', 'evaluate', 'create'];
    const keywordCount = learningKeywords.filter(keyword => text.includes(keyword)).length;
    score += keywordCount * 0.02;

    // Depth of thinking required
    if (text.includes('why') || text.includes('how') || text.includes('what if')) {
      score += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Assess difficulty appropriateness
   */
  private assessDifficultyAlignment(
    questionData: Question | GeneratedQuestion,
    expectedDifficulty?: number
  ): number {
    if (!expectedDifficulty) return 0.8; // Default if no expected difficulty

    const questionDifficulty = 'difficultyLevel' in questionData ? 
      questionData.difficultyLevel : 
      ('difficulty' in questionData ? questionData.difficulty : 3);

    const difference = Math.abs(questionDifficulty - expectedDifficulty);
    
    // Perfect alignment = 1.0, each level of difference reduces score
    return Math.max(0.3, 1.0 - (difference * 0.2));
  }

  /**
   * Assess potential bias
   */
  private assessBias(text: string): number {
    let score = 0.9; // Start with high score, reduce for bias

    const lowerText = text.toLowerCase();

    // Check for obvious bias patterns
    const biasIndicators = [
      'obviously', 'clearly', 'everyone knows', 'it is known that',
      'always', 'never', 'all people', 'no one'
    ];

    biasIndicators.forEach(indicator => {
      if (lowerText.includes(indicator)) score -= 0.1;
    });

    // Gender bias check
    const genderBias = ['he ', 'she ', 'his ', 'her ', 'him ', 'herself', 'himself'];
    const genderCount = genderBias.filter(term => lowerText.includes(term)).length;
    if (genderCount > 2) score -= 0.05;

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Assess factual correctness
   */
  private async assessFactualCorrectness(text: string): Promise<number> {
    // Basic factual correctness assessment
    // In a full implementation, this would integrate with fact-checking APIs
    
    let score = 0.85; // Default confidence

    // Check for specific facts that can be verified
    if (text.match(/\d{4}/) && text.toLowerCase().includes('year')) {
      // Contains year - could be historically verifiable
      score = 0.8;
    }

    if (text.toLowerCase().includes('according to') || text.toLowerCase().includes('studies show')) {
      // Claims to have sources - would need verification
      score = 0.7;
    }

    return score;
  }

  /**
   * Calculate assessment confidence
   */
  private calculateConfidence(
    dimensions: any,
    request: QualityAssessmentRequest
  ): number {
    let confidence = 0.8; // Base confidence

    // Reduce confidence for AI-generated questions
    if (request.source === 'ai') confidence -= 0.1;

    // Increase confidence if we have context
    if (request.context) confidence += 0.1;

    // Adjust based on dimension consistency
    const scores = Object.values(dimensions) as number[];
    const variance = this.calculateVariance(scores);
    
    if (variance < 0.01) confidence += 0.05; // Consistent scores increase confidence
    if (variance > 0.1) confidence -= 0.1; // Inconsistent scores decrease confidence

    return Math.min(1.0, Math.max(0.3, confidence));
  }

  /**
   * Generate quality reasoning
   */
  private generateReasoning(dimensions: any, overall: number): string[] {
    const reasoning: string[] = [];
    
    if (overall >= this.qualityThresholds.excellent) {
      reasoning.push('Question meets excellent quality standards');
    } else if (overall >= this.qualityThresholds.good) {
      reasoning.push('Question meets good quality standards');
    } else if (overall >= this.qualityThresholds.minimum) {
      reasoning.push('Question meets minimum quality standards');
    } else {
      reasoning.push('Question below minimum quality standards');
    }

    // Add dimension-specific reasoning
    if (dimensions.clarity > 0.9) reasoning.push('Exceptionally clear and well-written');
    if (dimensions.engagement > 0.8) reasoning.push('Highly engaging content');
    if (dimensions.educational_value > 0.85) reasoning.push('Strong educational value');

    return reasoning;
  }

  /**
   * Generate improvement suggestions
   */
  private generateImprovements(dimensions: any): string[] {
    const improvements: string[] = [];

    if (dimensions.clarity < 0.7) {
      improvements.push('Improve question clarity and readability');
    }
    if (dimensions.engagement < 0.6) {
      improvements.push('Add more engaging elements or real-world context');
    }
    if (dimensions.educational_value < 0.7) {
      improvements.push('Strengthen educational objectives and learning outcomes');
    }
    if (dimensions.bias_check < 0.8) {
      improvements.push('Review content for potential bias and inclusive language');
    }

    return improvements;
  }

  /**
   * Generate quality flags
   */
  private generateQualityFlags(dimensions: any, questionData: Question | GeneratedQuestion): QualityFlag[] {
    const flags: QualityFlag[] = [];

    if (dimensions.accuracy < 0.6) {
      flags.push({
        type: 'error',
        category: 'accuracy',
        message: 'Question accuracy concerns detected',
        severity: 8,
        suggestions: ['Verify factual content', 'Check answer options']
      });
    }

    if (dimensions.bias_check < 0.7) {
      flags.push({
        type: 'warning',
        category: 'bias',
        message: 'Potential bias detected in question content',
        severity: 6,
        suggestions: ['Review language for inclusivity', 'Consider diverse perspectives']
      });
    }

    return flags;
  }

  /**
   * Helper methods
   */
  private initializeQualitySystem(): void {
    logger.info('🎯 Initializing quality assessment system');
    
    // Initialize bias patterns and fact-check keywords
    this.biasPatterns = [
      /\bonly\b.*\b(men|women|boys|girls)\b/i,
      /\ball\b.*\b(people|students|workers)\b.*\bare\b/i
    ];
    
    this.factCheckKeywords = [
      'according to', 'studies show', 'research indicates', 'statistics reveal'
    ];
  }

  private isCacheExpired(cachedAt: Date): boolean {
    const TTL = 1000 * 60 * 60 * 24; // 24 hours
    return Date.now() - cachedAt.getTime() > TTL;
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squareDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }

  private getDefaultQualityScore(): QualityScore {
    return {
      overall: 0.5,
      dimensions: {
        accuracy: 0.5,
        clarity: 0.5,
        engagement: 0.5,
        educational_value: 0.5,
        difficulty_appropriateness: 0.5,
        bias_check: 0.8,
        factual_correctness: 0.5
      },
      confidence: 0.3,
      reasoning: ['Quality assessment failed - using default score'],
      improvements: ['Review question content manually'],
      flags: [{
        type: 'warning',
        category: 'content',
        message: 'Quality assessment failed',
        severity: 5,
        suggestions: ['Manual review required']
      }]
    };
  }

  private calculateFeedbackAdjustment(feedback: any): number {
    // Simple feedback adjustment calculation
    const ratingAdjustment = (feedback.rating - 3) * 0.1; // Center around 3
    return Math.max(-0.2, Math.min(0.2, ratingAdjustment));
  }

  private applyFeedbackAdjustment(score: QualityScore, adjustment: number): QualityScore {
    return {
      ...score,
      overall: Math.max(0, Math.min(1, score.overall + adjustment))
    };
  }

  private async storeFeedbackForLearning(questionId: string, userId: string, feedback: any): Promise<void> {
    // Store feedback for machine learning improvements
    // This would integrate with a learning database
    logger.info('📚 Storing feedback for learning', { questionId, userId });
  }
}

export default QualityAssessmentService;

