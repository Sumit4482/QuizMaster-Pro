import {
  QuizConfiguration,
  QuizSessionResponse,
  QuizSessionSummary,
  QuizQuestion,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  DetailedQuizResult,
  UserStatisticsResponse,
  ApiResponse,
  PaginatedResponse,
  QuizSessionStatus,
} from '@/types/quiz';
import { getTokens } from '@/utils/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper function to get auth token using the same method as the main API
const getAuthToken = (): string | null => {
  const { accessToken } = getTokens();
  return accessToken;
};

// Helper function to make authenticated API requests
const apiRequest = async <T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/quiz${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: { code: 'NETWORK_ERROR', message: 'Network request failed' } 
      }));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Request Error:', error);
    throw error;
  }
};

// Quiz Session Management API
export const quizSessionApi = {
  /**
   * Create a new quiz session
   */
  createSession: async (config: QuizConfiguration): Promise<QuizSessionResponse> => {
    const response = await apiRequest<QuizSessionResponse>('/sessions', {
      method: 'POST',
      body: JSON.stringify(config),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create quiz session');
    }

    return response.data;
  },

  /**
   * Get quiz session details
   */
  getSession: async (sessionId: string): Promise<QuizSessionResponse> => {
    const response = await apiRequest<QuizSessionResponse>(`/sessions/${sessionId}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get quiz session');
    }

    return response.data;
  },

  /**
   * Start a quiz session
   */
  startSession: async (sessionId: string): Promise<QuizSessionResponse> => {
    const response = await apiRequest<QuizSessionResponse>(`/sessions/${sessionId}/start`, {
      method: 'POST',
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to start quiz session');
    }

    return response.data;
  },

  /**
   * Pause a quiz session
   */
  pauseSession: async (sessionId: string): Promise<QuizSessionResponse> => {
    const response = await apiRequest<QuizSessionResponse>(`/sessions/${sessionId}/pause`, {
      method: 'POST',
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to pause quiz session');
    }

    return response.data;
  },

  /**
   * Resume a quiz session
   */
  resumeSession: async (sessionId: string): Promise<QuizSessionResponse> => {
    const response = await apiRequest<QuizSessionResponse>(`/sessions/${sessionId}/resume`, {
      method: 'POST',
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to resume quiz session');
    }

    return response.data;
  },

  /**
   * Get user's quiz sessions
   */
  getUserSessions: async (options: {
    page?: number;
    limit?: number;
    status?: QuizSessionStatus[];
  } = {}): Promise<{
    sessions: QuizSessionSummary[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.status) {
      options.status.forEach(status => params.append('status', status));
    }

    const queryString = params.toString();
    const endpoint = `/sessions${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiRequest<{
      sessions: QuizSessionSummary[];
      total: number;
      page: number;
      limit: number;
    }>(endpoint);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get user sessions');
    }

    return response.data;
  },
};

// Quiz Gameplay API
export const quizGameplayApi = {
  /**
   * Get current question for a session
   */
  getCurrentQuestion: async (sessionId: string): Promise<QuizQuestion | null> => {
    const response = await apiRequest<QuizQuestion | null>(`/sessions/${sessionId}/current-question`);

    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to get current question');
    }

    return response.data || null;
  },

  /**
   * Submit an answer for the current question
   */
  submitAnswer: async (
    sessionId: string, 
    answerData: Omit<SubmitAnswerRequest, 'sessionId'>
  ): Promise<SubmitAnswerResponse> => {
    const response = await apiRequest<SubmitAnswerResponse>(`/sessions/${sessionId}/submit-answer`, {
      method: 'POST',
      body: JSON.stringify(answerData),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to submit answer');
    }

    return response.data;
  },
};

// Quiz Results API
export const quizResultsApi = {
  /**
   * Get quiz results
   */
  getQuizResults: async (sessionId: string): Promise<DetailedQuizResult> => {
    const response = await apiRequest<DetailedQuizResult>(`/sessions/${sessionId}/results`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get quiz results');
    }

    return response.data;
  },

  /**
   * Generate quiz results (force generation)
   */
  generateQuizResults: async (sessionId: string): Promise<DetailedQuizResult> => {
    const response = await apiRequest<DetailedQuizResult>(`/sessions/${sessionId}/generate-results`, {
      method: 'POST',
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to generate quiz results');
    }

    return response.data;
  },

  /**
   * Get user's quiz history
   */
  getQuizHistory: async (options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    results: Array<{
      id: string;
      sessionId: string;
      title?: string;
      totalQuestions: number;
      correctAnswers: number;
      totalScore: number;
      scorePercentage: number;
      accuracyRate: number;
      completedAt: string;
      achievements: string[];
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> => {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);

    const queryString = params.toString();
    const endpoint = `/history${queryString ? `?${queryString}` : ''}`;
    
    const response = await apiRequest<{
      results: Array<{
        id: string;
        sessionId: string;
        title?: string;
        totalQuestions: number;
        correctAnswers: number;
        totalScore: number;
        scorePercentage: number;
        accuracyRate: number;
        completedAt: string;
        achievements: string[];
      }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    }>(endpoint);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get quiz history');
    }

    return response.data;
  },
};

// User Statistics API
export const userStatisticsApi = {
  /**
   * Get user statistics
   */
  getUserStatistics: async (): Promise<UserStatisticsResponse> => {
    const response = await apiRequest<UserStatisticsResponse>('/statistics');

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to get user statistics');
    }

    return response.data;
  },
};

// Health Check API
export const quizHealthApi = {
  /**
   * Check quiz service health
   */
  healthCheck: async (): Promise<{
    status: string;
    timestamp: string;
    services: {
      quizSession: string;
      quizResults: string;
    };
  }> => {
    const response = await apiRequest<{
      status: string;
      timestamp: string;
      services: {
        quizSession: string;
        quizResults: string;
      };
    }>('/health');

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Health check failed');
    }

    return response.data;
  },
};

// Combined API object
export const quizApi = {
  sessions: quizSessionApi,
  gameplay: quizGameplayApi,
  results: quizResultsApi,
  statistics: userStatisticsApi,
  health: quizHealthApi,
};

// Error handling utilities
export class QuizApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'QuizApiError';
  }
}

export const handleApiError = (error: any): QuizApiError => {
  if (error instanceof QuizApiError) {
    return error;
  }

  if (error.message) {
    return new QuizApiError(error.message, error.code, error.details);
  }

  return new QuizApiError('An unexpected error occurred', 'UNKNOWN_ERROR', error);
};

// Utility functions
export const isQuizSessionActive = (session: QuizSessionResponse): boolean => {
  return ['CREATED', 'IN_PROGRESS', 'PAUSED'].includes(session.status);
};

export const canResumeSession = (session: QuizSessionResponse): boolean => {
  return session.status === 'PAUSED' && session.allowPause;
};

export const canPauseSession = (session: QuizSessionResponse): boolean => {
  return session.status === 'IN_PROGRESS' && session.allowPause;
};

export const isQuizCompleted = (session: QuizSessionResponse): boolean => {
  return session.status === 'COMPLETED' || 
         session.currentQuestionIndex >= session.totalQuestions;
};

export const calculateProgress = (session: QuizSessionResponse): number => {
  return Math.round((session.questionsAnswered / session.totalQuestions) * 100);
};

export default quizApi;
