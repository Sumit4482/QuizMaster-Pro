import { QuestionType } from '@prisma/client';

// Game state enums
export enum GameStatus {
  WAITING = 'WAITING',
  STARTING = 'STARTING', 
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  QUESTION_BREAK = 'QUESTION_BREAK',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED'
}

export enum PlayerStatus {
  WAITING = 'WAITING',
  READY = 'READY',
  PLAYING = 'PLAYING',
  SPECTATING = 'SPECTATING',
  DISCONNECTED = 'DISCONNECTED'
}

// Enhanced game state interface
export interface GameState {
  // Basic game info
  id: string;
  roomId: string;
  status: GameStatus;
  startedAt?: Date;
  endedAt?: Date;
  pausedAt?: Date;
  
  // Quiz configuration
  quizConfig: GameQuizConfig;
  
  // Question management
  questions: GameQuestion[];
  currentQuestionIndex: number;
  currentQuestion?: GameQuestion;
  questionStartedAt?: Date;
  questionEndsAt?: Date;
  
  // Player management
  players: Map<string, GamePlayer>;
  playerCount: number;
  playersReady: number;
  
  // Timing and flow
  masterTimer: GameTimer;
  roundNumber: number;
  totalRounds: number;
  
  // Scoring
  leaderboard: LeaderboardEntry[];
  
  // Game settings and rules
  settings: GameSettings;
  
  // State tracking
  createdAt: Date;
  updatedAt: Date;
  version: number; // For optimistic updates
}

// Game configuration for quiz
export interface GameQuizConfig {
  totalQuestions: number;
  categories: number[];
  difficultyLevels: number[];
  questionTypes: QuestionType[];
  timePerQuestion: number;
  totalTimeLimit?: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showExplanations: boolean;
  allowHints: boolean;
  pointsPerQuestion: number;
  timeBonusEnabled: boolean;
  streakBonusEnabled: boolean;
}

// Enhanced question structure for multiplayer
export interface GameQuestion {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: any;
  correctAnswer: any;
  explanation?: string;
  hints?: any;
  difficultyLevel: number;
  estimatedTime: number;
  points: number;
  categories: Array<{ id: number; name: string; slug: string }>;
  
  // Game-specific fields
  questionIndex: number;
  timeLimit: number;
  startedAt?: Date;
  endsAt?: Date;
  
  // Answer tracking
  playerAnswers: Map<string, PlayerAnswer>;
  answeredCount: number;
  correctCount: number;
}

// Enhanced player structure for games
export interface GamePlayer {
  // Basic info
  userId: string;
  username: string;
  socketId: string;
  
  // Game state
  status: PlayerStatus;
  joinedAt: Date;
  readyAt?: Date;
  lastActivity: Date;
  
  // Game performance
  score: number;
  rank: number;
  
  // Question tracking
  answers: Map<number, PlayerAnswer>;
  currentStreak: number;
  bestStreak: number;
  questionsAnswered: number;
  correctAnswers: number;
  
  // Timing stats
  averageResponseTime: number;
  totalTimeTaken: number;
  
  // Bonuses and penalties
  timeBonuses: number;
  streakBonuses: number;
  hintsUsed: number;
  
  // Connection quality
  latency: number;
  lastPing: Date;
  
  // Permissions
  canAnswer: boolean;
  canChat: boolean;
  isHost: boolean;
}

// Player answer structure
export interface PlayerAnswer {
  questionId: string;
  questionIndex: number;
  userAnswer: any;
  isCorrect: boolean;
  submittedAt: Date;
  timeTaken: number; // milliseconds
  pointsEarned: number;
  timeBonus: number;
  streakBonus: number;
  hintsUsed: number;
  confidence?: number; // Optional confidence level
}

// Leaderboard entry
export interface LeaderboardEntry {
  userId: string;
  username: string;
  score: number;
  rank: number;
  accuracy: number;
  averageTime: number;
  streak: number;
  questionsAnswered: number;
  lastActivity: Date;
}

// Game timer for synchronization
export interface GameTimer {
  startTime: Date;
  duration: number; // milliseconds
  timeRemaining: number;
  isRunning: boolean;
  isPaused: boolean;
  pausedAt?: Date;
  resumedAt?: Date;
  warnings: number[]; // Warning timestamps in milliseconds
  serverTime: number; // Current server timestamp
}

// Game settings
export interface GameSettings {
  // Host controls
  hostCanSkip: boolean;
  hostCanPause: boolean;
  hostCanExtendTime: boolean;
  hostCanRemovePlayers: boolean;
  
  // Player management
  allowLateJoining: boolean;
  allowReconnection: boolean;
  allowSpectators: boolean;
  maxSpectators: number;
  requireReadyCheck: boolean;
  
  // Gameplay settings
  showLiveScores: boolean;
  showAnswerBreakdown: boolean;
  allowAnswerChange: boolean;
  gracePeriodsMs: number;
  autoProgressEnabled: boolean;
  questionBreakDuration: number;
  
  // Fairness settings
  networkLatencyCompensation: boolean;
  maxLatencyMs: number;
  timeoutHandling: 'strict' | 'lenient' | 'adaptive';
}

// Event payload types for game actions
export interface StartGamePayload {
  roomId: string;
  quizConfig: Partial<GameQuizConfig>;
}

export interface AnswerSubmissionPayload {
  roomId: string;
  questionId: string;
  questionIndex: number;
  answer: any;
  submittedAt: Date;
  timeTaken: number;
  confidence?: number;
}

export interface PlayerReadyPayload {
  roomId: string;
  isReady: boolean;
}

export interface HostActionPayload {
  roomId: string;
  action: 'skip_question' | 'pause_game' | 'resume_game' | 'extend_time' | 'end_game';
  data?: any;
}

export interface GameEventPayload {
  roomId: string;
  eventType: string;
  data: any;
  timestamp: Date;
}

// Real-time sync events
export interface GameSyncEvent {
  type: 'game_state' | 'question_start' | 'question_started' | 'question_end' | 'timer_sync' | 'timer_started' | 'score_update' | 'leaderboard_update' | 'player_answered';
  gameId: string;
  roomId: string;
  data: any;
  timestamp: Date;
  version: number;
}

// Question broadcasting events
export interface QuestionBroadcast {
  questionId: string;
  questionIndex: number;
  questionData: Omit<GameQuestion, 'correctAnswer' | 'playerAnswers'>; // Hide correct answer from clients
  timeLimit: number;
  startsAt: Date;
  endsAt: Date;
  serverTime: Date;
}

export interface AnswerReveal {
  questionId: string;
  questionIndex: number;
  correctAnswer: any;
  explanation?: string;
  answerBreakdown: {
    [answer: string]: {
      count: number;
      percentage: number;
      isCorrect: boolean;
    };
  };
  playerResults: Array<{
    userId: string;
    username: string;
    isCorrect: boolean;
    timeTaken: number;
    pointsEarned: number;
  }>;
}

// Network and synchronization types
export interface ClientTimestamp {
  clientTime: number;
  serverTime: number;
  roundTripTime: number;
  offset: number;
}

export interface LatencyInfo {
  userId: string;
  averageLatency: number;
  lastPing: Date;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

// Game result types
export interface GameResult {
  gameId: string;
  roomId: string;
  startedAt: Date;
  endedAt: Date;
  totalDuration: number;
  questionCount: number;
  playerCount: number;
  
  finalLeaderboard: LeaderboardEntry[];
  gameStats: GameStats;
  
  // Per-question results
  questionResults: Array<{
    questionId: string;
    questionIndex: number;
    correctAnswerRate: number;
    averageTime: number;
    fastestAnswer: number;
    slowestAnswer: number;
  }>;
}

export interface GameStats {
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
  averageResponseTime: number;
  completionRate: number;
  
  // Engagement metrics
  activePlayers: number;
  spectators: number;
  disconnections: number;
  reconnections: number;
  
  // Performance metrics
  averageLatency: number;
  syncIssues: number;
  errorRate: number;
}

// Error types specific to game mechanics
export class GameError extends Error {
  public code: string;
  public gameId?: string;
  public playerId?: string;
  
  constructor(code: string, message: string, gameId?: string, playerId?: string) {
    super(message);
    this.code = code;
    this.gameId = gameId;
    this.playerId = playerId;
    this.name = 'GameError';
  }
}

// Validation schemas for game events
export interface GameEventValidation {
  startGame: {
    quizConfig: {
      totalQuestions: { min: 1; max: 100 };
      timePerQuestion: { min: 5; max: 300 };
      categories: { type: 'array'; minItems: 1 };
    };
  };
  
  answerSubmission: {
    answer: { required: true };
    timeTaken: { min: 0; max: 600000 }; // Max 10 minutes
    submittedAt: { type: 'date'; required: true };
  };
  
  hostAction: {
    action: { 
      enum: ['skip_question', 'pause_game', 'resume_game', 'extend_time', 'end_game'];
      required: true;
    };
  };
}
