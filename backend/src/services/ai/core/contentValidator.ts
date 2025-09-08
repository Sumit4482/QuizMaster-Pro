/**
 * AI Content Validator
 * Validates AI-generated content for quality, appropriateness, and format compliance
 */

import { logger } from '@/config/logger';
import {
  ValidationResult,
  ValidationIssue,
  ValidationIssueType,
  ValidationSeverity,
  AiRequestType,
  GeneratedQuestion
} from '@/types/ai';
import { QuestionType } from '@prisma/client';

export interface ContentValidatorConfig {
  minQualityScore: number;
  enableFactChecking: boolean;
  enableProfanityFilter: boolean;
  enableDuplicateDetection: boolean;
  maxContentLength: number;
  minContentLength: number;
  profanityWords: string[];
  factCheckingEndpoint?: string;
}

export interface ValidationContext {
  requestType: AiRequestType;
  expectedFormat?: any;
  existingContent?: string[];
  topic?: string;
  difficulty?: number;
}

/**
 * Comprehensive Content Validation System
 * Validates AI responses for quality, safety, and compliance
 */
export class ContentValidator {
  private config: ContentValidatorConfig;
  
  // Cached patterns and rules
  private profanityRegex!: RegExp;
  private questionPatterns: Map<QuestionType, RegExp> = new Map();
  private duplicateThreshold = 0.8; // Similarity threshold for duplicate detection
  
  // Quality scoring weights
  private qualityWeights = {
    format: 0.3,
    content: 0.3,
    grammar: 0.2,
    relevance: 0.2
  };

  constructor(config: Partial<ContentValidatorConfig> = {}) {
    this.config = {
      minQualityScore: config.minQualityScore || 0.7,
      enableFactChecking: config.enableFactChecking || false,
      enableProfanityFilter: config.enableProfanityFilter || true,
      enableDuplicateDetection: config.enableDuplicateDetection || true,
      maxContentLength: config.maxContentLength || 5000,
      minContentLength: config.minContentLength || 10,
      profanityWords: config.profanityWords || this.getDefaultProfanityWords(),
      factCheckingEndpoint: config.factCheckingEndpoint,
      ...config
    };

    this.initializeValidation();

    logger.info('Content Validator initialized', {
      component: 'ContentValidator',
      config: {
        minQualityScore: this.config.minQualityScore,
        enableFactChecking: this.config.enableFactChecking,
        enableProfanityFilter: this.config.enableProfanityFilter
      }
    });
  }

  /**
   * Validate AI-generated content
   */
  public async validateContent(
    content: any,
    requestType: AiRequestType,
    context?: ValidationContext
  ): Promise<ValidationResult> {
    try {
      logger.debug('Starting content validation', {
        component: 'ContentValidator',
        requestType,
        contentType: typeof content
      });

      const issues: ValidationIssue[] = [];
      const suggestions: string[] = [];
      let qualityScore = 1.0;

      // Basic format validation
      const formatValidation = await this.validateFormat(content, requestType, context);
      issues.push(...formatValidation.issues);
      qualityScore -= formatValidation.penalty;

      // Content quality validation
      if (typeof content === 'string' || content?.content) {
        const textContent = typeof content === 'string' ? content : content.content;
        
        const qualityValidation = await this.validateContentQuality(textContent, context);
        issues.push(...qualityValidation.issues);
        qualityScore -= qualityValidation.penalty;

        // Profanity filter
        if (this.config.enableProfanityFilter) {
          const profanityValidation = this.validateProfanity(textContent);
          issues.push(...profanityValidation.issues);
          qualityScore -= profanityValidation.penalty;
        }

        // Duplicate detection
        if (this.config.enableDuplicateDetection && context?.existingContent) {
          const duplicateValidation = this.validateDuplicates(textContent, context.existingContent);
          issues.push(...duplicateValidation.issues);
          qualityScore -= duplicateValidation.penalty;
        }

        // Grammar and language validation
        const grammarValidation = this.validateGrammar(textContent);
        issues.push(...grammarValidation.issues);
        qualityScore -= grammarValidation.penalty;
      }

      // Question-specific validation
      if (requestType === AiRequestType.QUESTION_GENERATION) {
        const questionValidation = await this.validateQuestion(content, context);
        issues.push(...questionValidation.issues);
        qualityScore -= questionValidation.penalty;
      }

      // Fact checking (if enabled and applicable)
      if (this.config.enableFactChecking && this.shouldFactCheck(requestType)) {
        try {
          const factCheckValidation = await this.validateFacts(content, context);
          issues.push(...factCheckValidation.issues);
          qualityScore -= factCheckValidation.penalty;
        } catch (error) {
          logger.warn('Fact checking failed, continuing validation', {
            component: 'ContentValidator',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Generate suggestions based on issues
      suggestions.push(...this.generateSuggestions(issues));

      // Ensure quality score is within bounds
      qualityScore = Math.max(0, Math.min(1, qualityScore));

      const result: ValidationResult = {
        valid: qualityScore >= this.config.minQualityScore && !this.hasCriticalIssues(issues),
        score: qualityScore,
        issues,
        suggestions,
        autoFixApplied: false,
        humanReviewRequired: this.requiresHumanReview(issues, qualityScore)
      };

      logger.debug('Content validation completed', {
        component: 'ContentValidator',
        valid: result.valid,
        score: result.score,
        issueCount: issues.length
      });

      return result;

    } catch (error) {
      logger.error('Content validation failed', {
        component: 'ContentValidator',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        valid: false,
        score: 0,
        issues: [{
          type: ValidationIssueType.FORMAT_ERROR,
          severity: ValidationSeverity.CRITICAL,
          description: 'Validation process failed',
          field: 'content',
          autoFixable: false
        }],
        suggestions: ['Retry validation with different parameters'],
        autoFixApplied: false,
        humanReviewRequired: true
      };
    }
  }

  /**
   * Initialize validation patterns and rules
   */
  private initializeValidation(): void {
    // Initialize profanity regex
    if (this.config.profanityWords.length > 0) {
      const pattern = this.config.profanityWords
        .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      this.profanityRegex = new RegExp(`\\b(${pattern})\\b`, 'gi');
    }

    // Initialize question format patterns
    this.questionPatterns.set('MULTIPLE_CHOICE' as QuestionType, 
      /^.+\?\s*(?:\n|$)(?:[A-D]\)|\d\.|[A-D]\.)\s*.+(?:\n(?:[A-D]\)|\d\.|[A-D]\.)\s*.+){2,}/
    );
    this.questionPatterns.set('TRUE_FALSE' as QuestionType,
      /^.+\?\s*(?:\n|$)(?:true|false|yes|no)/i
    );
    this.questionPatterns.set('TEXT_INPUT' as QuestionType,
      /^.+\?/
    );
  }

  /**
   * Validate content format
   */
  private async validateFormat(
    content: any,
    requestType: AiRequestType,
    context?: ValidationContext
  ): Promise<{ issues: ValidationIssue[]; penalty: number }> {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    // Check if content exists
    if (!content) {
      issues.push({
        type: ValidationIssueType.FORMAT_ERROR,
        severity: ValidationSeverity.CRITICAL,
        description: 'Content is empty or null',
        field: 'content',
        autoFixable: false
      });
      penalty += 1.0;
      return { issues, penalty };
    }

    // Validate content structure based on request type
    if (requestType === AiRequestType.QUESTION_GENERATION) {
      if (Array.isArray(content)) {
        // Multiple questions
        for (let i = 0; i < content.length; i++) {
          const question = content[i];
          if (!question.questionText || !question.correctAnswer) {
            issues.push({
              type: ValidationIssueType.FORMAT_ERROR,
              severity: ValidationSeverity.HIGH,
              description: `Question ${i + 1} missing required fields`,
              field: `questions[${i}]`,
              autoFixable: false
            });
            penalty += 0.2;
          }
        }
      } else if (typeof content === 'object') {
        // Single question object
        if (!content.questionText) {
          issues.push({
            type: ValidationIssueType.FORMAT_ERROR,
            severity: ValidationSeverity.CRITICAL,
            description: 'Question missing text',
            field: 'questionText',
            autoFixable: false
          });
          penalty += 0.5;
        }
      }
    }

    return { issues, penalty };
  }

  /**
   * Validate content quality
   */
  private async validateContentQuality(
    content: string,
    context?: ValidationContext
  ): Promise<{ issues: ValidationIssue[]; penalty: number }> {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    // Length validation
    if (content.length < this.config.minContentLength) {
      issues.push({
        type: ValidationIssueType.CONTENT_QUALITY,
        severity: ValidationSeverity.HIGH,
        description: `Content too short (${content.length} < ${this.config.minContentLength} characters)`,
        field: 'content',
        suggestion: 'Generate longer content',
        autoFixable: false
      });
      penalty += 0.3;
    } else if (content.length > this.config.maxContentLength) {
      issues.push({
        type: ValidationIssueType.CONTENT_QUALITY,
        severity: ValidationSeverity.MEDIUM,
        description: `Content too long (${content.length} > ${this.config.maxContentLength} characters)`,
        field: 'content',
        suggestion: 'Trim content to appropriate length',
        autoFixable: true
      });
      penalty += 0.1;
    }

    // Check for incomplete content
    if (content.endsWith('...') || content.includes('[INCOMPLETE]') || 
        content.includes('[TRUNCATED]')) {
      issues.push({
        type: ValidationIssueType.CONTENT_QUALITY,
        severity: ValidationSeverity.HIGH,
        description: 'Content appears incomplete or truncated',
        field: 'content',
        suggestion: 'Regenerate with higher token limit',
        autoFixable: false
      });
      penalty += 0.3;
    }

    // Check for placeholder text
    const placeholders = ['[INSERT TEXT]', '[PLACEHOLDER]', 'TODO:', 'FIXME:', 'XXX'];
    for (const placeholder of placeholders) {
      if (content.includes(placeholder)) {
        issues.push({
          type: ValidationIssueType.CONTENT_QUALITY,
          severity: ValidationSeverity.HIGH,
          description: `Content contains placeholder: ${placeholder}`,
          field: 'content',
          autoFixable: false
        });
        penalty += 0.2;
      }
    }

    // Check content relevance if topic is provided
    if (context?.topic) {
      const relevanceScore = this.calculateRelevance(content, context.topic);
      if (relevanceScore < 0.5) {
        issues.push({
          type: ValidationIssueType.CONTENT_QUALITY,
          severity: ValidationSeverity.MEDIUM,
          description: `Content may not be relevant to topic: ${context.topic}`,
          field: 'content',
          suggestion: 'Ensure content matches the specified topic',
          autoFixable: false
        });
        penalty += 0.2;
      }
    }

    return { issues, penalty };
  }

  /**
   * Validate profanity and inappropriate content
   */
  private validateProfanity(content: string): { issues: ValidationIssue[]; penalty: number } {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    if (this.profanityRegex) {
      const matches = content.match(this.profanityRegex);
      if (matches) {
        issues.push({
          type: ValidationIssueType.INAPPROPRIATE_CONTENT,
          severity: ValidationSeverity.CRITICAL,
          description: `Content contains inappropriate language: ${matches.length} instance(s)`,
          field: 'content',
          autoFixable: false
        });
        penalty += 1.0; // Critical penalty for inappropriate content
      }
    }

    return { issues, penalty };
  }

  /**
   * Validate for duplicate content
   */
  private validateDuplicates(
    content: string,
    existingContent: string[]
  ): { issues: ValidationIssue[]; penalty: number } {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    for (const existing of existingContent) {
      const similarity = this.calculateSimilarity(content, existing);
      if (similarity >= this.duplicateThreshold) {
        issues.push({
          type: ValidationIssueType.DUPLICATE_CONTENT,
          severity: ValidationSeverity.HIGH,
          description: `Content is ${(similarity * 100).toFixed(0)}% similar to existing content`,
          field: 'content',
          suggestion: 'Generate unique content',
          autoFixable: false
        });
        penalty += 0.5;
        break; // One duplicate detection is enough
      }
    }

    return { issues, penalty };
  }

  /**
   * Validate grammar and language quality
   */
  private validateGrammar(content: string): { issues: ValidationIssue[]; penalty: number } {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    // Basic grammar checks
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Check for sentences without proper capitalization
    let uncapitalizedCount = 0;
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 0 && !/^[A-Z]/.test(trimmed)) {
        uncapitalizedCount++;
      }
    }

    if (uncapitalizedCount > sentences.length * 0.2) {
      issues.push({
        type: ValidationIssueType.GRAMMAR,
        severity: ValidationSeverity.MEDIUM,
        description: `Many sentences lack proper capitalization (${uncapitalizedCount}/${sentences.length})`,
        field: 'content',
        suggestion: 'Ensure sentences start with capital letters',
        autoFixable: true
      });
      penalty += 0.1;
    }

    // Check for excessive repetition
    const words = content.toLowerCase().split(/\s+/);
    const wordCount = new Map<string, number>();
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    const totalWords = words.length;
    const uniqueWords = wordCount.size;
    const repetitionRatio = uniqueWords / totalWords;

    if (repetitionRatio < 0.3 && totalWords > 20) {
      issues.push({
        type: ValidationIssueType.CONTENT_QUALITY,
        severity: ValidationSeverity.MEDIUM,
        description: `High word repetition ratio: ${(repetitionRatio * 100).toFixed(0)}% unique words`,
        field: 'content',
        suggestion: 'Use more varied vocabulary',
        autoFixable: false
      });
      penalty += 0.2;
    }

    return { issues, penalty };
  }

  /**
   * Validate question-specific content
   */
  private async validateQuestion(
    content: any,
    context?: ValidationContext
  ): Promise<{ issues: ValidationIssue[]; penalty: number }> {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    // Handle array of questions
    const questions = Array.isArray(content) ? content : [content];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      // Validate question structure
      if (!question.questionText || typeof question.questionText !== 'string') {
        issues.push({
          type: ValidationIssueType.FORMAT_ERROR,
          severity: ValidationSeverity.CRITICAL,
          description: `Question ${i + 1}: Missing or invalid question text`,
          field: `questions[${i}].questionText`,
          autoFixable: false
        });
        penalty += 0.5;
        continue;
      }

      // Check if question actually ends with a question mark
      if (!question.questionText.trim().endsWith('?')) {
        issues.push({
          type: ValidationIssueType.FORMAT_ERROR,
          severity: ValidationSeverity.MEDIUM,
          description: `Question ${i + 1}: Does not end with question mark`,
          field: `questions[${i}].questionText`,
          suggestion: 'Add question mark at the end',
          autoFixable: true
        });
        penalty += 0.1;
      }

      // Validate based on question type
      if (question.questionType) {
        const typeValidation = this.validateQuestionType(question, i);
        issues.push(...typeValidation.issues);
        penalty += typeValidation.penalty;
      }

      // Validate difficulty appropriateness
      if (context?.difficulty && question.difficulty) {
        const diffDelta = Math.abs(question.difficulty - context.difficulty);
        if (diffDelta > 1) {
          issues.push({
            type: ValidationIssueType.DIFFICULTY_MISMATCH,
            severity: ValidationSeverity.MEDIUM,
            description: `Question ${i + 1}: Difficulty mismatch (expected: ${context.difficulty}, got: ${question.difficulty})`,
            field: `questions[${i}].difficulty`,
            autoFixable: false
          });
          penalty += 0.1;
        }
      }
    }

    return { issues, penalty };
  }

  /**
   * Validate specific question type format
   */
  private validateQuestionType(
    question: any,
    index: number
  ): { issues: ValidationIssue[]; penalty: number } {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    switch (question.questionType) {
      case 'MULTIPLE_CHOICE':
        if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
          issues.push({
            type: ValidationIssueType.FORMAT_ERROR,
            severity: ValidationSeverity.HIGH,
            description: `Question ${index + 1}: Multiple choice needs at least 2 options`,
            field: `questions[${index}].options`,
            autoFixable: false
          });
          penalty += 0.3;
        }
        break;

      case 'TRUE_FALSE':
        if (typeof question.correctAnswer !== 'boolean') {
          issues.push({
            type: ValidationIssueType.FORMAT_ERROR,
            severity: ValidationSeverity.HIGH,
            description: `Question ${index + 1}: True/false answer must be boolean`,
            field: `questions[${index}].correctAnswer`,
            autoFixable: false
          });
          penalty += 0.3;
        }
        break;

      case 'TEXT_INPUT':
        if (!question.correctAnswer || typeof question.correctAnswer !== 'string') {
          issues.push({
            type: ValidationIssueType.FORMAT_ERROR,
            severity: ValidationSeverity.HIGH,
            description: `Question ${index + 1}: Text input needs string answer`,
            field: `questions[${index}].correctAnswer`,
            autoFixable: false
          });
          penalty += 0.3;
        }
        break;
    }

    return { issues, penalty };
  }

  /**
   * Validate facts (placeholder for fact-checking integration)
   */
  private async validateFacts(
    content: any,
    context?: ValidationContext
  ): Promise<{ issues: ValidationIssue[]; penalty: number }> {
    const issues: ValidationIssue[] = [];
    let penalty = 0;

    // This would integrate with external fact-checking services
    // For now, we'll do basic plausibility checks

    if (typeof content === 'string') {
      // Check for obviously false statements
      const suspiciousPhrases = [
        'the earth is flat',
        'vaccines cause autism',
        'climate change is fake'
      ];

      for (const phrase of suspiciousPhrases) {
        if (content.toLowerCase().includes(phrase)) {
          issues.push({
            type: ValidationIssueType.FACTUAL_ACCURACY,
            severity: ValidationSeverity.HIGH,
            description: 'Content may contain factual inaccuracies',
            field: 'content',
            suggestion: 'Verify facts with reliable sources',
            autoFixable: false
          });
          penalty += 0.5;
          break;
        }
      }
    }

    return { issues, penalty };
  }

  /**
   * Calculate content relevance to topic
   */
  private calculateRelevance(content: string, topic: string): number {
    const contentWords = content.toLowerCase().split(/\s+/);
    const topicWords = topic.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const topicWord of topicWords) {
      if (contentWords.some(cw => cw.includes(topicWord) || topicWord.includes(cw))) {
        matches++;
      }
    }
    
    return topicWords.length > 0 ? matches / topicWords.length : 0;
  }

  /**
   * Calculate content similarity (simple implementation)
   */
  private calculateSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Check if content requires fact checking
   */
  private shouldFactCheck(requestType: AiRequestType): boolean {
    return requestType === AiRequestType.QUESTION_GENERATION ||
           requestType === AiRequestType.FACT_CHECK ||
           requestType === AiRequestType.CONTENT_VALIDATION;
  }

  /**
   * Check if validation has critical issues
   */
  private hasCriticalIssues(issues: ValidationIssue[]): boolean {
    return issues.some(issue => issue.severity === ValidationSeverity.CRITICAL);
  }

  /**
   * Check if content requires human review
   */
  private requiresHumanReview(issues: ValidationIssue[], qualityScore: number): boolean {
    return qualityScore < 0.6 ||
           issues.some(issue => 
             issue.severity === ValidationSeverity.CRITICAL ||
             issue.type === ValidationIssueType.INAPPROPRIATE_CONTENT ||
             issue.type === ValidationIssueType.FACTUAL_ACCURACY
           );
  }

  /**
   * Generate suggestions based on issues
   */
  private generateSuggestions(issues: ValidationIssue[]): string[] {
    const suggestions = new Set<string>();
    
    for (const issue of issues) {
      if (issue.suggestion) {
        suggestions.add(issue.suggestion);
      }
    }
    
    // Add general suggestions based on issue types
    const issueTypes = new Set(issues.map(i => i.type));
    
    if (issueTypes.has(ValidationIssueType.CONTENT_QUALITY)) {
      suggestions.add('Improve content quality and completeness');
    }
    
    if (issueTypes.has(ValidationIssueType.FORMAT_ERROR)) {
      suggestions.add('Check content format and structure');
    }
    
    if (issueTypes.has(ValidationIssueType.GRAMMAR)) {
      suggestions.add('Review grammar and language quality');
    }
    
    return Array.from(suggestions);
  }

  /**
   * Get default profanity words (minimal set)
   */
  private getDefaultProfanityWords(): string[] {
    // This would typically be loaded from a more comprehensive list
    return [
      'damn', 'hell', 'shit', 'fuck', 'bitch', 'ass', 'bastard',
      'piss', 'crap', 'asshole', 'dickhead', 'motherfucker'
    ];
  }
}

export default ContentValidator;
