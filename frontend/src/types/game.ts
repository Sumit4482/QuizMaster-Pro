import { QuestionType } from './question';

// Game status types
export type GameStatus = 
  | 'WAITING' 
  | 'STARTING'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'QUESTION_BREAK'
  | 'FINISHED'
  | 'CANCELLED';

export type PlayerStatus = 
  | 'WAITING'
  | 'READY'
  | 'PLAYING'
  | 'SPECTATING'
  | 'DISCONNECTED';

// Game configuration interface
export interface GameConfig {
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
  // AI-related properties
  useAI?: boolean;
  aiTopic?: string;
  aiQuestions?: any[]; // Generated AI questions
}

// Game state interface
export interface GameState {
  gameId: string;
  roomId: string;
  status: GameStatus;
  startedAt?: Date;
  endedAt?: Date;
  
  // Question management
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion?: GameQuestion;
  questionStartedAt?: Date;
  questionEndsAt?: Date;
  
  // Players and scoring
  players: GamePlayer[];
  playerCount: number;
  playersReady: number;
  leaderboard: LeaderboardEntry[];
  
  // Timing
  masterTimer: GameTimer;
  
  // Settings
  config: GameConfig;
  settings: GameSettings;
  
  // Meta
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

// Game question for frontend display
export interface GameQuestion {
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
  
  // Game-specific timing
  questionIndex: number;
  timeLimit: number;
  startsAt?: Date;
  endsAt?: Date;
  
  // Progress tracking
  answeredCount: number;
  totalPlayers: number;
}

// Player in game
export interface GamePlayer {
  userId: string;
  username: string;
  status: PlayerStatus;
  
  // Game performance
  score: number;
  rank: number;
  accuracy: number;
  averageTime: number;
  
  // Current status
  currentStreak: number;
  bestStreak: number;
  questionsAnswered: number;
  correctAnswers: number;
  
  // Connection
  isHost: boolean;
  isOnline: boolean;
  canAnswer: boolean;
  lastActivity: Date;
  latency?: number;
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

// Game timer
export interface GameTimer {
  timeRemaining: number;
  duration: number;
  isRunning: boolean;
  isPaused: boolean;
  serverTime: number;
  warnings: number[];
}

// Game settings
export interface GameSettings {
  hostCanSkip: boolean;
  hostCanPause: boolean;
  hostCanExtendTime: boolean;
  showLiveScores: boolean;
  showAnswerBreakdown: boolean;
  allowLateJoining: boolean;
  allowReconnection: boolean;
  allowSpectators: boolean;
  questionBreakDuration: number;
  gracePeriodsMs: number;
}

// Answer submission
export interface AnswerSubmission {
  questionId: string;
  questionIndex: number;
  answer: any;
  submittedAt: Date;
  timeTaken: number;
  confidence?: number;
}

// Answer result
export interface AnswerResult {
  questionId: string;
  questionIndex: number;
  isCorrect: boolean;
  pointsEarned: number;
  timeBonus: number;
  streakBonus: number;
  submittedAt: Date;
  currentScore: number;
  currentStreak: number;
}

// Question result after reveal
export interface QuestionResult {
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

// Game events
export interface GameEvent {
  type: string;
  gameId: string;
  roomId: string;
  data: any;
  timestamp: Date;
  version: number;
}

// Host actions
export type HostAction = 
  | 'skip_question'
  | 'pause_game'
  | 'resume_game'
  | 'extend_time'
  | 'end_game';

export interface HostActionData {
  action: HostAction;
  data?: any;
}

// Game result
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
  questionResults: Array<{
    questionId: string;
    questionIndex: number;
    correctAnswerRate: number;
    averageTime: number;
    fastestAnswer: number;
    slowestAnswer: number;
  }>;
}

// Game statistics
export interface GameStats {
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
  averageResponseTime: number;
  completionRate: number;
  activePlayers: number;
  spectators: number;
  disconnections: number;
  reconnections: number;
  averageLatency: number;
}

// Time sync
export interface TimeSync {
  serverTime: number;
  clientTime: number;
  offset: number;
  roundTripTime: number;
  lastSync: Date;
}

// Connection quality
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface ConnectionInfo {
  quality: ConnectionQuality;
  latency: number;
  lastPing: Date;
  syncOffset: number;
}

// Error types
export class GameError extends Error {
  public code: string;
  public gameId?: string | undefined;
  
  constructor(code: string, message: string, gameId?: string | undefined) {
    super(message);
    this.code = code;
    this.gameId = gameId;
    this.name = 'GameError';
  }
}

// UI state types
export interface WaitingRoomState {
  players: GamePlayer[];
  isHost: boolean;
  canStart: boolean;
  minPlayers: number;
  maxPlayers: number;
}

export interface LiveGameState {
  currentQuestion: GameQuestion;
  timeRemaining: number;
  hasAnswered: boolean;
  selectedAnswer: any;
  showResults: boolean;
  questionResult?: QuestionResult;
}

export interface GameEndState {
  finalResults: GameResult;
  playerRank: number;
  playerScore: number;
  totalPlayers: number;
}

// Form types for game creation
export interface StartGameForm {
  totalQuestions: number;
  categories: number[];
  difficultyLevels: number[];
  questionTypes: QuestionType[];
  timePerQuestion: number;
  allowHints: boolean;
  showExplanations: boolean;
  timeBonusEnabled: boolean;
  streakBonusEnabled: boolean;
}

// Socket event payloads
export interface StartGamePayload {
  roomId: string;
  quizConfig: Partial<GameConfig>;
}

export interface JoinGamePayload {
  roomId: string;
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
  action: HostAction;
  data?: any;
}

export interface GetGameStatePayload {
  roomId: string;
}

export interface GameSyncPayload {
  clientTime: number;
}

export interface GamePingPayload {
  timestamp: number;
}

// Response types
export interface GameResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}
