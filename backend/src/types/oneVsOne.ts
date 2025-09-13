/**
 * 1vs1 Game Types
 */

export interface OneVsOneMatchRequest {
  userId: string;
  useAI: boolean;
  aiTopic?: string;
  categoryIds?: number[];
  difficulty: number; // 1-3 (Easy, Medium, Hard)
  questionCount: number;
}

export interface OneVsOnePlayer {
  userId: string;
  username: string;
  socketId: string;
  isReady: boolean;
  isConnected: boolean;
  score: number;
  correctAnswers: number;
  currentAnswer?: string;
  answeredAt?: Date;
  timeToAnswer?: number; // milliseconds
}

export interface OneVsOneGame {
  id: string;
  player1: OneVsOnePlayer;
  player2: OneVsOnePlayer;
  questions: OneVsOneQuestion[];
  currentQuestionIndex: number;
  status: OneVsOneGameStatus;
  useAI: boolean;
  aiTopic?: string;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  winnerId?: string;
  settings: OneVsOneSettings;
}

export interface OneVsOneQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  difficulty: number;
  timeLimit: number; // seconds
  player1Answer?: string;
  player2Answer?: string;
  player1AnsweredAt?: Date;
  player2AnsweredAt?: Date;
}

export interface OneVsOneSettings {
  timePerQuestion: number; // seconds
  questionCount: number;
  allowHints: boolean;
  showExplanations: boolean;
}

export type OneVsOneGameStatus = 
  | 'WAITING_FOR_OPPONENT'
  | 'WAITING_FOR_READY'
  | 'STARTING'
  | 'IN_PROGRESS'
  | 'ROUND_COMPLETE'
  | 'FINISHED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface OneVsOneMatchResult {
  gameId: string;
  winnerId?: string;
  isDraw: boolean;
  player1Score: number;
  player2Score: number;
  totalQuestions: number;
  gameSettings: OneVsOneSettings;
  gameDuration: number; // seconds
}

// Socket Events
export interface OneVsOneEvents {
  // Client to Server
  'onevsone:find_match': OneVsOneMatchRequest;
  'onevsone:cancel_search': {};
  'onevsone:player_ready': {};
  'onevsone:submit_answer': { answer: string; timeToAnswer: number };
  'onevsone:leave_game': {};

  // Server to Client
  'onevsone:match_found': { gameId: string; opponent: Omit<OneVsOnePlayer, 'socketId'> };
  'onevsone:game_starting': { countdown: number };
  'onevsone:question': { question: Omit<OneVsOneQuestion, 'correctAnswer'>, questionIndex: number };
  'onevsone:round_result': { 
    correctAnswer: string;
    player1Answer?: string;
    player2Answer?: string;
    player1Correct: boolean;
    player2Correct: boolean;
    currentScores: { player1: number; player2: number };
  };
  'onevsone:game_finished': OneVsOneMatchResult;
  'onevsone:opponent_disconnected': {};
  'onevsone:game_cancelled': { reason: string };
}

