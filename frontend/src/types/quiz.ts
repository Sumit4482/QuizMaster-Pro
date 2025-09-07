// Quiz Session Management Types

// Enums matching backend
export type QuizSessionStatus = 'CREATED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'EXPIRED' | 'ABANDONED';
export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'TEXT_INPUT';
export type DifficultyLevel = 1 | 2 | 3 | 4; // Easy, Medium, Hard, Expert

// Quiz Configuration Types
export interface QuizConfiguration {
  title?: string;
  description?: string;
  totalQuestions: number;
  timePerQuestion?: number; // seconds
  totalTimeLimit?: number; // seconds
  categoryIds: number[];
  difficultyLevels: DifficultyLevel[];
  questionTypes: QuestionType[];
  shuffleQuestions: boolean;
  allowPause: boolean;
  showExplanations: boolean;
}

export interface CreateQuizSessionRequest extends QuizConfiguration {
  // Additional fields for session creation if needed
}

export interface QuizSessionResponse {
  id: string;
  userId: string;
  title?: string;
  description?: string;
  totalQuestions: number;
  timePerQuestion?: number;
  totalTimeLimit?: number;
  categoryIds: number[];
  difficultyLevels: DifficultyLevel[];
  questionTypes: QuestionType[];
  shuffleQuestions: boolean;
  allowPause: boolean;
  showExplanations: boolean;
  status: QuizSessionStatus;
  currentQuestionIndex: number;
  questionsAnswered: number;
  correctAnswers: number;
  totalScore: number;
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  totalTimeTaken: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuizSessionSummary {
  id: string;
  title?: string;
  status: QuizSessionStatus;
  questionsAnswered: number;
  totalQuestions: number;
  correctAnswers: number;
  totalScore: number;
  progressPercentage: number;
  createdAt: string;
  updatedAt: string;
}

// Category types for quiz selection
export interface QuizCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  questionCount?: number;
}

// Question and Answer Types
export interface QuizQuestion {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: any;
  explanation?: string;
  hints?: any;
  difficultyLevel: DifficultyLevel;
  estimatedTime: number;
  points: number;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
}

export interface QuizAnswer {
  questionId: string;
  userAnswer: any;
  isCorrect?: boolean;
  timeTaken?: number;
  hintsUsed?: number;
}

export interface SubmitAnswerRequest {
  questionId: string;
  userAnswer: any;
  timeTaken: number;
  hintsUsed?: number;
  skipped?: boolean;
}

export interface SubmitAnswerResponse {
  isCorrect: boolean;
  pointsEarned: number;
  explanation?: string;
  correctAnswer?: any;
  scoring: {
    basePoints: number;
    timeBonus: number;
    streakBonus: number;
    difficultyBonus: number;
  };
  nextQuestion?: QuizQuestion;
  sessionProgress: {
    currentQuestionIndex: number;
    questionsAnswered: number;
    totalQuestions: number;
    totalScore: number;
    progressPercentage: number;
  };
}

// Timer Types
export interface TimerState {
  timeRemaining: number;
  isRunning: boolean;
  isPaused: boolean;
  startTime: number;
  endTime?: number;
  warnings: {
    halfTime: boolean;
    tenSeconds: boolean;
    fiveSeconds: boolean;
  };
}

export interface TimerConfig {
  duration: number; // in seconds
  showWarnings: boolean;
  autoSubmit: boolean;
}

// Quiz Results Types
export interface QuizResultSummary {
  id: string;
  sessionId: string;
  totalQuestions: number;
  questionsAnswered: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
  totalScore: number;
  maxPossibleScore: number;
  scorePercentage: number;
  totalTimeTaken: number;
  averageTimePerQuestion: number;
  accuracyRate: number;
  streakCount: number;
  timeEfficiency: number;
  completedAt: string;
  rank?: number;
  achievements: string[];
}

export interface DetailedQuizResult extends QuizResultSummary {
  categoryStats: CategoryPerformance[];
  difficultyStats: DifficultyPerformance[];
  questionTypeStats: QuestionTypePerformance[];
  questionResults: QuestionResult[];
}

export interface CategoryPerformance {
  categoryId: number;
  categoryName: string;
  questionsTotal: number;
  questionsCorrect: number;
  accuracyRate: number;
  averageScore: number;
  averageTime: number;
}

export interface DifficultyPerformance {
  difficultyLevel: DifficultyLevel;
  difficultyName: string;
  questionsTotal: number;
  questionsCorrect: number;
  accuracyRate: number;
  averageScore: number;
  averageTime: number;
}

export interface QuestionTypePerformance {
  questionType: QuestionType;
  questionsTotal: number;
  questionsCorrect: number;
  accuracyRate: number;
  averageScore: number;
  averageTime: number;
}

export interface QuestionResult {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  difficultyLevel: DifficultyLevel;
  categoryName: string;
  userAnswer: any;
  correctAnswer: any;
  isCorrect: boolean;
  timeTaken: number;
  pointsEarned: number;
  hintsUsed: number;
  skipped: boolean;
  explanation?: string;
}

// User Statistics Types
export interface UserStatisticsResponse {
  totalQuizzesCompleted: number;
  totalQuizzesStarted: number;
  completionRate: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  overallAccuracy: number;
  averageScore: number;
  totalTimeSpent: number;
  averageQuizTime: number;
  averageQuestionTime: number;
  bestScore: number;
  longestStreak: number;
  perfectQuizzes: number;
  strongestCategories: CategoryStrength[];
  weakestCategories: CategoryStrength[];
  lastQuizDate?: string;
  currentStreak: number;
  longestDailyStreak: number;
  experiencePoints: number;
  level: number;
  rank?: number;
}

export interface CategoryStrength {
  categoryId: number;
  categoryName: string;
  accuracyRate: number;
  averageScore: number;
  quizzesCompleted: number;
}

// UI State Types
export interface QuizSetupFormData {
  title: string;
  description: string;
  totalQuestions: number;
  timePerQuestion?: number;
  totalTimeLimit?: number;
  selectedCategories: number[];
  selectedDifficulties: DifficultyLevel[];
  selectedQuestionTypes: QuestionType[];
  shuffleQuestions: boolean;
  allowPause: boolean;
  showExplanations: boolean;
}

export interface QuizGameState {
  session: QuizSessionResponse | null;
  currentQuestion: QuizQuestion | null;
  userAnswers: QuizAnswer[];
  timer: TimerState;
  isLoading: boolean;
  error: string | null;
  gamePhase: 'setup' | 'playing' | 'paused' | 'results' | 'completed';
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Constants
export const DIFFICULTY_LEVELS = {
  EASY: 1 as DifficultyLevel,
  MEDIUM: 2 as DifficultyLevel,
  HARD: 3 as DifficultyLevel,
  EXPERT: 4 as DifficultyLevel,
} as const;

export const DIFFICULTY_NAMES = {
  [DIFFICULTY_LEVELS.EASY]: 'Easy',
  [DIFFICULTY_LEVELS.MEDIUM]: 'Medium',
  [DIFFICULTY_LEVELS.HARD]: 'Hard',
  [DIFFICULTY_LEVELS.EXPERT]: 'Expert',
} as const;

export const DIFFICULTY_COLORS = {
  [DIFFICULTY_LEVELS.EASY]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  [DIFFICULTY_LEVELS.MEDIUM]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  [DIFFICULTY_LEVELS.HARD]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  [DIFFICULTY_LEVELS.EXPERT]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
} as const;

export const QUESTION_TYPE_LABELS = {
  'MULTIPLE_CHOICE': 'Multiple Choice',
  'TRUE_FALSE': 'True/False',
  'TEXT_INPUT': 'Text Input',
} as const;

export const QUESTION_TYPE_ICONS = {
  'MULTIPLE_CHOICE': '📝',
  'TRUE_FALSE': '✓✗',
  'TEXT_INPUT': '📄',
} as const;

export const SESSION_STATUS_LABELS = {
  'CREATED': 'Ready to Start',
  'IN_PROGRESS': 'In Progress',
  'PAUSED': 'Paused',
  'COMPLETED': 'Completed',
  'EXPIRED': 'Expired',
  'ABANDONED': 'Abandoned',
} as const;

export const SESSION_STATUS_COLORS = {
  'CREATED': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'IN_PROGRESS': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'PAUSED': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'COMPLETED': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'EXPIRED': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'ABANDONED': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
} as const;

// Default Values
export const DEFAULT_QUIZ_SETUP: QuizSetupFormData = {
  title: '',
  description: '',
  totalQuestions: 10, // Fixed at 10 for simplicity
  timePerQuestion: 30, // 30 seconds per question
  selectedCategories: [],
  selectedDifficulties: [DIFFICULTY_LEVELS.EASY, DIFFICULTY_LEVELS.MEDIUM, DIFFICULTY_LEVELS.HARD], // Mixed difficulty
  selectedQuestionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'], // Popular question types
  shuffleQuestions: true,
  allowPause: true,
  showExplanations: true,
};

export const TIMER_WARNING_THRESHOLDS = {
  HALF_TIME: 0.5,
  TEN_SECONDS: 10,
  FIVE_SECONDS: 5,
} as const;

// Utility Functions
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export const formatPercentage = (value: number, precision: number = 1): string => {
  return `${value.toFixed(precision)}%`;
};

export const getDifficultyLabel = (level: DifficultyLevel): string => {
  return DIFFICULTY_NAMES[level] || 'Unknown';
};

export const getDifficultyColor = (level: DifficultyLevel): string => {
  return DIFFICULTY_COLORS[level] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
};

export const getQuestionTypeLabel = (type: QuestionType): string => {
  return QUESTION_TYPE_LABELS[type] || 'Unknown';
};

export const getQuestionTypeIcon = (type: QuestionType): string => {
  return QUESTION_TYPE_ICONS[type] || '❓';
};

export const getSessionStatusLabel = (status: QuizSessionStatus): string => {
  return SESSION_STATUS_LABELS[status] || 'Unknown';
};

export const getSessionStatusColor = (status: QuizSessionStatus): string => {
  return SESSION_STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
};

export const calculateScoreGrade = (percentage: number): { grade: string; color: string } => {
  if (percentage >= 90) return { grade: 'A', color: 'text-green-600' };
  if (percentage >= 80) return { grade: 'B', color: 'text-blue-600' };
  if (percentage >= 70) return { grade: 'C', color: 'text-yellow-600' };
  if (percentage >= 60) return { grade: 'D', color: 'text-orange-600' };
  return { grade: 'F', color: 'text-red-600' };
};

export const getAchievementIcon = (achievement: string): string => {
  const icons: Record<string, string> = {
    'perfect_score': '🏆',
    'flawless_victory': '💎',
    'excellence': '⭐',
    'high_achiever': '🎯',
    'streak_master': '🔥',
    'on_fire': '🚀',
    'speed_demon': '⚡',
    'quick_thinker': '💭',
    'marathon_runner': '🏃',
    'dedicated_learner': '📚',
  };
  return icons[achievement] || '🏅';
};

export const getAchievementName = (achievement: string): string => {
  const names: Record<string, string> = {
    'perfect_score': 'Perfect Score',
    'flawless_victory': 'Flawless Victory',
    'excellence': 'Excellence',
    'high_achiever': 'High Achiever',
    'streak_master': 'Streak Master',
    'on_fire': 'On Fire',
    'speed_demon': 'Speed Demon',
    'quick_thinker': 'Quick Thinker',
    'marathon_runner': 'Marathon Runner',
    'dedicated_learner': 'Dedicated Learner',
  };
  return names[achievement] || achievement.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};
