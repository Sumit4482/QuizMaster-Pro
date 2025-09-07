import {
  Question,
  QuestionSearchParams,
  QuestionSearchResponse,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  BulkQuestionOperation,
  BulkOperationResponse,
  QuestionImportData,
  QuestionExportData,
  QuestionStatistics,
  Category,
  CategoryResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CategoryStatistics,
} from '@/types/question';
import { ApiResponse } from '@/types/common';
import { getTokens } from '@/utils/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Generic API utility function
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { accessToken } = getTokens();
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data: ApiResponse<T> = await response.json();
  
  if (!data.success) {
    throw new Error(data.error?.message || 'API request failed');
  }

  return data.data!;
}

// Question API Functions
export const questionApi = {
  // Search questions
  async search(params: QuestionSearchParams): Promise<QuestionSearchResponse> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            value.forEach(v => searchParams.append(key, String(v)));
          }
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    return apiCall<QuestionSearchResponse>(`/api/questions/search?${searchParams.toString()}`);
  },

  // Get question by ID
  async getById(id: string): Promise<Question> {
    return apiCall<Question>(`/api/questions/${id}`);
  },

  // Create question
  async create(data: CreateQuestionRequest): Promise<Question> {
    return apiCall<Question>('/api/questions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update question
  async update(id: string, data: UpdateQuestionRequest): Promise<Question> {
    return apiCall<Question>(`/api/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete question
  async delete(id: string): Promise<void> {
    return apiCall<void>(`/api/questions/${id}`, {
      method: 'DELETE',
    });
  },

  // Publish question
  async publish(id: string): Promise<Question> {
    return apiCall<Question>(`/api/questions/${id}/publish`, {
      method: 'POST',
    });
  },

  // Unpublish question
  async unpublish(id: string): Promise<Question> {
    return apiCall<Question>(`/api/questions/${id}/unpublish`, {
      method: 'POST',
    });
  },

  // Bulk operations
  async bulkOperation(operation: BulkQuestionOperation): Promise<BulkOperationResponse> {
    return apiCall<BulkOperationResponse>('/api/questions/bulk', {
      method: 'POST',
      body: JSON.stringify(operation),
    });
  },

  // Import questions
  async import(data: QuestionImportData): Promise<BulkOperationResponse> {
    return apiCall<BulkOperationResponse>('/api/questions/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Export questions
  async export(categoryIds?: number[]): Promise<QuestionExportData> {
    const params = categoryIds?.length 
      ? '?' + categoryIds.map(id => `categoryIds=${id}`).join('&')
      : '';
    
    return apiCall<QuestionExportData>(`/api/questions/export${params}`);
  },

  // Get statistics
  async getStatistics(categoryIds?: number[]): Promise<QuestionStatistics> {
    const params = categoryIds?.length 
      ? '?' + categoryIds.map(id => `categoryIds=${id}`).join('&')
      : '';
    
    return apiCall<QuestionStatistics>(`/api/questions/statistics${params}`);
  },
};

// Category API Functions
export const categoryApi = {
  // Get all categories
  async getAll(includeInactive = false): Promise<CategoryResponse[]> {
    const params = includeInactive ? '?includeInactive=true' : '';
    return apiCall<CategoryResponse[]>(`/api/categories${params}`);
  },

  // Get category by ID
  async getById(id: number, includeInactive = false): Promise<CategoryResponse> {
    const params = includeInactive ? '?includeInactive=true' : '';
    return apiCall<CategoryResponse>(`/api/categories/${id}${params}`);
  },

  // Get category by slug
  async getBySlug(slug: string): Promise<CategoryResponse> {
    return apiCall<CategoryResponse>(`/api/categories/slug/${slug}`);
  },

  // Get category tree
  async getTree(): Promise<CategoryResponse[]> {
    return apiCall<CategoryResponse[]>('/api/categories/tree');
  },

  // Get root categories
  async getRoot(): Promise<CategoryResponse[]> {
    return apiCall<CategoryResponse[]>('/api/categories/root');
  },

  // Search categories
  async search(search: string, parentId?: number): Promise<CategoryResponse[]> {
    const params = new URLSearchParams({ search });
    if (parentId !== undefined) {
      params.append('parentId', String(parentId));
    }
    
    return apiCall<CategoryResponse[]>(`/api/categories/search?${params.toString()}`);
  },

  // Create category
  async create(data: CreateCategoryRequest): Promise<CategoryResponse> {
    return apiCall<CategoryResponse>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update category
  async update(id: number, data: UpdateCategoryRequest): Promise<CategoryResponse> {
    return apiCall<CategoryResponse>(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete category
  async delete(id: number): Promise<void> {
    return apiCall<void>(`/api/categories/${id}`, {
      method: 'DELETE',
    });
  },

  // Reorder categories
  async reorder(categoryOrders: Array<{ id: number; sortOrder: number }>): Promise<void> {
    return apiCall<void>('/api/categories/reorder', {
      method: 'POST',
      body: JSON.stringify({ categoryOrders }),
    });
  },

  // Get statistics
  async getStatistics(): Promise<CategoryStatistics> {
    return apiCall<CategoryStatistics>('/api/categories/statistics');
  },
};

// Utility functions
export const questionUtils = {
  // Generate slug from name
  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  },

  // Format difficulty level
  formatDifficulty(level: number): { label: string; color: string } {
    const difficultyMap = {
      1: { label: 'Beginner', color: 'green' },
      2: { label: 'Easy', color: 'blue' },
      3: { label: 'Medium', color: 'yellow' },
      4: { label: 'Hard', color: 'orange' },
      5: { label: 'Expert', color: 'red' },
    };
    return difficultyMap[level as keyof typeof difficultyMap] || { label: 'Unknown', color: 'gray' };
  },

  // Format question type
  formatQuestionType(type: string): { label: string; icon: string } {
    const typeMap = {
      'MULTIPLE_CHOICE': { label: 'Multiple Choice', icon: '📝' },
      'TRUE_FALSE': { label: 'True/False', icon: '✓✗' },
      'TEXT_INPUT': { label: 'Text Input', icon: '📄' },
    };
    return typeMap[type as keyof typeof typeMap] || { label: 'Unknown', icon: '❓' };
  },

  // Validate question form data
  validateQuestionForm(data: CreateQuestionRequest): string[] {
    const errors: string[] = [];
    
    if (!data.questionText?.trim()) {
      errors.push('Question text is required');
    }
    
    if (!data.categoryIds?.length) {
      errors.push('At least one category must be selected');
    }
    
    if (data.questionType === 'MULTIPLE_CHOICE') {
      if (!data.options?.options?.length || data.options.options.length < 2) {
        errors.push('Multiple choice questions must have at least 2 options');
      }
      
      const hasCorrectAnswer = data.options?.options?.some((opt: any) => 
        opt.text === data.correctAnswer
      );
      if (!hasCorrectAnswer) {
        errors.push('Correct answer must be one of the provided options');
      }
    }
    
    if (data.points < 1 || data.points > 100) {
      errors.push('Points must be between 1 and 100');
    }
    
    if (data.estimatedTime && (data.estimatedTime < 5 || data.estimatedTime > 300)) {
      errors.push('Estimated time must be between 5 and 300 seconds');
    }
    
    return errors;
  },

  // Format tags for display
  formatTags(tags: string[]): string {
    return tags.join(', ');
  },

  // Parse tags from string
  parseTags(tagString: string): string[] {
    return tagString
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  },
};

// Export download utility
export const exportUtils = {
  // Download JSON file
  downloadJson(data: any, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Read JSON file
  readJsonFile(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          resolve(data);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },
};
