import { EventEmitter } from 'events';
import { logger } from '../config/logger';

export interface ModerationRequest {
  content: string;
  contentType: 'question' | 'answer' | 'explanation' | 'user_input' | 'chat_message';
  context?: {
    topic?: string;
    difficulty?: number;
    targetAge?: string;
    educational?: boolean;
    userId?: string;
  };
  urgency?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ModerationResult {
  approved: boolean;
  confidence: number;
  flags: ModerationFlag[];
  categories: ModerationCategory[];
  suggestions: string[];
  processedAt: Date;
  processingTime: number;
  moderatorId?: string;
}

export interface ModerationFlag {
  type: 'content' | 'safety' | 'quality' | 'educational' | 'bias' | 'legal';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  confidence: number;
  position?: {
    start: number;
    end: number;
    text: string;
  };
  suggestion?: string;
}

export interface ModerationCategory {
  name: string;
  score: number;
  threshold: number;
  passed: boolean;
}

export interface BiasDetection {
  type: 'gender' | 'racial' | 'cultural' | 'religious' | 'socioeconomic' | 'age' | 'disability';
  detected: boolean;
  confidence: number;
  examples: string[];
  suggestions: string[];
}

export interface ContentAnalysis {
  readabilityScore: number;
  sentimentScore: number;
  toxicityScore: number;
  professionalismScore: number;
  educationalValue: number;
  complexity: number;
  keyTerms: string[];
  topics: string[];
}

export interface HumanReviewRequest {
  contentId: string;
  content: string;
  moderationResult: ModerationResult;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requestedBy: string;
  reason: string;
  context?: any;
}

/**
 * Phase 3.3: Content Moderation Service
 * 
 * Advanced content moderation with:
 * - Multi-layer content filtering
 * - Bias detection and mitigation
 * - Context-aware moderation
 * - Human review integration
 * - Educational content optimization
 */
export class ContentModerationService extends EventEmitter {
  private static instance: ContentModerationService | null = null;
  
  // Moderation thresholds
  private moderationThresholds = {
    toxicity: 0.7,
    bias: 0.6,
    professionalism: 0.4,
    educational: 0.5,
    safety: 0.8,
    quality: 0.6
  };

  // Content filters and patterns
  private inappropriatePatterns: RegExp[] = [];
  private biasPatterns: Map<string, RegExp[]> = new Map();
  private educationalKeywords: string[] = [];
  private professionalTerms: string[] = [];
  
  // Human review queue
  private humanReviewQueue: HumanReviewRequest[] = [];
  
  // Performance metrics
  private moderationStats = {
    totalRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    humanReviewRequests: 0,
    averageProcessingTime: 0,
    falsePositives: 0,
    falseNegatives: 0
  };

  private constructor() {
    super();
    this.initializeModerationSystem();
  }

  public static getInstance(): ContentModerationService {
    if (!ContentModerationService.instance) {
      ContentModerationService.instance = new ContentModerationService();
    }
    return ContentModerationService.instance;
  }

  /**
   * Moderate content with comprehensive analysis
   */
  public async moderateContent(request: ModerationRequest): Promise<ModerationResult> {
    const startTime = Date.now();
    
    try {
      logger.info('🛡️ Starting content moderation', {
        component: 'ContentModerationService',
        contentType: request.contentType,
        contentLength: request.content.length,
        urgency: request.urgency || 'medium'
      });

      this.moderationStats.totalRequests++;

      // Multi-layer analysis
      const results = await Promise.all([
        this.performBasicContentAnalysis(request.content),
        this.detectInappropriateContent(request.content, request.context),
        this.detectBias(request.content),
        this.analyzeEducationalValue(request.content, request.context),
        this.checkContentSafety(request.content, request.context),
        this.assessContentQuality(request.content, request.context)
      ]);

      const [
        contentAnalysis,
        inappropriateFlags,
        biasDetection,
        educationalFlags,
        safetyFlags,
        qualityFlags
      ] = results;

      // Combine all flags
      const allFlags: ModerationFlag[] = [
        ...inappropriateFlags,
        ...this.createBiasFlags(biasDetection),
        ...educationalFlags,
        ...safetyFlags,
        ...qualityFlags
      ];

      // Generate moderation categories
      const categories = this.generateModerationCategories(contentAnalysis, allFlags);

      // Determine approval based on flags and thresholds
      const approved = this.determineApproval(allFlags, categories);

      // Generate improvement suggestions
      const suggestions = this.generateSuggestions(allFlags, contentAnalysis);

      const processingTime = Date.now() - startTime;

      const result: ModerationResult = {
        approved,
        confidence: this.calculateConfidence(allFlags, contentAnalysis),
        flags: allFlags,
        categories,
        suggestions,
        processedAt: new Date(),
        processingTime
      };

      // Update statistics
      if (approved) {
        this.moderationStats.approvedRequests++;
      } else {
        this.moderationStats.rejectedRequests++;
      }

      this.moderationStats.averageProcessingTime = 
        (this.moderationStats.averageProcessingTime * 0.9) + (processingTime * 0.1);

      // Check if human review is needed
      if (this.requiresHumanReview(result, request)) {
        await this.queueForHumanReview(request, result);
      }

      // Emit moderation event
      this.emit('contentModerated', {
        request,
        result,
        requiresReview: this.requiresHumanReview(result, request)
      });

      logger.info('✅ Content moderation completed', {
        component: 'ContentModerationService',
        approved,
        flags: allFlags.length,
        processingTime
      });

      return result;

    } catch (error) {
      logger.error('❌ Content moderation failed', {
        component: 'ContentModerationService',
        error: error instanceof Error ? error.message : String(error),
        contentType: request.contentType
      });

      // Return safe default - reject content on error
      return {
        approved: false,
        confidence: 0.1,
        flags: [{
          type: 'content',
          severity: 'error',
          message: 'Moderation system error - content rejected for safety',
          confidence: 1.0,
          suggestion: 'Please try again or contact support'
        }],
        categories: [],
        suggestions: ['Review content manually', 'Contact support if needed'],
        processedAt: new Date(),
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Batch moderate multiple content items
   */
  public async batchModerateContent(requests: ModerationRequest[]): Promise<ModerationResult[]> {
    logger.info('📊 Starting batch content moderation', {
      component: 'ContentModerationService',
      batchSize: requests.length
    });

    const results = await Promise.allSettled(
      requests.map(request => this.moderateContent(request))
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : {
        approved: false,
        confidence: 0,
        flags: [{ type: 'content', severity: 'error', message: 'Batch processing failed', confidence: 1.0 }],
        categories: [],
        suggestions: ['Manual review required'],
        processedAt: new Date(),
        processingTime: 0
      } as ModerationResult
    );
  }

  /**
   * Get human review queue
   */
  public getHumanReviewQueue(priority?: string): HumanReviewRequest[] {
    if (priority) {
      return this.humanReviewQueue.filter(req => req.priority === priority);
    }
    return [...this.humanReviewQueue];
  }

  /**
   * Process human review decision
   */
  public async processHumanReview(
    reviewId: string,
    decision: 'approve' | 'reject' | 'modify',
    moderatorId: string,
    feedback?: string,
    modifiedContent?: string
  ): Promise<void> {
    const reviewIndex = this.humanReviewQueue.findIndex(req => req.contentId === reviewId);
    
    if (reviewIndex === -1) {
      throw new Error('Review request not found');
    }

    const review = this.humanReviewQueue[reviewIndex];
    
    logger.info('👤 Processing human review decision', {
      component: 'ContentModerationService',
      reviewId,
      decision,
      moderatorId
    });

    // Update moderation statistics based on human feedback
    this.updateStatsFromHumanReview(review, decision);

    // Remove from queue
    this.humanReviewQueue.splice(reviewIndex, 1);

    // Emit human review event
    this.emit('humanReviewCompleted', {
      reviewId,
      decision,
      moderatorId,
      feedback,
      modifiedContent,
      originalRequest: review
    });
  }

  /**
   * Get moderation statistics
   */
  public getModerationStatistics(): any {
    return {
      ...this.moderationStats,
      humanReviewQueueSize: this.humanReviewQueue.length,
      thresholds: this.moderationThresholds,
      accuracy: {
        approvalRate: this.moderationStats.approvedRequests / Math.max(1, this.moderationStats.totalRequests),
        falsePositiveRate: this.moderationStats.falsePositives / Math.max(1, this.moderationStats.totalRequests),
        falseNegativeRate: this.moderationStats.falseNegatives / Math.max(1, this.moderationStats.totalRequests)
      }
    };
  }

  /**
   * Update moderation thresholds
   */
  public updateModerationThresholds(thresholds: Partial<typeof this.moderationThresholds>): void {
    logger.info('⚙️ Updating moderation thresholds', {
      component: 'ContentModerationService',
      oldThresholds: this.moderationThresholds,
      newThresholds: thresholds
    });

    this.moderationThresholds = { ...this.moderationThresholds, ...thresholds };

    this.emit('thresholdsUpdated', {
      thresholds: this.moderationThresholds,
      updatedAt: new Date()
    });
  }

  /**
   * Initialize moderation system
   */
  private initializeModerationSystem(): void {
    logger.info('🛡️ Initializing content moderation system');

    // Initialize inappropriate content patterns
    this.inappropriatePatterns = [
      /\b(spam|scam|fraud)\b/gi,
      /\b(violence|weapon|drug)\b/gi,
      /\b(harassment|bullying|hate)\b/gi,
      // Add more patterns as needed
    ];

    // Initialize bias detection patterns
    this.biasPatterns.set('gender', [
      /\b(all men|all women|only men|only women)\b/gi,
      /\b(men are|women are)\s+(better|worse|superior|inferior)/gi
    ]);

    this.biasPatterns.set('racial', [
      /\b(all \w+ people|only \w+ people)\b/gi
    ]);

    // Educational keywords
    this.educationalKeywords = [
      'learn', 'understand', 'knowledge', 'skill', 'concept', 'theory',
      'practice', 'example', 'explanation', 'analysis', 'critical thinking'
    ];

    // Professional terms
    this.professionalTerms = [
      'research', 'study', 'analysis', 'methodology', 'findings',
      'evidence', 'conclusion', 'hypothesis', 'experiment'
    ];
  }

  /**
   * Perform basic content analysis
   */
  private async performBasicContentAnalysis(content: string): Promise<ContentAnalysis> {
    const words = content.toLowerCase().split(/\s+/);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    
    // Calculate readability (simplified Flesch reading ease)
    const avgWordsPerSentence = words.length / Math.max(1, sentences.length);
    const readabilityScore = Math.max(0, Math.min(1, (206.835 - (1.015 * avgWordsPerSentence)) / 100));

    // Calculate sentiment (simplified)
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'positive', 'helpful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'negative', 'wrong', 'fail'];
    
    const positiveCount = words.filter(word => positiveWords.includes(word)).length;
    const negativeCount = words.filter(word => negativeWords.includes(word)).length;
    const sentimentScore = (positiveCount - negativeCount) / Math.max(1, words.length) + 0.5;

    // Calculate educational value
    const educationalCount = words.filter(word => 
      this.educationalKeywords.some(keyword => word.includes(keyword))
    ).length;
    const educationalValue = Math.min(1, educationalCount / Math.max(1, words.length) * 10);

    // Calculate professionalism
    const professionalCount = words.filter(word =>
      this.professionalTerms.some(term => word.includes(term))
    ).length;
    const professionalismScore = Math.min(1, professionalCount / Math.max(1, words.length) * 10);

    return {
      readabilityScore,
      sentimentScore: Math.max(0, Math.min(1, sentimentScore)),
      toxicityScore: 0.1, // Mock - would use actual toxicity detection
      professionalismScore,
      educationalValue,
      complexity: Math.min(1, avgWordsPerSentence / 20),
      keyTerms: this.extractKeyTerms(content),
      topics: this.extractTopics(content)
    };
  }

  /**
   * Detect inappropriate content
   */
  private async detectInappropriateContent(
    content: string,
    context?: any
  ): Promise<ModerationFlag[]> {
    const flags: ModerationFlag[] = [];

    for (const pattern of this.inappropriatePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        flags.push({
          type: 'content',
          severity: 'warning',
          message: `Potentially inappropriate content detected: ${matches[0]}`,
          confidence: 0.8,
          suggestion: 'Review and consider rephrasing'
        });
      }
    }

    // Check for excessive capitalization
    if (content.match(/[A-Z]{10,}/)) {
      flags.push({
        type: 'quality',
        severity: 'info',
        message: 'Excessive capitalization detected',
        confidence: 0.9,
        suggestion: 'Use normal capitalization for better readability'
      });
    }

    // Check for appropriate educational context
    if (context?.educational && flags.length === 0) {
      // Content is clean for educational use
    }

    return flags;
  }

  /**
   * Detect bias in content
   */
  private async detectBias(content: string): Promise<BiasDetection[]> {
    const detections: BiasDetection[] = [];

    for (const [biasType, patterns] of this.biasPatterns.entries()) {
      const examples: string[] = [];
      let detected = false;

      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          detected = true;
          examples.push(...matches);
        }
      }

      detections.push({
        type: biasType as any,
        detected,
        confidence: detected ? 0.7 : 0.1,
        examples,
        suggestions: detected ? [
          'Consider using more inclusive language',
          'Avoid generalizations about groups',
          'Use specific examples rather than broad statements'
        ] : []
      });
    }

    return detections;
  }

  /**
   * Create bias flags from detection results
   */
  private createBiasFlags(biasDetections: BiasDetection[]): ModerationFlag[] {
    const flags: ModerationFlag[] = [];

    for (const detection of biasDetections) {
      if (detection.detected) {
        flags.push({
          type: 'bias',
          severity: detection.confidence > 0.8 ? 'error' : 'warning',
          message: `Potential ${detection.type} bias detected`,
          confidence: detection.confidence,
          suggestion: detection.suggestions[0] || 'Review for bias'
        });
      }
    }

    return flags;
  }

  /**
   * Analyze educational value
   */
  private async analyzeEducationalValue(
    content: string,
    context?: any
  ): Promise<ModerationFlag[]> {
    const flags: ModerationFlag[] = [];
    const words = content.toLowerCase().split(/\s+/);

    // Check for educational keywords
    const educationalKeywordCount = words.filter(word =>
      this.educationalKeywords.some(keyword => word.includes(keyword))
    ).length;

    const educationalRatio = educationalKeywordCount / words.length;

    if (context?.educational && educationalRatio < 0.05) {
      flags.push({
        type: 'educational',
        severity: 'info',
        message: 'Low educational content detected',
        confidence: 0.6,
        suggestion: 'Consider adding more educational value or learning objectives'
      });
    }

    // Check for appropriate complexity for target age
    if (context?.targetAge && context.targetAge === 'children') {
      const complexWords = words.filter(word => word.length > 10).length;
      const complexityRatio = complexWords / words.length;

      if (complexityRatio > 0.1) {
        flags.push({
          type: 'educational',
          severity: 'warning',
          message: 'Content may be too complex for target age group',
          confidence: 0.7,
          suggestion: 'Simplify language for better comprehension'
        });
      }
    }

    return flags;
  }

  /**
   * Check content safety
   */
  private async checkContentSafety(content: string, context?: any): Promise<ModerationFlag[]> {
    const flags: ModerationFlag[] = [];

    // Check for safety issues
    const safetyKeywords = ['danger', 'risk', 'harm', 'unsafe', 'warning'];
    const words = content.toLowerCase().split(/\s+/);
    
    const safetyMentions = words.filter(word =>
      safetyKeywords.some(keyword => word.includes(keyword))
    ).length;

    if (safetyMentions > 2) {
      flags.push({
        type: 'safety',
        severity: 'warning',
        message: 'Content contains multiple safety-related terms',
        confidence: 0.6,
        suggestion: 'Review safety implications and add appropriate warnings if needed'
      });
    }

    return flags;
  }

  /**
   * Assess content quality
   */
  private async assessContentQuality(content: string, context?: any): Promise<ModerationFlag[]> {
    const flags: ModerationFlag[] = [];

    // Check minimum length
    if (content.trim().length < 10) {
      flags.push({
        type: 'quality',
        severity: 'error',
        message: 'Content is too short',
        confidence: 1.0,
        suggestion: 'Provide more detailed content'
      });
    }

    // Check for repetitive content
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = 1 - (uniqueWords.size / words.length);

    if (repetitionRatio > 0.3) {
      flags.push({
        type: 'quality',
        severity: 'warning',
        message: 'Content appears repetitive',
        confidence: 0.8,
        suggestion: 'Vary word choice and sentence structure'
      });
    }

    return flags;
  }

  /**
   * Generate moderation categories
   */
  private generateModerationCategories(
    analysis: ContentAnalysis,
    flags: ModerationFlag[]
  ): ModerationCategory[] {
    const categories: ModerationCategory[] = [
      {
        name: 'Toxicity',
        score: analysis.toxicityScore,
        threshold: this.moderationThresholds.toxicity,
        passed: analysis.toxicityScore < this.moderationThresholds.toxicity
      },
      {
        name: 'Professionalism',
        score: analysis.professionalismScore,
        threshold: this.moderationThresholds.professionalism,
        passed: analysis.professionalismScore >= this.moderationThresholds.professionalism
      },
      {
        name: 'Educational Value',
        score: analysis.educationalValue,
        threshold: this.moderationThresholds.educational,
        passed: analysis.educationalValue >= this.moderationThresholds.educational
      },
      {
        name: 'Safety',
        score: 1 - (flags.filter(f => f.type === 'safety').length * 0.2),
        threshold: this.moderationThresholds.safety,
        passed: flags.filter(f => f.type === 'safety' && f.severity === 'error').length === 0
      }
    ];

    return categories;
  }

  /**
   * Determine if content should be approved
   */
  private determineApproval(flags: ModerationFlag[], categories: ModerationCategory[]): boolean {
    // Reject if any critical errors
    if (flags.some(flag => flag.severity === 'critical')) {
      return false;
    }

    // Reject if too many errors
    const errorCount = flags.filter(flag => flag.severity === 'error').length;
    if (errorCount > 2) {
      return false;
    }

    // Check if categories pass thresholds
    const failedCategories = categories.filter(cat => !cat.passed).length;
    if (failedCategories > 1) {
      return false;
    }

    return true;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(flags: ModerationFlag[], analysis: ContentAnalysis): number {
    let confidence = 0.8; // Base confidence

    // Reduce confidence for errors and warnings
    const errorPenalty = flags.filter(f => f.severity === 'error').length * 0.1;
    const warningPenalty = flags.filter(f => f.severity === 'warning').length * 0.05;
    
    confidence -= errorPenalty + warningPenalty;

    // Adjust based on content analysis
    if (analysis.readabilityScore > 0.7) confidence += 0.1;
    if (analysis.toxicityScore < 0.2) confidence += 0.1;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(flags: ModerationFlag[], analysis: ContentAnalysis): string[] {
    const suggestions = new Set<string>();

    // Add flag-specific suggestions
    flags.forEach(flag => {
      if (flag.suggestion) {
        suggestions.add(flag.suggestion);
      }
    });

    // Add analysis-based suggestions
    if (analysis.readabilityScore < 0.5) {
      suggestions.add('Improve readability by simplifying sentence structure');
    }
    
    if (analysis.educationalValue < 0.3) {
      suggestions.add('Add more educational context or learning objectives');
    }

    if (analysis.professionalismScore < 0.4) {
      suggestions.add('Use more professional language and terminology');
    }

    return Array.from(suggestions);
  }

  /**
   * Check if human review is required
   */
  private requiresHumanReview(result: ModerationResult, request: ModerationRequest): boolean {
    // Require review for critical flags
    if (result.flags.some(flag => flag.severity === 'critical')) {
      return true;
    }

    // Require review for low confidence
    if (result.confidence < 0.6) {
      return true;
    }

    // Require review for bias detection
    if (result.flags.some(flag => flag.type === 'bias')) {
      return true;
    }

    // Require review for high urgency content that was rejected
    if (request.urgency === 'critical' && !result.approved) {
      return true;
    }

    return false;
  }

  /**
   * Queue content for human review
   */
  private async queueForHumanReview(
    request: ModerationRequest,
    result: ModerationResult
  ): Promise<void> {
    const reviewRequest: HumanReviewRequest = {
      contentId: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: request.content,
      moderationResult: result,
      priority: this.determinePriority(result, request),
      requestedBy: request.context?.userId || 'system',
      reason: this.generateReviewReason(result),
      context: request.context
    };

    this.humanReviewQueue.push(reviewRequest);
    this.moderationStats.humanReviewRequests++;

    // Sort queue by priority
    this.humanReviewQueue.sort((a, b) => {
      const priorities = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });

    logger.info('📋 Content queued for human review', {
      component: 'ContentModerationService',
      reviewId: reviewRequest.contentId,
      priority: reviewRequest.priority,
      queueSize: this.humanReviewQueue.length
    });

    this.emit('humanReviewQueued', reviewRequest);
  }

  /**
   * Determine review priority
   */
  private determinePriority(result: ModerationResult, request: ModerationRequest): 'low' | 'medium' | 'high' | 'urgent' {
    if (result.flags.some(flag => flag.severity === 'critical')) return 'urgent';
    if (request.urgency === 'critical') return 'urgent';
    if (result.flags.some(flag => flag.type === 'bias')) return 'high';
    if (result.confidence < 0.4) return 'high';
    if (result.flags.some(flag => flag.severity === 'error')) return 'medium';
    return 'low';
  }

  /**
   * Generate review reason
   */
  private generateReviewReason(result: ModerationResult): string {
    if (result.flags.some(flag => flag.severity === 'critical')) {
      return 'Critical content safety issue detected';
    }
    if (result.flags.some(flag => flag.type === 'bias')) {
      return 'Potential bias detected requiring human assessment';
    }
    if (result.confidence < 0.6) {
      return 'Low confidence in automated moderation result';
    }
    return 'Standard review for quality assurance';
  }

  /**
   * Extract key terms from content
   */
  private extractKeyTerms(content: string): string[] {
    // Simple key term extraction - in real implementation would use NLP
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Get most frequent words (mock implementation)
    const wordFreq: { [word: string]: number } = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Extract topics from content
   */
  private extractTopics(content: string): string[] {
    // Simple topic extraction - would use more sophisticated methods in reality
    const topicKeywords: { [topic: string]: string[] } = {
      'Science': ['science', 'research', 'experiment', 'hypothesis', 'theory'],
      'Mathematics': ['math', 'equation', 'formula', 'calculate', 'number'],
      'Technology': ['technology', 'computer', 'software', 'digital', 'internet'],
      'History': ['history', 'historical', 'past', 'ancient', 'civilization'],
      'Language': ['language', 'grammar', 'vocabulary', 'writing', 'literature']
    };

    const content_lower = content.toLowerCase();
    const detectedTopics: string[] = [];

    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => content_lower.includes(keyword))) {
        detectedTopics.push(topic);
      }
    });

    return detectedTopics;
  }

  /**
   * Update statistics based on human review feedback
   */
  private updateStatsFromHumanReview(
    review: HumanReviewRequest,
    decision: 'approve' | 'reject' | 'modify'
  ): void {
    const wasApproved = review.moderationResult.approved;

    if (wasApproved && decision === 'reject') {
      this.moderationStats.falsePositives++;
    } else if (!wasApproved && decision === 'approve') {
      this.moderationStats.falseNegatives++;
    }
  }
}

export default ContentModerationService;

