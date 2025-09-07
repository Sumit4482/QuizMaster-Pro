// Question Management Types

// Enums matching backend
export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'TEXT_INPUT';
export type DifficultyLevel = 1 | 2 | 3 | 4; // Easy, Medium, Hard, Expert
export type QuestionSource = 'manual' | 'ai_generated' | 'imported';

// User types
export interface User {
  id: string;
  username: string;
  email?: string;
}

// Category types
export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children?: Category[];
  parent?: Category;
}

export interface CategoryResponse extends Category {
  questionCount?: number;
  subcategories?: Category[];
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  level: number;
  path: string[];
}

// Question usage statistics
export interface QuestionUsageStats {
  timesUsed: number;
  timesCorrect: number;
  successRate: number;
  averageTime?: number;
  lastUsed?: string;
}

// Question metadata
export interface QuestionMetadata {
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  externalLinks?: string[];
  aiGenerated?: boolean;
  difficulty?: {
    calculated: number;
    manual?: number;
  };
  [key: string]: any;
}

// Question types
export interface Question {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: any; // JSONB field for multiple choice options
  correctAnswer?: any; // Only included for admin users
  explanation?: string;
  hints?: string[];
  difficultyLevel: DifficultyLevel;
  estimatedTime: number;
  points: number;
  tags: string[];
  metadata?: QuestionMetadata;
  version: number;
  source: QuestionSource;
  isActive: boolean;
  isPublished: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  categories: CategoryResponse[];
  createdBy: User;
  lastModifiedBy?: User;
  usage?: QuestionUsageStats;
}

// Question creation/update types
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

// Question search and filtering
export interface QuestionSearchParams {
  search?: string;
  categoryIds?: number[];
  questionType?: QuestionType;
  difficultyLevel?: DifficultyLevel[];
  tags?: string[];
  source?: QuestionSource;
  isPublished?: boolean;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'questionText' | 'difficultyLevel' | 'points';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface QuestionSearchResponse {
  questions: Question[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Bulk operations
export interface BulkQuestionOperation {
  operation: 'delete' | 'publish' | 'unpublish' | 'assignCategory' | 'addTags' | 'removeTags';
  questionIds: string[];
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

// Import/Export types
export interface QuestionImportData {
  questions: Array<{
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
    categoryNames?: string[];
  }>;
  categories?: Array<{
    name: string;
    slug?: string;
    description?: string;
    icon?: string;
    color?: string;
    parentId?: number;
    sortOrder?: number;
  }>;
}

export interface QuestionExportData {
  questions: Question[];
  categories: Category[];
  exportedAt: string;
  exportedBy: string;
}

// Statistics types
export interface QuestionStatistics {
  totalQuestions: number;
  publishedQuestions: number;
  draftQuestions: number;
  difficultyDistribution: Array<{
    level: DifficultyLevel;
    count: number;
  }>;
  typeDistribution: Array<{
    type: QuestionType;
    count: number;
  }>;
  popularTags: Array<{
    tag: string;
    count: number;
  }>;
}

export interface CategoryStatistics {
  totalCategories: number;
  activeCategories: number;
  categoriesWithQuestions: number;
  averageQuestionsPerCategory: number;
  topCategories: Array<{
    category: CategoryResponse;
    questionCount: number;
  }>;
}

// Category creation/update types
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

// Form types for UI
export interface QuestionFormData {
  questionText: string;
  questionType: QuestionType;
  multipleChoiceOptions?: Array<{
    text: string;
    isCorrect: boolean;
  }>;
  trueFalseAnswer?: boolean;
  textAnswer?: string;
  explanation?: string;
  hints?: string[];
  difficultyLevel: DifficultyLevel;
  estimatedTime: number;
  points: number;
  tags: string[];
  categoryIds: number[];
  metadata?: QuestionMetadata;
}

export interface CategoryFormData {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: number;
  sortOrder: number;
}

// UI specific types
export interface QuestionListItem {
  question: Question;
  selected?: boolean;
  onSelect?: (questionId: string, selected: boolean) => void;
  onEdit?: (question: Question) => void;
  onDelete?: (questionId: string) => void;
  onPublish?: (questionId: string) => void;
  onUnpublish?: (questionId: string) => void;
}

export interface CategoryListItem {
  category: CategoryResponse;
  selected?: boolean;
  onSelect?: (categoryId: number, selected: boolean) => void;
  onEdit?: (category: CategoryResponse) => void;
  onDelete?: (categoryId: number) => void;
}

// Filter and sort options
export const DIFFICULTY_LEVELS: Array<{ value: DifficultyLevel; label: string; color: string }> = [
  { value: 1, label: 'Easy', color: 'green' },
  { value: 2, label: 'Medium', color: 'blue' },
  { value: 3, label: 'Hard', color: 'orange' },
  { value: 4, label: 'Expert', color: 'red' },
];

export const QUESTION_TYPES: Array<{ value: QuestionType; label: string; icon: string }> = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice', icon: '📝' },
  { value: 'TRUE_FALSE', label: 'True/False', icon: '✓✗' },
  { value: 'TEXT_INPUT', label: 'Text Input', icon: '📄' },
];

export const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Created Date' },
  { value: 'updatedAt', label: 'Updated Date' },
  { value: 'questionText', label: 'Question Text' },
  { value: 'difficultyLevel', label: 'Difficulty' },
  { value: 'points', label: 'Points' },
];

export const DEFAULT_QUESTION_FORM: QuestionFormData = {
  questionText: '',
  questionType: 'MULTIPLE_CHOICE',
  multipleChoiceOptions: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
  explanation: '',
  hints: [],
  difficultyLevel: 2,
  estimatedTime: 30,
  points: 10,
  tags: [],
  categoryIds: [],
};

export const DEFAULT_CATEGORY_FORM: CategoryFormData = {
  name: '',
  slug: '',
  description: '',
  icon: '',
  color: '#0ea5e9',
  sortOrder: 0,
};

// Utility functions for formatting
export const questionUtils = {
  formatDifficulty: (level: DifficultyLevel) => {
    const difficultyInfo = DIFFICULTY_LEVELS.find(d => d.value === level);
    return difficultyInfo || { value: level, label: 'Unknown', color: 'gray' };
  },

  formatQuestionType: (type: QuestionType) => {
    const typeInfo = QUESTION_TYPES.find(t => t.value === type);
    return typeInfo || { value: type, label: 'Unknown', icon: '❓' };
  },

  getDifficultyColor: (level: DifficultyLevel): string => {
    const colors: Record<DifficultyLevel, string> = {
      1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      2: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      3: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      4: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return colors[level] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  },

  getTypeColor: (type: QuestionType): string => {
    const colors: Record<QuestionType, string> = {
      'MULTIPLE_CHOICE': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'TRUE_FALSE': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'TEXT_INPUT': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    };
    return colors[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  },

  truncateText: (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  formatTimeEstimate: (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  },

  formatTags: (tags: string[]): string => {
    if (!tags || tags.length === 0) return '';
    return tags.join(', ');
  },

  getPublishStatus: (isPublished: boolean, publishedAt?: string): { label: string; color: string } => {
    if (isPublished) {
      return { 
        label: `Published${publishedAt ? ` on ${new Date(publishedAt).toLocaleDateString()}` : ''}`, 
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
      };
    }
    return { 
      label: 'Draft', 
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' 
    };
  },

  formatPoints: (points: number): string => {
    if (points === 1) return '1 point';
    return `${points} points`;
  }
};
