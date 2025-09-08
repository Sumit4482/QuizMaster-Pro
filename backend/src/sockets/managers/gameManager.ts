import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { prisma } from '@/config/database';
import { roomManager } from './roomManager';
import { QuestionType } from '@prisma/client';
import {
  GameState,
  GameStatus,
  PlayerStatus,
  GameQuestion,
  GamePlayer,
  GameQuizConfig,
  GameSettings,
  GameTimer,
  PlayerAnswer,
  LeaderboardEntry,
  StartGamePayload,
  AnswerSubmissionPayload,
  QuestionBroadcast,
  AnswerReveal,
  GameResult,
  GameError,
  GameSyncEvent
} from '../types/game';
import { ScoreCalculation } from '@/types/quiz';
import { RoomState } from '../types/socket';
import { GameStateSyncService } from '@/services/gameStateSyncService';
import { QuestionBroadcastService } from '@/services/questionBroadcastService';
import { RealtimeScoringService } from '@/services/realtimeScoringService';
import { TimerSyncService } from '@/services/timerSyncService';

export class GameManager extends EventEmitter {
  private static instance: GameManager | null = null;
  private games: Map<string, GameState> = new Map();
  private roomToGameMap: Map<string, string> = new Map();
  private playerToGameMap: Map<string, string> = new Map();
  private gameTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Enhanced services for Phase 2.2
  private gameStateSync!: GameStateSyncService;
  private questionBroadcast!: QuestionBroadcastService;
  private realtimeScoring!: RealtimeScoringService;
  private timerSync!: TimerSyncService;

  private constructor(private io: Server) {
    super();
    this.initializeEnhancedServices();
  }

  public static getInstance(io?: Server): GameManager {
    if (!GameManager.instance) {
      if (!io) {
        throw new Error('Socket.io instance required for first initialization');
      }
      GameManager.instance = new GameManager(io);
    }
    return GameManager.instance;
  }

  /**
   * Initialize enhanced Phase 2.2 services
   */
  private initializeEnhancedServices(): void {
    this.gameStateSync = GameStateSyncService.getInstance(this.io);
    this.questionBroadcast = QuestionBroadcastService.getInstance(this.io, this.gameStateSync);
    this.realtimeScoring = RealtimeScoringService.getInstance(this.io, this.gameStateSync);
    this.timerSync = TimerSyncService.getInstance(this.io, this.gameStateSync);

    // Setup service event listeners
    this.setupServiceEventListeners();

    logger.info('Enhanced multiplayer services initialized');
  }

  /**
   * Setup event listeners for enhanced services
   */
  private setupServiceEventListeners(): void {
    // Question broadcast events
    this.questionBroadcast.on('answer:submitted', ({ gameId, playerId, answer }) => {
      this.handleAnswerSubmission(gameId, playerId, answer);
    });

    this.questionBroadcast.on('answer:revealed', ({ gameId, questionId, reveal }) => {
      this.handleAnswerReveal(gameId, reveal);
    });

    // Scoring events
    this.realtimeScoring.on('score:updated', ({ gameId, playerId, scoreCalculation }) => {
      this.handleScoreUpdate(gameId, playerId, scoreCalculation);
    });

    // Timer events
    this.timerSync.on('timer:completed', ({ timerId, timer }) => {
      this.handleTimerCompletion(timerId, timer);
    });

    // State sync events
    this.gameStateSync.on('state:updated', ({ gameId, state }) => {
      this.handleStateUpdate(gameId, state);
    });
  }

  // ====================
  // GAME LIFECYCLE
  // ====================

  /**
   * Start a new multiplayer game with enhanced Phase 2.2 features
   */
  public async startGame(roomId: string, hostUserId: string, config: Partial<GameQuizConfig>): Promise<GameState> {
    try {
      // Validate room exists and host has permission
      if (this.roomToGameMap.has(roomId)) {
        throw new GameError('GAME_ALREADY_ACTIVE', 'A game is already active in this room', undefined, hostUserId);
      }

      // Create game configuration with defaults
      const gameConfig: GameQuizConfig = {
        totalQuestions: config.totalQuestions || 10,
        categories: config.categories || [],
        difficultyLevels: config.difficultyLevels || [1, 2, 3],
        questionTypes: config.questionTypes || [QuestionType.MULTIPLE_CHOICE],
        timePerQuestion: config.timePerQuestion || 30,
        shuffleQuestions: config.shuffleQuestions ?? true,
        shuffleAnswers: config.shuffleAnswers ?? true,
        showExplanations: config.showExplanations ?? true,
        allowHints: config.allowHints ?? false,
        pointsPerQuestion: config.pointsPerQuestion || 100,
        timeBonusEnabled: config.timeBonusEnabled ?? true,
        streakBonusEnabled: config.streakBonusEnabled ?? true
      };

      // Fetch questions for the game (AI or database)
      const questions = await this.generateGameQuestions(gameConfig, config);

      // Create game state
      const gameState: GameState = {
        id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        roomId,
        status: GameStatus.STARTING,
        startedAt: new Date(),
        quizConfig: gameConfig,
        questions,
        currentQuestionIndex: -1,
        players: new Map(),
        playerCount: 0,
        playersReady: 0,
        masterTimer: this.createTimer(0),
        roundNumber: 1,
        totalRounds: 1,
        leaderboard: [],
        settings: this.getDefaultGameSettings(),
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1
      };

      // Store game state locally
      this.games.set(gameState.id, gameState);
      this.roomToGameMap.set(roomId, gameState.id);

      // Register with enhanced state sync service
      this.gameStateSync.registerGameState(gameState);

      // Initialize scoring system
      this.realtimeScoring.initializeGameScoring(gameState.id, {
        basePointsMultiplier: 1.0,
        timeBonusEnabled: gameConfig.timeBonusEnabled,
        streakBonusEnabled: gameConfig.streakBonusEnabled,
        difficultyBonusEnabled: true,
        penaltyForWrongAnswer: 0,
        perfectGameBonus: 1000,
        speedBonus: true
      });

      logger.info('Enhanced multiplayer game started', {
        gameId: gameState.id,
        roomId,
        hostUserId,
        questionCount: questions.length,
        config: gameConfig
      });

      // Update room status to IN_PROGRESS
      roomManager.updateRoomStatus(roomId, 'IN_PROGRESS', gameState.id);

      // Broadcast game start with enhanced synchronization
      this.broadcastGameEvent(gameState.id, 'game_started', {
        gameId: gameState.id,
        roomId: gameState.roomId,
        config: gameConfig,
        questionCount: questions.length,
        status: gameState.status,
        serverTime: new Date(),
        version: gameState.version,
        // Include complete game state for frontend initialization
        gameState: {
          id: gameState.id,
          roomId: gameState.roomId,
          status: gameState.status,
          startedAt: gameState.startedAt,
          questions: gameState.questions.map(q => ({
            ...q,
            correctAnswer: undefined, // Don't send correct answer to frontend
            explanation: undefined // Don't send explanation initially
          })),
          currentQuestionIndex: gameState.currentQuestionIndex,
          players: Array.from(gameState.players.entries()).map(([userId, player]) => ({
            ...player,
            // Ensure all required fields are included with defaults
            status: player.status || 'WAITING',
            joinedAt: player.joinedAt || new Date(),
            score: player.score || 0,
            rank: player.rank || 0,
            averageResponseTime: player.averageResponseTime || 0,
            totalTimeTaken: player.totalTimeTaken || 0,
            currentStreak: player.currentStreak || 0,
            bestStreak: player.bestStreak || 0,
            questionsAnswered: player.questionsAnswered || 0,
            correctAnswers: player.correctAnswers || 0,
            answers: Array.from(player.answers?.entries() || []),
            timeBonuses: player.timeBonuses || 0,
            streakBonuses: player.streakBonuses || 0,
            hintsUsed: player.hintsUsed || 0,
            latency: player.latency || 0,
            lastPing: player.lastPing || new Date(),
            isHost: player.isHost || false,
            canAnswer: player.canAnswer !== false, // Default to true
            canChat: player.canChat !== false, // Default to true
            lastActivity: player.lastActivity || new Date()
          })),
          leaderboard: gameState.leaderboard || [],
          settings: gameState.settings
        }
      });

      this.emit('game:started', gameState);
      return gameState;

    } catch (error) {
      logger.error('Failed to start enhanced game', { roomId, hostUserId, error });
      throw error instanceof GameError ? error : new GameError('GAME_START_FAILED', 'Failed to start game', undefined, hostUserId);
    }
  }

  /**
   * Add player to active game
   */
  public addPlayerToGame(gameId: string, userId: string, username: string, socketId: string): GamePlayer {
    const game = this.games.get(gameId);
    if (!game) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId, userId);
    }

    if (game.status !== GameStatus.WAITING && game.status !== GameStatus.STARTING) {
      if (!game.settings.allowLateJoining) {
        throw new GameError('GAME_IN_PROGRESS', 'Cannot join game in progress', gameId, userId);
      }
    }

    const player: GamePlayer = {
      userId,
      username,
      socketId,
      status: PlayerStatus.WAITING,
      joinedAt: new Date(),
      lastActivity: new Date(),
      score: 0,
      rank: 0,
      answers: new Map(),
      currentStreak: 0,
      bestStreak: 0,
      questionsAnswered: 0,
      correctAnswers: 0,
      averageResponseTime: 0,
      totalTimeTaken: 0,
      timeBonuses: 0,
      streakBonuses: 0,
      hintsUsed: 0,
      latency: 0,
      lastPing: new Date(),
      canAnswer: true,
      canChat: true,
      isHost: game.players.size === 0
    };

    game.players.set(userId, player);
    game.playerCount = game.players.size;
    this.playerToGameMap.set(userId, gameId);

    // Update game state through sync service
    this.gameStateSync.updateGameState(gameId, {
      players: game.players,
      playerCount: game.playerCount
    });
    
    this.updateLeaderboard(gameId);

    logger.info('Player added to game', { gameId, userId, username, playerCount: game.playerCount });

    // Broadcast player joined
    this.broadcastGameEvent(gameId, 'player_joined', {
      player: this.sanitizePlayerForBroadcast(player),
      playerCount: game.playerCount
    });

    return player;
  }



  // ====================
  // QUESTION FLOW
  // ====================

  /**
   * Start next question with enhanced broadcasting and synchronization
   */
  public async startNextQuestion(gameId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId);
    }

    game.currentQuestionIndex++;
    
    // Check if game should end
    if (game.currentQuestionIndex >= game.questions.length) {
      await this.endGame(gameId, 'completed');
      return;
    }

    const question = game.questions[game.currentQuestionIndex];
    const timeLimit = game.quizConfig.timePerQuestion; // In seconds
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + timeLimit * 1000);

    // Update question timing
    question.startedAt = startTime;
    question.endsAt = endTime;
    question.timeLimit = timeLimit * 1000;

    // Update game state through sync service
    const updatedState = this.gameStateSync.updateGameState(gameId, {
      currentQuestion: question,
      questionStartedAt: startTime,
      questionEndsAt: endTime,
      status: GameStatus.IN_PROGRESS,
      currentQuestionIndex: game.currentQuestionIndex
    });

    // Create synchronized timer
    const timerId = this.timerSync.createTimer(
      gameId,
      'question',
      timeLimit,
      [Math.floor(timeLimit * 0.75), Math.floor(timeLimit * 0.5), Math.floor(timeLimit * 0.25), 10, 5, 3, 1]
    );

    // Preload next question if available
    if (game.currentQuestionIndex + 1 < game.questions.length) {
      const nextQuestion = game.questions[game.currentQuestionIndex + 1];
      this.questionBroadcast.preloadNextQuestion(gameId, nextQuestion);
    }

    // Broadcast question using enhanced service
    const generatedQuestionId = await this.questionBroadcast.broadcastQuestion(
      gameId,
      question,
      timeLimit
    );

    // Also broadcast question started event to the room
    this.broadcastGameEvent(gameId, 'question_started', {
      questionId: generatedQuestionId,
      questionIndex: game.currentQuestionIndex,
      questionData: {
        ...question,
        id: generatedQuestionId, // Use the same generated ID
        correctAnswer: undefined, // Don't send correct answer
        explanation: undefined // Don't send explanation initially  
      },
      timeLimit,
      startTime,
      endTime,
      serverTime: new Date()
    });

    logger.info('Enhanced question started', { 
      gameId, 
      questionIndex: game.currentQuestionIndex, 
      questionId: generatedQuestionId,
      originalQuestionId: question.id,
      timeLimit,
      timerId
    });

    this.emit('question:started', { gameId, question, timerId });
  }

  /**
   * End current question and reveal answers
   */
  public async endQuestion(gameId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (!game || !game.currentQuestion) return;

    // Update game state through sync service
    this.gameStateSync.updateGameState(gameId, {
      status: GameStatus.QUESTION_BREAK
    });

    const question = game.currentQuestion;
    
    // Calculate answer breakdown
    const answerBreakdown: Record<string, any> = {};
    const playerResults: any[] = [];

    question.playerAnswers.forEach((answer, userId) => {
      const player = game.players.get(userId);
      if (!player) return;

      // Track answer for breakdown
      const answerKey = JSON.stringify(answer.userAnswer);
      if (!answerBreakdown[answerKey]) {
        answerBreakdown[answerKey] = {
          count: 0,
          percentage: 0,
          isCorrect: answer.isCorrect
        };
      }
      answerBreakdown[answerKey].count++;

      // Add to player results
      playerResults.push({
        userId,
        username: player.username,
        isCorrect: answer.isCorrect,
        timeTaken: answer.timeTaken,
        pointsEarned: answer.pointsEarned
      });
    });

    // Calculate percentages
    const totalAnswers = question.answeredCount;
    Object.values(answerBreakdown).forEach((data: any) => {
      data.percentage = totalAnswers > 0 ? (data.count / totalAnswers) * 100 : 0;
    });

    // Create answer reveal
    const answerReveal: AnswerReveal = {
      questionId: question.id,
      questionIndex: question.questionIndex,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      answerBreakdown,
      playerResults
    };

    logger.info('Question ended', { 
      gameId, 
      questionIndex: game.currentQuestionIndex,
      answeredCount: totalAnswers,
      correctCount: question.correctCount
    });

    // Broadcast answer reveal
    this.broadcastGameEvent(gameId, 'question_ended', answerReveal);

    // Update leaderboard
    this.updateLeaderboard(gameId);
    this.broadcastLeaderboard(gameId);

    // Clear question timer
    const questionTimer = this.gameTimers.get(`${gameId}_question`);
    if (questionTimer) {
      clearTimeout(questionTimer);
      this.gameTimers.delete(`${gameId}_question`);
    }

    // Set timer for next question
    const breakDuration = game.settings.questionBreakDuration * 1000;
    const breakTimer = setTimeout(() => {
      if (game.status === GameStatus.QUESTION_BREAK) {
        this.startNextQuestion(gameId);
      }
    }, breakDuration);

    this.gameTimers.set(`${gameId}_break`, breakTimer);
  }

  // ====================
  // ANSWER HANDLING
  // ====================

  /**
   * Process player answer submission with enhanced services
   */
  public async submitAnswer(gameId: string, userId: string, payload: AnswerSubmissionPayload): Promise<PlayerAnswer> {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId, userId);
    }

    if (gameState.status !== GameStatus.IN_PROGRESS) {
      throw new GameError('INVALID_GAME_STATE', 'Game is not accepting answers', gameId, userId);
    }

    if (!gameState.currentQuestion) {
      throw new GameError('NO_ACTIVE_QUESTION', 'No active question', gameId, userId);
    }

    // Process answer through enhanced question broadcast service
    const answer = await this.questionBroadcast.processAnswerSubmission(
      gameId,
      payload.questionId,
      userId,
      payload.answer,
      new Date(payload.submittedAt),
      payload.timeTaken
    );

    if (!answer) {
      throw new GameError('ANSWER_PROCESSING_FAILED', 'Failed to process answer', gameId, userId);
    }

    logger.info('Enhanced answer submitted', {
      gameId,
      userId,
      questionId: payload.questionId,
      isCorrect: answer.isCorrect,
      timeTaken: answer.timeTaken
    });

    // Let services handle the rest through event system
    return answer;
  }

  // ====================
  // SERVICE EVENT HANDLERS
  // ====================

  /**
   * Handle answer submission events from question broadcast service
   */
  private handleAnswerSubmission(gameId: string, playerId: string, answer: PlayerAnswer): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState || !gameState.currentQuestion) return;

    const player = gameState.players.get(playerId);
    if (!player) return;

    // Calculate score using enhanced scoring service
    const scoreCalculation = this.realtimeScoring.calculateScore(
      gameId,
      playerId,
      answer,
      gameState.currentQuestion.difficultyLevel,
      gameState.quizConfig.timePerQuestion * 1000,
      player.currentStreak
    );

    // Update player score through scoring service
    this.realtimeScoring.updatePlayerScore(gameId, playerId, answer, scoreCalculation);
  }

  /**
   * Handle answer reveal events from question broadcast service
   */
  private handleAnswerReveal(gameId: string, reveal: AnswerReveal): void {
    // Update game state to question break
    this.gameStateSync.updateGameState(gameId, {
      status: GameStatus.QUESTION_BREAK
    });

    // Schedule next question start
    const gameState = this.gameStateSync.getGameState(gameId);
    if (gameState && gameState.settings.autoProgressEnabled) {
      const breakDuration = gameState.settings.questionBreakDuration * 1000;
      
      setTimeout(() => {
        this.startNextQuestion(gameId).catch(error => {
          logger.error('Failed to start next question after break', { gameId, error });
        });
      }, breakDuration);
    }
  }

  /**
   * Handle score update events from scoring service
   */
  private handleScoreUpdate(gameId: string, playerId: string, scoreCalculation: ScoreCalculation): void {
    // Score updates are handled by the scoring service
    // This is mainly for logging and additional game logic
    logger.debug('Score updated via service', {
      gameId,
      playerId,
      pointsEarned: scoreCalculation.totalPoints
    });
  }

  /**
   * Handle timer completion events
   */
  private handleTimerCompletion(timerId: string, timer: any): void {
    if (timer.type === 'question') {
      // Question timer completed, trigger answer reveal
      const gameState = this.gameStateSync.getGameState(timer.gameId);
      if (gameState && gameState.currentQuestion) {
        const questionId = `${timer.gameId}_${gameState.currentQuestion.questionIndex}_${gameState.currentQuestion.startedAt?.getTime()}`;
        this.questionBroadcast.triggerAnswerReveal(timer.gameId, questionId);
      }
    }
  }

  /**
   * Handle game state update events
   */
  private handleStateUpdate(gameId: string, state: GameState): void {
    // Update local game state
    this.games.set(gameId, state);
    
    // Additional handling based on state changes
    if (state.status === GameStatus.FINISHED) {
      this.handleGameFinished(gameId);
    }
  }

  /**
   * Handle game finished
   */
  private handleGameFinished(gameId: string): void {
    // Cleanup timers
    this.timerSync.cleanupGameTimers(gameId);
    
    // Generate final game result
    this.generateFinalGameResult(gameId);
  }

  /**
   * Generate final game result
   */
  private async generateFinalGameResult(gameId: string): Promise<void> {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) return;

    const scoringStats = this.realtimeScoring.getGameScoringStats(gameId);
    const finalLeaderboard = this.realtimeScoring.getLeaderboard(gameId);

    const gameResult: GameResult = {
      gameId,
      roomId: gameState.roomId,
      startedAt: gameState.startedAt!,
      endedAt: new Date(),
      totalDuration: Date.now() - gameState.startedAt!.getTime(),
      questionCount: gameState.questions.length,
      playerCount: gameState.playerCount,
      finalLeaderboard,
      gameStats: {
        totalAnswers: scoringStats?.totalScore || 0,
        correctAnswers: 0,
        accuracy: scoringStats?.averageAccuracy || 0,
        averageResponseTime: 0,
        completionRate: 100,
        activePlayers: gameState.playerCount,
        spectators: 0,
        disconnections: 0,
        reconnections: 0,
        averageLatency: 0,
        syncIssues: 0,
        errorRate: 0
      },
      questionResults: []
    };

    // Broadcast final results
    this.broadcastGameEvent(gameId, 'game_results', gameResult);

    this.emit('game:completed', gameResult);
  }

  // ====================
  // LEADERBOARD & SCORING
  // ====================

  /**
   * Update and calculate leaderboard
   */
  private updateLeaderboard(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;

    const leaderboard: LeaderboardEntry[] = Array.from(game.players.values())
      .map(player => ({
        userId: player.userId,
        username: player.username,
        score: player.score,
        rank: 0, // Will be calculated after sorting
        accuracy: player.questionsAnswered > 0 ? (player.correctAnswers / player.questionsAnswered) * 100 : 0,
        averageTime: player.averageResponseTime,
        streak: player.currentStreak,
        questionsAnswered: player.questionsAnswered,
        lastActivity: player.lastActivity
      }))
      .sort((a, b) => {
        // Sort by score first, then by average time (faster is better)
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.averageTime - b.averageTime;
      });

    // Assign ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
      const player = game.players.get(entry.userId);
      if (player) {
        player.rank = entry.rank;
      }
    });

    game.leaderboard = leaderboard;
  }

  /**
   * Broadcast leaderboard update
   */
  private broadcastLeaderboard(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game || !game.settings.showLiveScores) return;

    this.broadcastGameEvent(gameId, 'leaderboard_updated', {
      leaderboard: game.leaderboard,
      timestamp: new Date()
    });
  }

  // ====================
  // GAME END
  // ====================

  /**
   * End the game and calculate final results
   */
  public async endGame(gameId: string, reason: string): Promise<GameResult> {
    const game = this.games.get(gameId);
    if (!game) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId);
    }

    game.endedAt = new Date();
    
    // Update game state through sync service
    this.gameStateSync.updateGameState(gameId, {
      status: GameStatus.FINISHED,
      endedAt: game.endedAt
    });

    // Clear all timers
    this.clearGameTimers(gameId);

    // Calculate final results
    const gameResult: GameResult = {
      gameId,
      roomId: game.roomId,
      startedAt: game.startedAt!,
      endedAt: game.endedAt,
      totalDuration: game.endedAt.getTime() - game.startedAt!.getTime(),
      questionCount: game.questions.length,
      playerCount: game.playerCount,
      finalLeaderboard: game.leaderboard,
      gameStats: this.calculateGameStats(game),
      questionResults: this.calculateQuestionResults(game)
    };

    logger.info('Game ended', { 
      gameId, 
      reason, 
      duration: gameResult.totalDuration,
      playerCount: game.playerCount,
      questionsCompleted: game.currentQuestionIndex + 1
    });

    // Update room status back to WAITING or FINISHED based on reason
    const finalRoomStatus = reason === 'no_players' ? 'WAITING' : 'FINISHED';
    roomManager.updateRoomStatus(game.roomId, finalRoomStatus);

    // Broadcast game ended
    this.broadcastGameEvent(gameId, 'game_ended', {
      reason,
      results: gameResult
    });

    // Clean up
    setTimeout(() => {
      this.cleanupGame(gameId);
      // If game was abandoned due to no players, reset room to WAITING
      if (reason === 'no_players') {
        roomManager.updateRoomStatus(game.roomId, 'WAITING');
      }
    }, 60000); // Clean up after 1 minute

    this.emit('game:ended', gameResult);
    return gameResult;
  }

  // ====================
  // HELPER METHODS
  // ====================

  /**
   * Generate questions for the game (AI or database with enhanced fallback)
   */
  private async generateGameQuestions(config: GameQuizConfig, rawConfig?: any): Promise<GameQuestion[]> {
    // Check if AI questions were provided
    if (rawConfig?.useAI && rawConfig?.aiQuestions && Array.isArray(rawConfig.aiQuestions)) {
      logger.info(`Using ${rawConfig.aiQuestions.length} AI-generated questions`, {
        component: 'GameManager',
        aiTopic: rawConfig.aiTopic,
        totalQuestions: config.totalQuestions,
        questionCount: rawConfig.aiQuestions.length
      });

      // Validate AI questions before using them
      const validAiQuestions = rawConfig.aiQuestions.filter((aiQ: any) => {
        return aiQ && (aiQ.questionText || aiQ.question) && 
               (aiQ.correctAnswer !== undefined || aiQ.correct_answer !== undefined);
      });

      if (validAiQuestions.length === 0) {
        logger.warn('No valid AI questions found, falling back to database questions', {
          component: 'GameManager',
          originalCount: rawConfig.aiQuestions.length,
          validCount: validAiQuestions.length
        });
        // Fall through to database questions
      } else if (validAiQuestions.length < config.totalQuestions) {
        logger.warn(`Only ${validAiQuestions.length} valid AI questions found, needed ${config.totalQuestions}. Using what we have.`, {
          component: 'GameManager',
          validCount: validAiQuestions.length,
          requestedCount: config.totalQuestions
        });
      } else {
        // Convert AI questions to GameQuestion format
        return validAiQuestions.slice(0, config.totalQuestions).map((aiQ: any, index: number): GameQuestion => ({
          id: `ai_${Date.now()}_${index}`,
          questionText: aiQ.questionText || aiQ.question,
          questionType: aiQ.questionType || 'MULTIPLE_CHOICE',
          options: { 
            options: aiQ.options || []
          },
          correctAnswer: aiQ.correctAnswer || aiQ.correct_answer,
          explanation: aiQ.explanation || 'AI-generated question',
          hints: aiQ.hints || {},
          difficultyLevel: aiQ.difficulty || 2,
          estimatedTime: config.timePerQuestion,
          points: config.pointsPerQuestion,
          categories: rawConfig.aiTopic ? [{ id: 0, name: rawConfig.aiTopic, slug: rawConfig.aiTopic.toLowerCase().replace(/\s+/g, '-') }] : [],
          // Game-specific fields
          questionIndex: index,
          timeLimit: config.timePerQuestion,
          startedAt: undefined,
          endsAt: undefined,
          // Answer tracking
          playerAnswers: new Map(),
          answeredCount: 0,
          correctCount: 0
        }));
      }
    }

    // Use database questions (original logic)
    try {
      const whereClause: any = {
        isActive: true,
        isPublished: true
      };

      if (config.categories.length > 0) {
        whereClause.categories = {
          some: {
            categoryId: {
              in: config.categories
            }
          }
        };
      }

      if (config.difficultyLevels.length > 0) {
        whereClause.difficultyLevel = {
          in: config.difficultyLevels
        };
      }

      if (config.questionTypes.length > 0) {
        whereClause.questionType = {
          in: config.questionTypes
        };
      }

      let questions = await prisma.question.findMany({
        where: whereClause,
        include: {
          categories: {
            include: {
              category: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: Math.min(config.totalQuestions * 2, 100) // Get extra questions for better shuffling
      });

      // If not enough questions found with specific criteria, try with fallback
      if (questions.length < config.totalQuestions) {
        logger.warn(`Not enough questions with specific criteria. Required: ${config.totalQuestions}, Found: ${questions.length}. Trying fallback...`, {
          component: 'GameManager',
          originalCriteria: { categories: config.categories, difficultyLevels: config.difficultyLevels, questionTypes: config.questionTypes }
        });

        // Fallback 1: Remove category restriction
        const fallbackQuestions = await prisma.question.findMany({
          where: {
            isActive: true,
            isPublished: true,
            difficultyLevel: config.difficultyLevels.length > 0 ? { in: config.difficultyLevels } : undefined,
            questionType: config.questionTypes.length > 0 ? { in: config.questionTypes } : undefined
          },
          include: {
            categories: {
              include: {
                category: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: Math.min(config.totalQuestions * 2, 100)
        });

        if (fallbackQuestions.length >= config.totalQuestions) {
          logger.info(`Fallback successful: Found ${fallbackQuestions.length} questions without category restriction`);
          questions = fallbackQuestions;
        } else {
          // Fallback 2: Remove all restrictions except active/published
          const finalFallback = await prisma.question.findMany({
            where: {
              isActive: true,
              isPublished: true
            },
            include: {
              categories: {
                include: {
                  category: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: Math.min(config.totalQuestions * 2, 100)
          });

          if (finalFallback.length >= config.totalQuestions) {
            logger.info(`Final fallback successful: Found ${finalFallback.length} questions with no restrictions`);
            questions = finalFallback;
          } else {
            throw new Error(`Insufficient questions in database. Required: ${config.totalQuestions}, Available: ${finalFallback.length}. Please add more questions or reduce game size.`);
          }
        }
      }

      // Shuffle and select questions
      const shuffled = config.shuffleQuestions ? this.shuffleArray([...questions]) : questions;
      const selected = shuffled.slice(0, config.totalQuestions);

      // Convert to GameQuestion format
      return selected.map((q, index): GameQuestion => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: config.shuffleAnswers && q.options ? this.shuffleQuestionOptions(q.options) : q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || undefined,
        hints: q.hints,
        difficultyLevel: q.difficultyLevel,
        estimatedTime: q.estimatedTime || config.timePerQuestion,
        points: q.points,
        categories: q.categories.map(c => ({
          id: c.category.id,
          name: c.category.name,
          slug: c.category.slug
        })),
        questionIndex: index,
        timeLimit: config.timePerQuestion * 1000,
        playerAnswers: new Map(),
        answeredCount: 0,
        correctCount: 0
      }));

    } catch (error) {
      logger.error('Failed to generate game questions from database', { config, error });
      
      // Final fallback - create minimal questions if everything fails
      logger.warn('Creating minimal fallback questions as last resort', {
        component: 'GameManager',
        totalQuestions: config.totalQuestions
      });
      
      return Array.from({ length: Math.min(config.totalQuestions, 5) }, (_, index): GameQuestion => ({
        id: `fallback_${Date.now()}_${index}`,
        questionText: `Sample Question ${index + 1}: What is 2 + 2?`,
        questionType: 'MULTIPLE_CHOICE' as any,
        options: {
          options: ['3', '4', '5', '6'],
          type: 'single'
        },
        correctAnswer: '4',
        explanation: 'This is a fallback question used when the system cannot load regular questions.',
        hints: {},
        difficultyLevel: 1,
        estimatedTime: config.timePerQuestion,
        points: config.pointsPerQuestion,
        categories: [{ id: 999, name: 'System Fallback', slug: 'system-fallback' }],
        questionIndex: index,
        timeLimit: config.timePerQuestion * 1000,
        playerAnswers: new Map(),
        answeredCount: 0,
        correctCount: 0
      }));
    }
  }

  /**
   * Create default game settings
   */
  private getDefaultGameSettings(): GameSettings {
    return {
      hostCanSkip: true,
      hostCanPause: true,
      hostCanExtendTime: true,
      hostCanRemovePlayers: true,
      allowLateJoining: false,
      allowReconnection: true,
      allowSpectators: true,
      maxSpectators: 10,
      requireReadyCheck: false,
      showLiveScores: true,
      showAnswerBreakdown: true,
      allowAnswerChange: false,
      gracePeriodsMs: 1000,
      autoProgressEnabled: true,
      questionBreakDuration: 5,
      networkLatencyCompensation: true,
      maxLatencyMs: 2000,
      timeoutHandling: 'lenient'
    };
  }

  /**
   * Create timer object
   */
  private createTimer(duration: number): GameTimer {
    const now = new Date();
    return {
      startTime: now,
      duration,
      timeRemaining: duration,
      isRunning: true,
      isPaused: false,
      warnings: [],
      serverTime: now.getTime()
    };
  }

  /**
   * Validate player answer - comprehensive validation matching quizSessionService
   */
  private validateAnswer(correctAnswer: any, userAnswer: any): boolean {
    // Handle different question types
    if (Array.isArray(correctAnswer)) {
      if (!Array.isArray(userAnswer)) return false;
      return JSON.stringify(userAnswer.sort()) === JSON.stringify(correctAnswer.sort());
    }

    if (typeof correctAnswer === 'boolean') {
      return Boolean(userAnswer) === correctAnswer;
    }

    if (typeof correctAnswer === 'string') {
      return String(userAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
    }

    // Handle case where correctAnswer might be a JSON string (from database)
    // Try to parse it and compare the actual value
    let actualCorrectAnswer = correctAnswer;
    if (typeof correctAnswer === 'string' && correctAnswer.startsWith('"') && correctAnswer.endsWith('"')) {
      try {
        actualCorrectAnswer = JSON.parse(correctAnswer);
      } catch (e) {
        // If parsing fails, use the original value
        actualCorrectAnswer = correctAnswer;
      }
    }

    // Re-run comparison with parsed value
    if (typeof actualCorrectAnswer === 'string') {
      return String(userAnswer).trim().toLowerCase() === String(actualCorrectAnswer).trim().toLowerCase();
    }

    if (typeof actualCorrectAnswer === 'boolean') {
      return Boolean(userAnswer) === actualCorrectAnswer;
    }

    if (Array.isArray(actualCorrectAnswer)) {
      if (!Array.isArray(userAnswer)) return false;
      return JSON.stringify(userAnswer.sort()) === JSON.stringify(actualCorrectAnswer.sort());
    }

    return JSON.stringify(userAnswer) === JSON.stringify(actualCorrectAnswer);
  }

  /**
   * Shuffle array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Shuffle question options
   */
  private shuffleQuestionOptions(options: any): any {
    if (typeof options === 'object' && options.options && Array.isArray(options.options)) {
      return {
        ...options,
        options: this.shuffleArray(options.options)
      };
    }
    return options;
  }

  /**
   * Calculate game statistics
   */
  private calculateGameStats(game: GameState): any {
    const totalAnswers = Array.from(game.players.values()).reduce((sum, p) => sum + p.questionsAnswered, 0);
    const correctAnswers = Array.from(game.players.values()).reduce((sum, p) => sum + p.correctAnswers, 0);
    
    return {
      totalAnswers,
      correctAnswers,
      accuracy: totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0,
      averageResponseTime: Array.from(game.players.values()).reduce((sum, p) => sum + p.averageResponseTime, 0) / game.playerCount,
      completionRate: 100, // TODO: Calculate based on questions completed vs total
      activePlayers: game.playerCount,
      spectators: 0, // TODO: Implement spectator tracking
      disconnections: 0, // TODO: Track disconnections
      reconnections: 0, // TODO: Track reconnections
      averageLatency: Array.from(game.players.values()).reduce((sum, p) => sum + p.latency, 0) / game.playerCount,
      syncIssues: 0, // TODO: Track sync issues
      errorRate: 0 // TODO: Track error rate
    };
  }

  /**
   * Calculate per-question results
   */
  private calculateQuestionResults(game: GameState): any[] {
    return game.questions.map((question, index) => ({
      questionId: question.id,
      questionIndex: index,
      correctAnswerRate: question.answeredCount > 0 ? (question.correctCount / question.answeredCount) * 100 : 0,
      averageTime: this.calculateAverageTime(question),
      fastestAnswer: this.getFastestAnswer(question),
      slowestAnswer: this.getSlowestAnswer(question)
    }));
  }

  /**
   * Calculate average response time for a question
   */
  private calculateAverageTime(question: GameQuestion): number {
    const times = Array.from(question.playerAnswers.values()).map(a => a.timeTaken);
    return times.length > 0 ? times.reduce((sum, time) => sum + time, 0) / times.length : 0;
  }

  /**
   * Get fastest answer time for a question
   */
  private getFastestAnswer(question: GameQuestion): number {
    const times = Array.from(question.playerAnswers.values()).map(a => a.timeTaken);
    return times.length > 0 ? Math.min(...times) : 0;
  }

  /**
   * Get slowest answer time for a question
   */
  private getSlowestAnswer(question: GameQuestion): number {
    const times = Array.from(question.playerAnswers.values()).map(a => a.timeTaken);
    return times.length > 0 ? Math.max(...times) : 0;
  }

  /**
   * Broadcast game event to all players in the game
   */
  private broadcastGameEvent(gameId: string, eventType: string, data: any): void {
    const game = this.games.get(gameId);
    if (!game) return;

    const event: GameSyncEvent = {
      type: eventType as any,
      gameId,
      roomId: game.roomId,
      data,
      timestamp: new Date(),
      version: game.version
    };

    this.io.to(game.roomId).emit('game_event', event);
  }

  /**
   * Update game version for optimistic updates
   */
  private updateGameVersion(game: GameState): void {
    game.version++;
    game.updatedAt = new Date();
  }

  /**
   * Sanitize player data for broadcasting
   */
  private sanitizePlayerForBroadcast(player: GamePlayer): any {
    return {
      userId: player.userId,
      username: player.username,
      status: player.status,
      score: player.score,
      rank: player.rank,
      questionsAnswered: player.questionsAnswered,
      correctAnswers: player.correctAnswers,
      currentStreak: player.currentStreak,
      isHost: player.isHost,
      canAnswer: player.canAnswer,
      lastActivity: player.lastActivity
    };
  }

  /**
   * Clear all timers for a game
   */
  private clearGameTimers(gameId: string): void {
    const timerKeys = Array.from(this.gameTimers.keys()).filter(key => key.startsWith(gameId));
    timerKeys.forEach(key => {
      const timer = this.gameTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.gameTimers.delete(key);
      }
    });
  }

  /**
   * Clean up game state
   */
  private cleanupGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;

    // Clear from maps
    this.games.delete(gameId);
    this.roomToGameMap.delete(game.roomId);
    
    // Clear player mappings
    Array.from(game.players.keys()).forEach(userId => {
      this.playerToGameMap.delete(userId);
    });

    // Clear timers
    this.clearGameTimers(gameId);

    logger.info('Game cleaned up', { gameId });
  }

  // ====================
  // ENHANCED HOST CONTROLS
  // ====================

  /**
   * Pause game with enhanced timer management
   */
  public pauseGame(gameId: string, hostUserId: string): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId, hostUserId);
    }

    const host = gameState.players.get(hostUserId);
    if (!host || !host.isHost) {
      throw new GameError('INSUFFICIENT_PERMISSIONS', 'Only host can pause game', gameId, hostUserId);
    }

    if (!gameState.settings.hostCanPause) {
      throw new GameError('ACTION_DISABLED', 'Game pausing is disabled', gameId, hostUserId);
    }

    // Pause active timer
    const activeTimer = this.timerSync.getActiveTimer(gameId, 'question');
    if (activeTimer) {
      this.timerSync.pauseTimer(activeTimer.timerId);
    }

    // Update game state
    this.gameStateSync.updateGameState(gameId, {
      status: GameStatus.PAUSED,
      pausedAt: new Date()
    });

    logger.info('Game paused by host', { gameId, hostUserId });
  }

  /**
   * Resume paused game
   */
  public resumeGame(gameId: string, hostUserId: string): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId, hostUserId);
    }

    const host = gameState.players.get(hostUserId);
    if (!host || !host.isHost) {
      throw new GameError('INSUFFICIENT_PERMISSIONS', 'Only host can resume game', gameId, hostUserId);
    }

    if (gameState.status !== GameStatus.PAUSED) {
      throw new GameError('INVALID_STATE', 'Game is not paused', gameId, hostUserId);
    }

    // Resume active timer
    const activeTimer = this.timerSync.getActiveTimer(gameId, 'question');
    if (activeTimer) {
      this.timerSync.resumeTimer(activeTimer.timerId);
    }

    // Update game state
    this.gameStateSync.updateGameState(gameId, {
      status: GameStatus.IN_PROGRESS,
      pausedAt: undefined
    });

    logger.info('Game resumed by host', { gameId, hostUserId });
  }

  /**
   * Extend question time
   */
  public extendQuestionTime(gameId: string, hostUserId: string, extensionSeconds: number): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId, hostUserId);
    }

    const host = gameState.players.get(hostUserId);
    if (!host || !host.isHost) {
      throw new GameError('INSUFFICIENT_PERMISSIONS', 'Only host can extend time', gameId, hostUserId);
    }

    if (!gameState.settings.hostCanExtendTime) {
      throw new GameError('ACTION_DISABLED', 'Time extension is disabled', gameId, hostUserId);
    }

    // Extend active timer
    const activeTimer = this.timerSync.getActiveTimer(gameId, 'question');
    if (activeTimer) {
      this.timerSync.extendTimer(activeTimer.timerId, extensionSeconds);
    }

    logger.info('Question time extended by host', { gameId, hostUserId, extensionSeconds });
  }

  /**
   * Skip current question
   */
  public skipCurrentQuestion(gameId: string, hostUserId: string): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId, hostUserId);
    }

    const host = gameState.players.get(hostUserId);
    if (!host || !host.isHost) {
      throw new GameError('INSUFFICIENT_PERMISSIONS', 'Only host can skip questions', gameId, hostUserId);
    }

    if (!gameState.settings.hostCanSkip) {
      throw new GameError('ACTION_DISABLED', 'Question skipping is disabled', gameId, hostUserId);
    }

    // Complete active timer immediately
    const activeTimer = this.timerSync.getActiveTimer(gameId, 'question');
    if (activeTimer) {
      this.timerSync.completeTimer(activeTimer.timerId);
    }

    logger.info('Question skipped by host', { gameId, hostUserId });
  }

  /**
   * Remove player from game
   */
  public removePlayerFromGame(gameId: string, hostUserId: string, playerToRemove: string): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId, hostUserId);
    }

    const host = gameState.players.get(hostUserId);
    if (!host || !host.isHost) {
      throw new GameError('INSUFFICIENT_PERMISSIONS', 'Only host can remove players', gameId, hostUserId);
    }

    if (!gameState.settings.hostCanRemovePlayers) {
      throw new GameError('ACTION_DISABLED', 'Player removal is disabled', gameId, hostUserId);
    }

    const player = gameState.players.get(playerToRemove);
    if (!player) {
      throw new GameError('PLAYER_NOT_FOUND', 'Player not found', gameId, playerToRemove);
    }

    // Remove player
    gameState.players.delete(playerToRemove);
    gameState.playerCount = gameState.players.size;
    this.playerToGameMap.delete(playerToRemove);

    // Update game state
    this.gameStateSync.updateGameState(gameId, {
      players: gameState.players,
      playerCount: gameState.playerCount
    });

    // Broadcast player removal
    this.broadcastGameEvent(gameId, 'player_removed', {
      userId: playerToRemove,
      username: player.username,
      removedBy: hostUserId,
      reason: 'Removed by host'
    });

    logger.info('Player removed by host', { gameId, hostUserId, playerToRemove });
  }

  // ====================
  // TIME SYNCHRONIZATION
  // ====================

  /**
   * Sync time with client
   */
  public syncTimeWithClient(playerId: string, clientTime: number, gameId?: string): any {
    return this.timerSync.syncTimeWithClient(playerId, clientTime, gameId);
  }

  /**
   * Validate submission timing
   */
  public validateSubmissionTiming(
    gameId: string,
    playerId: string,
    submissionTime: Date,
    allowGracePeriod: boolean = true
  ): { isValid: boolean; reason?: string } {
    const activeTimer = this.timerSync.getActiveTimer(gameId, 'question');
    if (!activeTimer) {
      return { isValid: true }; // No active timer
    }

    return this.timerSync.validateSubmissionTiming(
      activeTimer.timerId,
      playerId,
      submissionTime,
      allowGracePeriod
    );
  }

  // ====================
  // PUBLIC GETTERS
  // ====================

  public getGameByRoomId(roomId: string): GameState | undefined {
    const gameId = this.roomToGameMap.get(roomId);
    return gameId ? this.games.get(gameId) : undefined;
  }

  public getGameById(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }

  public getPlayerGame(userId: string): GameState | undefined {
    const gameId = this.playerToGameMap.get(userId);
    return gameId ? this.games.get(gameId) : undefined;
  }

  public getActiveGameCount(): number {
    return this.games.size;
  }

  public getActiveGames(): GameState[] {
    return Array.from(this.games.values());
  }
}
