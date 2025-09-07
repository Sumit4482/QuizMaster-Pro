import { QuestionType, Category, Question, QuestionCategory, QuestionUsage, QuestionAudit } from '@prisma/client';

// Question Types Enum
export { QuestionType };

// Difficulty levels
export enum DifficultyLevel {
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
  EXPERT = 4
}

// Question source types
export enum QuestionSource {
  MANUAL = 'manual',
  AI_GENERATED = 'ai_generated',
  IMPORTED = 'imported'
}

// Question audit actions
export enum QuestionAuditAction {
  CREATED = 'created',
  UPDATED = 'updated',
  PUBLISHED = 'published',
  UNPUBLISHED = 'unpublished',
  ARCHIVED = 'archived',
  DELETED = 'deleted'
}

// Base question interfaces
export interface BaseQuestionData {
  questionText: string;
  questionType: QuestionType;
  explanation?: string;
  hints?: string[];
  difficultyLevel: DifficultyLevel;
  estimatedTime?: number;
  points: number;
  tags: string[];
  metadata?: QuestionMetadata;
}

// Question metadata for additional features
export interface QuestionMetadata {
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  references?: string[];
  learningObjectives?: string[];
  [key: string]: any; // Index signature for Prisma JSON compatibility
}

// Multiple choice question structure
export interface MultipleChoiceQuestion extends BaseQuestionData {
  questionType: 'MULTIPLE_CHOICE';
  options: {
    options: string[];
    shuffle: boolean;
  };
  correctAnswer: {
    type: 'single' | 'multiple';
    indices: number[];
  };
}

// True/False question structure
export interface TrueFalseQuestion extends BaseQuestionData {
  questionType: 'TRUE_FALSE';
  correctAnswer: {
    value: boolean;
  };
}

// Text input question structure
export interface TextInputQuestion extends BaseQuestionData {
  questionType: 'TEXT_INPUT';
  correctAnswer: {
    type: 'exact' | 'contains' | 'regex';
    value: string | string[];
    caseSensitive?: boolean;
  };
}

// Union type for all question types
export type QuestionData = MultipleChoiceQuestion | TrueFalseQuestion | TextInputQuestion;

// Request/Response interfaces
export interface CreateQuestionRequest {
  questionText: string;
  questionType: QuestionType;
  options?: any;
  correctAnswer: any;
  explanation?: string;
  hints?: string[];
  difficultyLevel: DifficultyLevel;
  estimatedTime?: number;
  points: number;
  tags: string[];
  metadata?: QuestionMetadata;
  categoryIds: number[];
}

export interface UpdateQuestionRequest extends Partial<CreateQuestionRequest> {
  isPublished?: boolean;
}

export interface QuestionResponse {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: any;
  correctAnswer?: any; // Only included for admin users
  explanation?: string;
  hints?: string[];
  difficultyLevel: DifficultyLevel;
  estimatedTime: number;
  points: number;
  tags: string[];
  metadata?: QuestionMetadata;
  version: number;
  source: string;
  isActive: boolean;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  categories: CategoryResponse[];
  createdBy: {
    id: string;
    username: string;
  };
  lastModifiedBy?: {
    id: string;
    username: string;
  };
  usage?: QuestionUsageStats;
}

export interface QuestionUsageStats {
  timesUsed: number;
  timesCorrect: number;
  successRate: number;
  averageTime?: number;
  lastUsed?: Date;
}

// Category interfaces
export interface CategoryResponse {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  parent?: CategoryResponse;
  children?: CategoryResponse[];
  questionCount?: number;
}

export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: number;
  sortOrder?: number;
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {
  isActive?: boolean;
}

// Search and filter interfaces
export interface QuestionSearchParams {
  search?: string;
  categoryIds?: number[];
  questionType?: QuestionType;
  difficultyLevel?: DifficultyLevel[];
  tags?: string[];
  source?: QuestionSource;
  isPublished?: boolean;
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'questionText' | 'difficultyLevel' | 'points';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface QuestionSearchResponse {
  questions: QuestionResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Bulk operations
export interface BulkQuestionOperation {
  questionIds: string[];
  operation: 'delete' | 'publish' | 'unpublish' | 'archive' | 'assignCategory' | 'removeTags' | 'addTags';
  data?: {
    categoryIds?: number[];
    tags?: string[];
  };
}

export interface BulkOperationResponse {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{
    questionId: string;
    error: string;
  }>;
}

// Import/Export interfaces
export interface QuestionImportData {
  questions: Array<Omit<CreateQuestionRequest, 'categoryIds'> & {
    categoryNames?: string[];
  }>;
  categories?: CreateCategoryRequest[];
}

export interface QuestionExportData {
  questions: QuestionResponse[];
  categories: CategoryResponse[];
  exportedAt: Date;
  exportedBy: string;
}

// Question with relations (for internal use)
export interface QuestionWithRelations extends Question {
  categories: (QuestionCategory & {
    category: Category;
  })[];
  createdBy: {
    id: string;
    username: string;
    email: string;
  };
  lastModifiedBy?: {
    id: string;
    username: string;
    email: string;
  };
  usage: QuestionUsage[];
  // Ensure all Question fields are properly typed
  hints: string[] | null;
  estimatedTime: number | null;
  points: number;
  tags: string[];
  metadata: any | null;
  version: number;
  isPublished: boolean;
  publishedAt: Date | null;
}

// Category with relations
export interface CategoryWithRelations extends Category {
  parent?: Category;
  children: Category[];
  questionCategories: QuestionCategory[];
}

// Audit trail
export interface QuestionAuditResponse {
  id: string;
  questionId: string;
  action: QuestionAuditAction;
  changes?: any;
  createdAt: Date;
  user: {
    id: string;
    username: string;
  };
}
