// Quiz Session Management Types

import { QuizSessionStatus as PrismaQuizSessionStatus, QuestionType } from '@prisma/client';

export { QuestionType } from '@prisma/client';
export type QuizSessionStatus = PrismaQuizSessionStatus;
export { QuizSessionStatus as PrismaQuizSessionStatus } from '@prisma/client';

// Quiz Configuration Types
export interface QuizConfiguration {
  title?: string;
  description?: string;
  totalQuestions: number;
  timePerQuestion?: number; // seconds
  totalTimeLimit?: number; // seconds
  categoryIds: number[];
  difficultyLevels: number[];
  questionTypes: QuestionType[];
  shuffleQuestions: boolean;
  allowPause: boolean;
  showExplanations: boolean;
}

export interface CreateQuizSessionRequest extends QuizConfiguration {
  // Additional fields for session creation
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
  difficultyLevels: number[];
  questionTypes: QuestionType[];
  shuffleQuestions: boolean;
  allowPause: boolean;
  showExplanations: boolean;
  status: QuizSessionStatus;
  currentQuestionIndex: number;
  questionsAnswered: number;
  correctAnswers: number;
  totalScore: number;
  startedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  totalTimeTaken: number;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

// Question and Answer Types
export interface QuizQuestion {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: any;
  explanation?: string;
  hints?: any;
  difficultyLevel: number;
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
  isCorrect?: boolean; // Only set after submission
  timeTaken?: number; // Only set after submission
  hintsUsed?: number;
}

export interface SubmitAnswerRequest {
  sessionId: string;
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

// Session Management Types
export interface StartSessionRequest {
  sessionId: string;
}

export interface PauseSessionRequest {
  sessionId: string;
}

export interface ResumeSessionRequest {
  sessionId: string;
}

export interface GetCurrentQuestionResponse {
  question: QuizQuestion;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining?: number; // for timed questions
  sessionTimeRemaining?: number; // for overall session limit
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
  completedAt: Date;
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
  difficultyLevel: number;
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
  difficultyLevel: number;
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
  lastQuizDate?: Date;
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

// Question Selection Types
export interface QuestionSelectionCriteria {
  categoryIds: number[];
  difficultyLevels: number[];
  questionTypes: QuestionType[];
  count: number;
  excludeRecentIds?: string[]; // Questions to avoid
  userId: string; // For personalized selection
}

export interface QuestionPool {
  questions: QuizQuestion[];
  totalAvailable: number;
  selectionMeta: {
    categoriesUsed: number[];
    difficultyDistribution: Record<number, number>;
    typeDistribution: Record<QuestionType, number>;
    averageDifficulty: number;
    estimatedTotalTime: number;
  };
}

// Scoring Types
export interface ScoringConfiguration {
  basePointsMultiplier: number;
  timeBonusEnabled: boolean;
  timeBonusMultiplier: number;
  streakBonusEnabled: boolean;
  streakBonusMultiplier: number;
  difficultyBonusEnabled: boolean;
  difficultyBonusMultiplier: number;
  penaltyForWrongAnswer: number;
}

export interface ScoreCalculation {
  basePoints: number;
  timeBonus: number;
  streakBonus: number;
  difficultyBonus: number;
  penalty: number;
  totalPoints: number;
}

// Error Types
export interface QuizError {
  code: string;
  message: string;
  details?: any;
}

// API Response Wrapper
export interface QuizApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: QuizError;
  meta?: {
    timestamp: Date;
    requestId?: string;
  };
}

// Search and Filter Types
export interface QuizSessionSearchParams {
  status?: QuizSessionStatus[];
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'totalScore' | 'completedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface QuizSessionSearchResponse {
  sessions: QuizSessionSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Timer and Progress Types
export interface TimerState {
  questionStartTime: Date;
  questionTimeLimit?: number;
  sessionStartTime: Date;
  sessionTimeLimit?: number;
  totalPausedTime: number;
  isPaused: boolean;
  lastPauseTime?: Date;
}

export interface ProgressState {
  currentQuestionIndex: number;
  totalQuestions: number;
  questionsAnswered: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
  totalScore: number;
  currentStreak: number;
  longestStreak: number;
}

// Achievement Types
export interface Achievement {
  id: string;
  name: string;
  description: string;
  condition: string;
  points: number;
  badge?: string;
}

export interface UserAchievement {
  achievementId: string;
  achievement: Achievement;
  earnedAt: Date;
  earnedInSessionId?: string;
}

// Constants and Enums
export const DIFFICULTY_LEVELS = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
  EXPERT: 4,
} as const;

export const DIFFICULTY_NAMES = {
  [DIFFICULTY_LEVELS.EASY]: 'Easy',
  [DIFFICULTY_LEVELS.MEDIUM]: 'Medium',
  [DIFFICULTY_LEVELS.HARD]: 'Hard',
  [DIFFICULTY_LEVELS.EXPERT]: 'Expert',
} as const;

export const DEFAULT_SCORING_CONFIG: ScoringConfiguration = {
  basePointsMultiplier: 1.0,
  timeBonusEnabled: true,
  timeBonusMultiplier: 0.5,
  streakBonusEnabled: true,
  streakBonusMultiplier: 0.2,
  difficultyBonusEnabled: true,
  difficultyBonusMultiplier: 0.3,
  penaltyForWrongAnswer: 0,
};

export const SESSION_EXPIRY_HOURS = 24; // Sessions expire after 24 hours
export const MAX_CONCURRENT_SESSIONS = 20; // Maximum concurrent sessions per user (increased for development)
export const MIN_QUESTIONS_PER_QUIZ = 1;
export const MAX_QUESTIONS_PER_QUIZ = 100;
export const MIN_TIME_PER_QUESTION = 5; // seconds
export const MAX_TIME_PER_QUESTION = 300; // 5 minutes
export const MAX_SESSION_TIME = 7200; // 2 hours
