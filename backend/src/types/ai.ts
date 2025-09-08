/**
 * Phase 3.1: AI Service Types and Interfaces
 * Comprehensive type definitions for universal AI integration
 */

import { QuestionType } from '@prisma/client';

// ================================
// AI PROVIDER TYPES
// ================================

export interface AiProviderConfig {
  id: string;
  name: string;
  displayName: string;
  type: AiProviderType;
  endpoint?: string;
  apiKeyName?: string;
  models: AiModelConfig[];
  isActive: boolean;
  isFree: boolean;
  priority: number;
  rateLimit?: RateLimitConfig;
  costConfig?: CostConfig;
  metadata?: Record<string, any>;
}

export interface AiModelConfig {
  name: string;
  displayName: string;
  modelType: AiModelType;
  capabilities: AiCapability[];
  maxTokens?: number;
  costPerToken?: number;
  qualityScore: number;
  speedScore: number;
  reliabilityScore: number;
  isActive: boolean;
  isDefault: boolean;
  configuration: Record<string, any>;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerMinute?: number;
  tokensPerHour?: number;
  tokensPerDay?: number;
}

export interface CostConfig {
  inputTokenCost: number;
  outputTokenCost: number;
  requestCost?: number;
  currency: string;
  billingModel: 'token' | 'request' | 'character' | 'credit';
}

export enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  HUGGINGFACE = 'huggingface',
  LOCAL = 'local',
  CUSTOM = 'custom'
}

export enum AiModelType {
  CHAT_COMPLETION = 'chat_completion',
  TEXT_GENERATION = 'text_generation',
  EMBEDDING = 'embedding',
  FINE_TUNED = 'fine_tuned',
  CUSTOM = 'custom'
}

export enum AiCapability {
  QUESTION_GENERATION = 'question_generation',
  CONTENT_VALIDATION = 'content_validation',
  FACT_CHECKING = 'fact_checking',
  LANGUAGE_TRANSLATION = 'language_translation',
  SUMMARIZATION = 'summarization',
  CLASSIFICATION = 'classification'
}

// ================================
// AI REQUEST TYPES
// ================================

export interface AiRequest {
  id: string;
  userId: string;
  requestType: AiRequestType;
  model?: string; // Specific model requested
  provider?: string; // Specific provider requested
  prompt: string;
  parameters?: AiRequestParameters;
  options?: AiRequestOptions;
  metadata?: Record<string, any>;
  priority?: number;
  timeout?: number;
}

export interface AiRequestParameters {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  systemPrompt?: string;
  examples?: string[];
}

export interface AiRequestOptions {
  allowFallback?: boolean;
  preferFreeModels?: boolean;
  maxCost?: number;
  qualityThreshold?: number;
  retryOnFailure?: boolean;
  cacheResponse?: boolean;
  validateContent?: boolean;
}

export enum AiRequestType {
  QUESTION_GENERATION = 'question_generation',
  BATCH_GENERATION = 'batch_generation',
  CONTENT_VALIDATION = 'content_validation',
  QUALITY_ASSESSMENT = 'quality_assessment',
  FACT_CHECK = 'fact_check',
  OPTIMIZATION = 'optimization',
  ANALYSIS = 'analysis'
}

// ================================
// AI RESPONSE TYPES
// ================================

export interface AiResponse {
  id: string;
  requestId: string;
  success: boolean;
  model: string;
  provider: string;
  content?: any;
  usage: AiUsageStats;
  cost: AiCostBreakdown;
  metadata: AiResponseMetadata;
  error?: AiError;
  cached?: boolean;
  duration: number;
  timestamp: Date;
}

export interface AiUsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  charactersProcessed?: number;
  creditsUsed?: number;
}

export interface AiCostBreakdown {
  inputCost: number;
  outputCost: number;
  requestCost: number;
  totalCost: number;
  currency: string;
  estimated: boolean;
}

export interface AiResponseMetadata {
  modelVersion?: string;
  processingTime: number;
  queueTime: number;
  retryCount: number;
  qualityScore?: number;
  contentFlags?: string[];
  validationResults?: ValidationResult[];
  finishReason?: string;
  stopReason?: string;
  localModel?: string;
  endpoint?: string;
}

// ================================
// QUESTION GENERATION TYPES
// ================================

export interface QuestionGenerationRequest {
  topic: string;
  subject?: string;
  difficulty: number; // 1-5
  questionType: QuestionType;
  count: number;
  language?: string;
  categoryId?: number;
  context?: string;
  existingQuestions?: string[]; // For avoiding duplicates
  customRequirements?: string;
  tags?: string[];
}

export interface GeneratedQuestion {
  questionText: string;
  questionType: QuestionType;
  options?: string[] | boolean; // For multiple choice or true/false
  correctAnswer: any;
  explanation?: string;
  hints?: string[];
  difficulty: number;
  estimatedTime: number;
  points: number;
  topic: string;
  subject?: string;
  tags: string[];
  metadata: QuestionMetadata;
  qualityScore: number;
  validationResults: ValidationResult[];
}

export interface QuestionMetadata {
  source: string; // AI model used
  generatedAt: Date;
  promptVersion: string;
  bloomsTaxonomy?: string;
  learningObjective?: string;
  conceptsCovered?: string[];
  prerequisites?: string[];
  relatedTopics?: string[];
}

export interface QuestionGenerationResponse {
  success: boolean;
  questions: GeneratedQuestion[];
  totalGenerated: number;
  validQuestions: number;
  cost: AiCostBreakdown;
  usage: AiUsageStats;
  qualityMetrics: QualityMetrics;
  errors?: AiError[];
  metadata: {
    model: string;
    provider: string;
    processingTime: number;
    batchId?: string;
  };
}

// ================================
// VALIDATION TYPES
// ================================

export interface ValidationResult {
  valid: boolean;
  score: number; // 0-1
  issues: ValidationIssue[];
  suggestions: string[];
  autoFixApplied: boolean;
  humanReviewRequired: boolean;
}

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: ValidationSeverity;
  description: string;
  field: string;
  suggestion?: string;
  autoFixable: boolean;
}

export enum ValidationIssueType {
  FORMAT_ERROR = 'format_error',
  CONTENT_QUALITY = 'content_quality',
  GRAMMAR = 'grammar',
  FACTUAL_ACCURACY = 'factual_accuracy',
  DUPLICATE_CONTENT = 'duplicate_content',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  DIFFICULTY_MISMATCH = 'difficulty_mismatch',
  UNCLEAR_QUESTION = 'unclear_question',
  AMBIGUOUS_ANSWER = 'ambiguous_answer'
}

export enum ValidationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ValidationStatus {
  PENDING = 'pending',
  VALID = 'valid',
  INVALID = 'invalid',
  NEEDS_REVIEW = 'needs_review',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

// ================================
// QUALITY & METRICS TYPES
// ================================

export interface QualityMetrics {
  overallScore: number; // 0-1
  contentQuality: number;
  formatCorrectness: number;
  difficultyAccuracy: number;
  grammarScore: number;
  factualAccuracy: number;
  uniqueness: number;
  educationalValue: number;
  clarity: number;
}

export interface QualityAssessmentCriteria {
  minScore: number;
  weights: {
    contentQuality: number;
    formatCorrectness: number;
    difficultyAccuracy: number;
    grammarScore: number;
    factualAccuracy: number;
    uniqueness: number;
    educationalValue: number;
    clarity: number;
  };
}

// ================================
// COST MANAGEMENT TYPES
// ================================

export interface CostTracker {
  userId: string;
  dailyCost: number;
  monthlyCost: number;
  totalCost: number;
  requestCount: number;
  tokenCount: number;
  lastUpdated: Date;
}

export interface BudgetConstraints {
  dailyLimit: number;
  monthlyLimit: number;
  perRequestLimit: number;
  allowPaidModels: boolean;
  preferFreeModels: boolean;
  emergencyStopThreshold: number;
}

export interface CostOptimizationStrategy {
  preferFreeModels: boolean;
  fallbackToFreeOnBudget: boolean;
  batchRequests: boolean;
  cacheAggressively: boolean;
  useQualityThresholds: boolean;
  dynamicModelSelection: boolean;
}

// ================================
// ERROR TYPES
// ================================

export interface AiError {
  code: AiErrorCode;
  message: string;
  details?: any;
  provider?: string;
  model?: string;
  retryable: boolean;
  timestamp: Date;
  requestId?: string;
}

export enum AiErrorCode {
  // Provider Errors
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
  API_KEY_INVALID = 'api_key_invalid',
  API_KEY_MISSING = 'api_key_missing',
  AUTHENTICATION_FAILED = 'authentication_failed',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  QUOTA_EXCEEDED = 'quota_exceeded',
  BUDGET_EXCEEDED = 'budget_exceeded',
  
  // Request Errors
  INVALID_REQUEST = 'invalid_request',
  REQUEST_TOO_LARGE = 'request_too_large',
  TIMEOUT = 'timeout',
  MALFORMED_PROMPT = 'malformed_prompt',
  
  // Response Errors
  INVALID_RESPONSE = 'invalid_response',
  EMPTY_RESPONSE = 'empty_response',
  CONTENT_FILTERED = 'content_filtered',
  QUALITY_THRESHOLD_NOT_MET = 'quality_threshold_not_met',
  
  // System Errors
  SERVICE_UNAVAILABLE = 'service_unavailable',
  NETWORK_ERROR = 'network_error',
  INTERNAL_ERROR = 'internal_error',
  CONFIGURATION_ERROR = 'configuration_error',
  
  // Validation Errors
  VALIDATION_FAILED = 'validation_failed',
  CONTENT_INAPPROPRIATE = 'content_inappropriate',
  DUPLICATE_CONTENT = 'duplicate_content',
  
  // Circuit Breaker
  CIRCUIT_BREAKER_OPEN = 'circuit_breaker_open',
  SERVICE_DEGRADED = 'service_degraded'
}

// ================================
// CACHING TYPES
// ================================

export interface CacheKey {
  requestType: AiRequestType;
  prompt: string;
  parameters: string; // Stringified parameters
  model: string;
  provider: string;
}

export interface CacheEntry {
  key: string;
  data: any;
  metadata: {
    createdAt: Date;
    expiresAt: Date;
    accessCount: number;
    lastAccessed: Date;
    cost: number;
    quality: number;
  };
  tags: string[];
}

// ================================
// ANALYTICS TYPES
// ================================

export interface AiAnalytics {
  period: 'hour' | 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalCost: number;
    totalTokens: number;
    averageResponseTime: number;
    averageQualityScore: number;
    cacheHitRate: number;
    popularModels: Array<{
      model: string;
      provider: string;
      usage: number;
      cost: number;
    }>;
    errorBreakdown: Record<AiErrorCode, number>;
    userBreakdown: Array<{
      userId: string;
      requests: number;
      cost: number;
    }>;
  };
}

// ================================
// SERVICE INTERFACES
// ================================

export interface IAiProvider {
  name: string;
  type: AiProviderType;
  isAvailable(): Promise<boolean>;
  generateContent(request: AiRequest): Promise<AiResponse>;
  validateResponse(response: any): Promise<ValidationResult>;
  calculateCost(usage: AiUsageStats): AiCostBreakdown;
  getModels(): AiModelConfig[];
  healthCheck(): Promise<boolean>;
}

export interface IAiModelSelector {
  selectBestModel(
    request: AiRequest, 
    constraints: BudgetConstraints,
    qualityRequirements: QualityAssessmentCriteria
  ): Promise<{ provider: string; model: string; estimatedCost: number }>;
}

export interface IAiCache {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, data: any, ttl: number, metadata?: any): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  getStats(): Promise<{ hits: number; misses: number; size: number }>;
}

export interface IAiQueue {
  enqueue(request: AiRequest): Promise<string>;
  dequeue(): Promise<AiRequest | null>;
  getQueueStatus(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }>;
}

export interface IAiCircuitBreaker {
  isOpen(): boolean;
  execute<T>(fn: () => Promise<T>): Promise<T>;
  onSuccess(): void;
  onFailure(error: Error): void;
  reset(): void;
  getState(): 'closed' | 'open' | 'half-open';
}
