import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { GameStateSyncService } from './gameStateSyncService';
import {
  GameState,
  GameQuestion,
  QuestionBroadcast,
  AnswerReveal,
  PlayerAnswer,
  GameError,
  GameSyncEvent
} from '../sockets/types/game';

interface QuestionDeliveryStatus {
  questionId: string;
  gameId: string;
  deliveredTo: Set<string>;
  failedDeliveries: Set<string>;
  totalPlayers: number;
  broadcastAt: Date;
  revealScheduled: boolean;
  revealTimer?: NodeJS.Timeout;
}

interface PreloadedQuestion {
  questionId: string;
  questionIndex: number;
  gameId: string;
  questionData: GameQuestion;
  preloadedTo: Set<string>;
}

/**
 * Question Broadcasting & Distribution Service
 * Handles synchronized question delivery, answer collection, and reveal coordination
 */
export class QuestionBroadcastService extends EventEmitter {
  private static instance: QuestionBroadcastService | null = null;
  private io: Server;
  private gameStateSync: GameStateSyncService;
  
  // Question delivery tracking
  private deliveryStatus: Map<string, QuestionDeliveryStatus> = new Map();
  private preloadedQuestions: Map<string, PreloadedQuestion> = new Map();
  private answerCollectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private questionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  
  // Configuration
  private readonly DELIVERY_TIMEOUT = 5000; // 5 seconds to deliver question
  private readonly ANSWER_GRACE_PERIOD = 2000; // 2 seconds after time expires
  private readonly PRELOAD_ADVANCE_TIME = 5000; // Preload 5 seconds before needed
  private readonly MAX_DELIVERY_RETRIES = 3;
  private readonly SYNC_VERIFICATION_INTERVAL = 1000; // 1 second

  private constructor(io: Server, gameStateSync: GameStateSyncService) {
    super();
    this.io = io;
    this.gameStateSync = gameStateSync;
    this.setupEventListeners();
  }

  public static getInstance(
    io?: Server, 
    gameStateSync?: GameStateSyncService
  ): QuestionBroadcastService {
    if (!QuestionBroadcastService.instance) {
      if (!io || !gameStateSync) {
        throw new Error('Socket.io and GameStateSyncService instances required for first initialization');
      }
      QuestionBroadcastService.instance = new QuestionBroadcastService(io, gameStateSync);
    }
    return QuestionBroadcastService.instance;
  }

  // ====================
  // QUESTION BROADCASTING
  // ====================

  /**
   * Broadcast question to all players simultaneously
   */
  public async broadcastQuestion(
    gameId: string,
    question: GameQuestion,
    timeLimit: number
  ): Promise<string> {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId);
    }

    const questionId = `${gameId}_${question.questionIndex}_${Date.now()}`;
    const broadcastTime = new Date();
    const endTime = new Date(broadcastTime.getTime() + timeLimit * 1000);

    // Prepare question broadcast data (hide correct answer)
    const questionBroadcast: QuestionBroadcast = {
      questionId,
      questionIndex: question.questionIndex,
      questionData: {
        ...question,
        correctAnswer: undefined, // Hidden from clients
        playerAnswers: new Map(), // Hidden from clients
        id: questionId,
        startedAt: broadcastTime,
        endsAt: endTime
      } as GameQuestion,
      timeLimit,
      startsAt: broadcastTime,
      endsAt: endTime,
      serverTime: new Date()
    };

    // Initialize delivery tracking
    const deliveryStatus: QuestionDeliveryStatus = {
      questionId,
      gameId,
      deliveredTo: new Set(),
      failedDeliveries: new Set(),
      totalPlayers: gameState.playerCount,
      broadcastAt: broadcastTime,
      revealScheduled: false
    };

    this.deliveryStatus.set(questionId, deliveryStatus);

    logger.info('Broadcasting question to players', {
      gameId,
      questionId,
      questionIndex: question.questionIndex,
      playerCount: gameState.playerCount,
      timeLimit
    });

    // Broadcast to all players with delivery confirmation
    const playerPromises: Promise<void>[] = [];
    
    gameState.players.forEach((player, playerId) => {
      if (player.socketId && player.canAnswer) {
        playerPromises.push(this.deliverQuestionToPlayer(
          player.socketId, 
          playerId,
          questionBroadcast,
          questionId
        ));
      }
    });

    // Wait for initial deliveries with timeout
    try {
      await Promise.allSettled(playerPromises);
      
      // Check delivery success rate
      const successRate = deliveryStatus.deliveredTo.size / deliveryStatus.totalPlayers;
      
      if (successRate < 0.8) { // Less than 80% success rate
        logger.warn('Low question delivery success rate', {
          gameId,
          questionId,
          successRate,
          delivered: deliveryStatus.deliveredTo.size,
          total: deliveryStatus.totalPlayers
        });
        
        // Attempt recovery
        await this.retryFailedDeliveries(questionId);
      }

      // Schedule answer reveal
      this.scheduleAnswerReveal(gameId, question, questionId, endTime);
      
      // Start answer collection monitoring
      this.startAnswerCollectionMonitoring(gameId, questionId);

      // Return the generated questionId for use by gameManager
      return questionId;

    } catch (error) {
      logger.error('Failed to broadcast question', { gameId, questionId, error });
      throw new GameError('QUESTION_BROADCAST_FAILED', 'Failed to broadcast question', gameId);
    }
  }

  /**
   * Deliver question to specific player with confirmation
   */
  private async deliverQuestionToPlayer(
    socketId: string,
    playerId: string,
    questionBroadcast: QuestionBroadcast,
    questionId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const deliveryTimeout = setTimeout(() => {
        this.handleDeliveryFailure(questionId, playerId, 'timeout');
        reject(new Error(`Delivery timeout for player ${playerId}`));
      }, this.DELIVERY_TIMEOUT);

      // Send question with confirmation callback
      this.io.to(socketId).emit('question_broadcast', questionBroadcast, (confirmation: any) => {
        clearTimeout(deliveryTimeout);
        
        if (confirmation?.received) {
          this.handleDeliverySuccess(questionId, playerId);
          resolve();
        } else {
          this.handleDeliveryFailure(questionId, playerId, 'no_confirmation');
          reject(new Error(`No confirmation from player ${playerId}`));
        }
      });

      // Also emit as game event for redundancy
      const gameEvent: GameSyncEvent = {
        type: 'question_started',
        gameId: questionBroadcast.questionData.questionIndex.toString(),
        roomId: '', // Will be set by caller
        data: questionBroadcast,
        timestamp: new Date(),
        version: 0
      };
      
      this.io.to(socketId).emit('game_event', gameEvent);
    });
  }

  // ====================
  // PRELOADING SYSTEM
  // ====================

  /**
   * Preload next question for smooth transitions
   */
  public preloadNextQuestion(
    gameId: string,
    nextQuestion: GameQuestion
  ): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) return;

    const preloadId = `${gameId}_preload_${nextQuestion.questionIndex}`;
    
    const preloadData: PreloadedQuestion = {
      questionId: preloadId,
      questionIndex: nextQuestion.questionIndex,
      gameId,
      questionData: {
        ...nextQuestion,
        correctAnswer: undefined, // Hidden for preload
        playerAnswers: new Map()
      } as GameQuestion,
      preloadedTo: new Set()
    };

    this.preloadedQuestions.set(preloadId, preloadData);

    // Send preload to all active players
    gameState.players.forEach((player, playerId) => {
      if (player.socketId && player.canAnswer) {
        this.io.to(player.socketId).emit('question_preload', {
          questionId: preloadId,
          questionIndex: nextQuestion.questionIndex,
          questionData: preloadData.questionData
        });

        preloadData.preloadedTo.add(playerId);
      }
    });

    logger.debug('Question preloaded', {
      gameId,
      questionIndex: nextQuestion.questionIndex,
      preloadedTo: preloadData.preloadedTo.size
    });
  }

  // ====================
  // ANSWER COLLECTION
  // ====================

  /**
   * Process answer submission with validation
   */
  public async processAnswerSubmission(
    gameId: string,
    questionId: string,
    playerId: string,
    answer: any,
    submissionTime: Date,
    timeTaken: number
  ): Promise<PlayerAnswer | null> {
    const deliveryStatus = this.deliveryStatus.get(questionId);
    if (!deliveryStatus) {
      logger.warn('Answer submitted for unknown question', { gameId, questionId, playerId });
      return null;
    }

    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState || !gameState.currentQuestion) {
      throw new GameError('NO_ACTIVE_QUESTION', 'No active question', gameId, playerId);
    }

    // Validate timing with network compensation
    const compensation = this.gameStateSync.getNetworkCompensation(playerId);
    const adjustedSubmissionTime = new Date(submissionTime.getTime() - compensation);
    
    if (adjustedSubmissionTime > gameState.questionEndsAt!) {
      const graceTime = gameState.settings.gracePeriodsMs || 0;
      const gracePeriodEnd = new Date(gameState.questionEndsAt!.getTime() + graceTime);
      
      if (adjustedSubmissionTime > gracePeriodEnd) {
        throw new GameError('ANSWER_TOO_LATE', 'Answer submitted after deadline', gameId, playerId);
      }
    }

    // Validate answer hasn't been submitted already
    const player = gameState.players.get(playerId);
    if (!player) {
      throw new GameError('PLAYER_NOT_FOUND', 'Player not in game', gameId, playerId);
    }

    if (gameState.currentQuestion.playerAnswers.has(playerId)) {
      throw new GameError('ALREADY_ANSWERED', 'Player already answered this question', gameId, playerId);
    }

    // Process the answer
    const isCorrect = this.validateAnswer(gameState.currentQuestion.correctAnswer, answer);
    const playerAnswer: PlayerAnswer = {
      questionId,
      questionIndex: gameState.currentQuestion.questionIndex,
      userAnswer: answer,
      isCorrect,
      submittedAt: adjustedSubmissionTime,
      timeTaken,
      pointsEarned: 0, // Will be calculated by scoring service
      timeBonus: 0,
      streakBonus: 0,
      hintsUsed: 0
    };

    // Update question with answer
    gameState.currentQuestion.playerAnswers.set(playerId, playerAnswer);
    gameState.currentQuestion.answeredCount++;
    
    if (isCorrect) {
      gameState.currentQuestion.correctCount++;
    }

    // Broadcast answer acknowledgment
    this.broadcastAnswerAcknowledgment(gameId, playerId, questionId);

    // Check if all players have answered
    if (gameState.currentQuestion.answeredCount >= gameState.playerCount) {
      // Trigger early answer reveal
      setTimeout(() => {
        this.triggerAnswerReveal(gameId, questionId);
      }, 1000); // 1 second delay to show completion
    }

    logger.info('Answer processed', {
      gameId,
      questionId,
      playerId,
      isCorrect,
      timeTaken,
      answeredCount: gameState.currentQuestion.answeredCount,
      totalPlayers: gameState.playerCount
    });

    this.emit('answer:submitted', {
      gameId,
      questionId,
      playerId,
      answer: playerAnswer,
      totalAnswered: gameState.currentQuestion.answeredCount
    });

    // Broadcast player answered event to room
    const playerData = gameState.players.get(playerId);
    if (playerData) {
      const gameEvent: GameSyncEvent = {
        type: 'player_answered',
        gameId,
        roomId: gameState.roomId,
        data: {
          userId: playerId,
          username: playerData.username,
          questionIndex: gameState.currentQuestionIndex,
          answeredCount: gameState.currentQuestion.answeredCount,
          totalPlayers: gameState.playerCount,
          isCorrect: playerAnswer.isCorrect,
          timeTaken: playerAnswer.timeTaken
        },
        timestamp: new Date(),
        version: gameState.version
      };
      
      this.io.to(gameState.roomId).emit('game_event', gameEvent);
    }

    return playerAnswer;
  }

  // ====================
  // ANSWER REVEAL
  // ====================

  /**
   * Schedule automatic answer reveal
   */
  private scheduleAnswerReveal(
    gameId: string,
    question: GameQuestion,
    questionId: string,
    endTime: Date
  ): void {
    const delay = endTime.getTime() - Date.now() + this.ANSWER_GRACE_PERIOD;
    
    if (delay > 0) {
      const revealTimer = setTimeout(() => {
        this.triggerAnswerReveal(gameId, questionId);
      }, delay);
      
      const deliveryStatus = this.deliveryStatus.get(questionId);
      if (deliveryStatus) {
        deliveryStatus.revealTimer = revealTimer;
        deliveryStatus.revealScheduled = true;
      }
    }
  }

  /**
   * Trigger answer reveal and show results
   */
  public async triggerAnswerReveal(gameId: string, questionId: string): Promise<void> {
    const gameState = this.gameStateSync.getGameState(gameId);
    const deliveryStatus = this.deliveryStatus.get(questionId);
    
    if (!gameState || !gameState.currentQuestion || !deliveryStatus) {
      return;
    }

    // Clear reveal timer
    if (deliveryStatus.revealTimer) {
      clearTimeout(deliveryStatus.revealTimer);
      deliveryStatus.revealTimer = undefined;
    }

    const question = gameState.currentQuestion;
    
    // Calculate answer breakdown
    const answerBreakdown = this.calculateAnswerBreakdown(question);
    
    // Generate player results
    const playerResults = this.generatePlayerResults(gameState, question);

    // Create answer reveal
    const answerReveal: AnswerReveal = {
      questionId,
      questionIndex: question.questionIndex,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      answerBreakdown,
      playerResults
    };

    // Broadcast answer reveal
    const revealEvent: GameSyncEvent = {
      type: 'question_end',
      gameId,
      roomId: gameState.roomId,
      data: answerReveal,
      timestamp: new Date(),
      version: gameState.version
    };

    this.io.to(gameState.roomId).emit('game_event', revealEvent);

    logger.info('Answer revealed', {
      gameId,
      questionId,
      questionIndex: question.questionIndex,
      answeredCount: question.answeredCount,
      correctCount: question.correctCount
    });

    // Cleanup
    this.cleanupQuestionData(questionId);

    this.emit('answer:revealed', {
      gameId,
      questionId,
      reveal: answerReveal
    });
  }

  // ====================
  // MONITORING & RECOVERY
  // ====================

  /**
   * Start monitoring answer collection progress
   */
  private startAnswerCollectionMonitoring(gameId: string, questionId: string): void {
    const monitorTimer = setInterval(() => {
      const gameState = this.gameStateSync.getGameState(gameId);
      if (!gameState || !gameState.currentQuestion) {
        clearInterval(monitorTimer);
        return;
      }

      // Broadcast progress update
      const progressEvent: GameSyncEvent = {
        type: 'score_update',
        gameId,
        roomId: gameState.roomId,
        data: {
          questionId,
          answeredCount: gameState.currentQuestion.answeredCount,
          totalPlayers: gameState.playerCount,
          progressPercentage: (gameState.currentQuestion.answeredCount / gameState.playerCount) * 100
        },
        timestamp: new Date(),
        version: gameState.version
      };

      this.io.to(gameState.roomId).emit('game_event', progressEvent);

    }, this.SYNC_VERIFICATION_INTERVAL);

    this.answerCollectionTimers.set(questionId, monitorTimer);
  }

  /**
   * Retry failed question deliveries
   */
  private async retryFailedDeliveries(questionId: string): Promise<void> {
    const deliveryStatus = this.deliveryStatus.get(questionId);
    if (!deliveryStatus) return;

    const gameState = this.gameStateSync.getGameState(deliveryStatus.gameId);
    if (!gameState) return;

    const retryPromises: Promise<void>[] = [];
    
    deliveryStatus.failedDeliveries.forEach(playerId => {
      const player = gameState.players.get(playerId);
      if (player && player.socketId) {
        // Create simplified question broadcast for retry
        const retryBroadcast: QuestionBroadcast = {
          questionId,
          questionIndex: gameState.currentQuestion?.questionIndex || 0,
          questionData: gameState.currentQuestion!,
          timeLimit: gameState.quizConfig.timePerQuestion,
          startsAt: deliveryStatus.broadcastAt,
          endsAt: gameState.questionEndsAt!,
          serverTime: new Date()
        };

        retryPromises.push(
          this.deliverQuestionToPlayer(player.socketId, playerId, retryBroadcast, questionId)
        );
      }
    });

    if (retryPromises.length > 0) {
      await Promise.allSettled(retryPromises);
      
      logger.info('Question delivery retry completed', {
        gameId: deliveryStatus.gameId,
        questionId,
        retriedCount: retryPromises.length,
        successCount: deliveryStatus.deliveredTo.size
      });
    }
  }

  // ====================
  // UTILITY METHODS
  // ====================

  /**
   * Handle successful question delivery
   */
  private handleDeliverySuccess(questionId: string, playerId: string): void {
    const deliveryStatus = this.deliveryStatus.get(questionId);
    if (deliveryStatus) {
      deliveryStatus.deliveredTo.add(playerId);
      deliveryStatus.failedDeliveries.delete(playerId);
    }
  }

  /**
   * Handle failed question delivery
   */
  private handleDeliveryFailure(questionId: string, playerId: string, reason: string): void {
    const deliveryStatus = this.deliveryStatus.get(questionId);
    if (deliveryStatus) {
      deliveryStatus.failedDeliveries.add(playerId);
    }
    
    logger.warn('Question delivery failed', { questionId, playerId, reason });
  }

  /**
   * Validate player answer - comprehensive validation matching quizSessionService
   */
  private validateAnswer(correctAnswer: any, userAnswer: any): boolean {
    // Enhanced debugging for AI questions
    logger.info('🔍 Answer validation debug', {
      component: 'QuestionBroadcastService',
      correctAnswer,
      correctAnswerType: typeof correctAnswer,
      correctAnswerStringified: JSON.stringify(correctAnswer),
      userAnswer,
      userAnswerType: typeof userAnswer,
      userAnswerStringified: JSON.stringify(userAnswer)
    });

    // Handle different question types
    if (Array.isArray(correctAnswer)) {
      if (!Array.isArray(userAnswer)) {
        logger.info('❌ Array type mismatch', { correctAnswer, userAnswer });
        return false;
      }
      const result = JSON.stringify(userAnswer.sort()) === JSON.stringify(correctAnswer.sort());
      logger.info('🔢 Array comparison result', { result, correctAnswer, userAnswer });
      return result;
    }

    if (typeof correctAnswer === 'boolean') {
      const result = Boolean(userAnswer) === correctAnswer;
      logger.info('✅ Boolean comparison result', { result, correctAnswer, userAnswer });
      return result;
    }

    if (typeof correctAnswer === 'string') {
      const result = String(userAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
      logger.info('📝 String comparison result', { 
        result, 
        correctAnswer: String(correctAnswer).trim().toLowerCase(), 
        userAnswer: String(userAnswer).trim().toLowerCase() 
      });
      return result;
    }

    // Handle case where correctAnswer might be a JSON string (from database)
    // Try to parse it and compare the actual value
    let actualCorrectAnswer = correctAnswer;
    if (typeof correctAnswer === 'string' && correctAnswer.startsWith('"') && correctAnswer.endsWith('"')) {
      try {
        actualCorrectAnswer = JSON.parse(correctAnswer);
        logger.info('🔧 Parsed JSON string correctAnswer', { 
          original: correctAnswer, 
          parsed: actualCorrectAnswer 
        });
      } catch (e) {
        // If parsing fails, use the original value
        actualCorrectAnswer = correctAnswer;
        logger.info('⚠️ JSON parsing failed, using original', { correctAnswer });
      }
    }

    // Re-run comparison with parsed value
    if (typeof actualCorrectAnswer === 'string') {
      const result = String(userAnswer).trim().toLowerCase() === String(actualCorrectAnswer).trim().toLowerCase();
      logger.info('📝 Parsed string comparison result', { 
        result, 
        actualCorrectAnswer: String(actualCorrectAnswer).trim().toLowerCase(), 
        userAnswer: String(userAnswer).trim().toLowerCase() 
      });
      return result;
    }

    if (typeof actualCorrectAnswer === 'boolean') {
      const result = Boolean(userAnswer) === actualCorrectAnswer;
      logger.info('✅ Parsed boolean comparison result', { result, actualCorrectAnswer, userAnswer });
      return result;
    }

    if (Array.isArray(actualCorrectAnswer)) {
      if (!Array.isArray(userAnswer)) {
        logger.info('❌ Parsed array type mismatch', { actualCorrectAnswer, userAnswer });
        return false;
      }
      const result = JSON.stringify(userAnswer.sort()) === JSON.stringify(actualCorrectAnswer.sort());
      logger.info('🔢 Parsed array comparison result', { result, actualCorrectAnswer, userAnswer });
      return result;
    }

    const result = JSON.stringify(userAnswer) === JSON.stringify(actualCorrectAnswer);
    logger.info('🔄 Final JSON comparison result', { result, actualCorrectAnswer, userAnswer });
    return result;
  }

  /**
   * Calculate answer breakdown statistics
   */
  private calculateAnswerBreakdown(question: GameQuestion): Record<string, any> {
    const breakdown: Record<string, any> = {};
    
    question.playerAnswers.forEach((answer) => {
      const answerKey = JSON.stringify(answer.userAnswer);
      
      if (!breakdown[answerKey]) {
        breakdown[answerKey] = {
          count: 0,
          percentage: 0,
          isCorrect: answer.isCorrect
        };
      }
      
      breakdown[answerKey].count++;
    });

    // Calculate percentages
    const totalAnswers = question.answeredCount;
    Object.values(breakdown).forEach((data: any) => {
      data.percentage = totalAnswers > 0 ? (data.count / totalAnswers) * 100 : 0;
    });

    return breakdown;
  }

  /**
   * Generate player results for reveal
   */
  private generatePlayerResults(gameState: GameState, question: GameQuestion): any[] {
    const results: any[] = [];
    
    question.playerAnswers.forEach((answer, playerId) => {
      const player = gameState.players.get(playerId);
      if (player) {
        results.push({
          userId: playerId,
          username: player.username,
          isCorrect: answer.isCorrect,
          timeTaken: answer.timeTaken,
          pointsEarned: answer.pointsEarned
        });
      }
    });

    return results.sort((a, b) => a.timeTaken - b.timeTaken); // Sort by response time
  }

  /**
   * Broadcast answer acknowledgment to player
   */
  private broadcastAnswerAcknowledgment(gameId: string, playerId: string, questionId: string): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) return;

    const player = gameState.players.get(playerId);
    if (!player || !player.socketId) return;

    const ackEvent: GameSyncEvent = {
      type: 'score_update',
      gameId,
      roomId: gameState.roomId,
      data: {
        userId: playerId,
        username: player.username,
        questionId,
        answeredCount: gameState.currentQuestion?.answeredCount || 0,
        totalPlayers: gameState.playerCount
      },
      timestamp: new Date(),
      version: gameState.version
    };

    // Send to all players in room
    this.io.to(gameState.roomId).emit('game_event', ackEvent);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for game state changes that affect questions
    this.gameStateSync.on('state:updated', ({ gameId, state, updates }) => {
      if (updates.status === 'FINISHED' || updates.status === 'CANCELLED') {
        this.cleanupGameQuestions(gameId);
      }
    });

    this.gameStateSync.on('state:unregistered', ({ gameId }) => {
      this.cleanupGameQuestions(gameId);
    });
  }

  /**
   * Cleanup question data for specific question
   */
  private cleanupQuestionData(questionId: string): void {
    this.deliveryStatus.delete(questionId);
    
    const monitorTimer = this.answerCollectionTimers.get(questionId);
    if (monitorTimer) {
      clearInterval(monitorTimer);
      this.answerCollectionTimers.delete(questionId);
    }
    
    const timeoutTimer = this.questionTimeouts.get(questionId);
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      this.questionTimeouts.delete(questionId);
    }
  }

  /**
   * Cleanup all questions for a game
   */
  private cleanupGameQuestions(gameId: string): void {
    // Clean up delivery status
    Array.from(this.deliveryStatus.keys()).forEach(questionId => {
      if (this.deliveryStatus.get(questionId)?.gameId === gameId) {
        this.cleanupQuestionData(questionId);
      }
    });

    // Clean up preloaded questions
    Array.from(this.preloadedQuestions.keys()).forEach(preloadId => {
      if (this.preloadedQuestions.get(preloadId)?.gameId === gameId) {
        this.preloadedQuestions.delete(preloadId);
      }
    });

    logger.info('Question data cleaned up for game', { gameId });
  }

  /**
   * Get delivery statistics for a game
   */
  public getDeliveryStats(gameId: string): any {
    const gameDeliveries = Array.from(this.deliveryStatus.values())
      .filter(status => status.gameId === gameId);
    
    const totalDeliveries = gameDeliveries.length;
    const successfulDeliveries = gameDeliveries.reduce((sum, status) => 
      sum + status.deliveredTo.size, 0);
    const failedDeliveries = gameDeliveries.reduce((sum, status) => 
      sum + status.failedDeliveries.size, 0);
    
    return {
      gameId,
      totalQuestions: totalDeliveries,
      totalDeliveries: successfulDeliveries + failedDeliveries,
      successfulDeliveries,
      failedDeliveries,
      successRate: totalDeliveries > 0 ? (successfulDeliveries / (successfulDeliveries + failedDeliveries)) * 100 : 0
    };
  }

  /**
   * Shutdown service and cleanup
   */
  public shutdown(): void {
    // Clear all timers
    this.answerCollectionTimers.forEach((timer) => clearInterval(timer));
    this.questionTimeouts.forEach((timer) => clearTimeout(timer));
    
    this.deliveryStatus.forEach((status) => {
      if (status.revealTimer) {
        clearTimeout(status.revealTimer);
      }
    });

    // Clear all data
    this.deliveryStatus.clear();
    this.preloadedQuestions.clear();
    this.answerCollectionTimers.clear();
    this.questionTimeouts.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('Question broadcast service shutdown completed');
  }
}

