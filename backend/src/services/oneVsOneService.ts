import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { generateAIQuestions, AIQuestion } from '@/utils/aiQuestionGenerator';
import { QuestionService } from './questionService';
import {
  OneVsOneMatchRequest,
  OneVsOneGame,
  OneVsOnePlayer,
  OneVsOneQuestion,
  OneVsOneGameStatus,
  OneVsOneMatchResult,
  OneVsOneSettings,
} from '@/types/oneVsOne';

/**
 * 1vs1 Game Service
 * Handles matchmaking, game creation, and real-time 1vs1 gameplay
 */
export class OneVsOneService extends EventEmitter {
  private static instance: OneVsOneService | null = null;
  private io: Server | null = null;
  
  private matchmakingQueue: Map<string, OneVsOneMatchRequest> = new Map();
  private activeGames: Map<string, OneVsOneGame> = new Map();
  private userGameMap: Map<string, string> = new Map(); // userId -> gameId
  private questionService: QuestionService;

  private constructor() {
    super();
    this.questionService = new QuestionService();
  }

  public static getInstance(): OneVsOneService {
    if (!OneVsOneService.instance) {
      OneVsOneService.instance = new OneVsOneService();
    }
    return OneVsOneService.instance;
  }

  public initialize(io: Server): void {
    this.io = io;
    logger.info('1vs1 Service initialized');
  }

  /**
   * Add player to matchmaking queue
   */
  public async findMatch(userId: string, username: string, socketId: string, request: OneVsOneMatchRequest): Promise<void> {
    try {
      // Remove any existing entries for this user
      this.cancelSearch(userId);

      // Add to queue
      this.matchmakingQueue.set(userId, { ...request, userId });

      logger.info('Player added to 1vs1 matchmaking queue', {
        userId,
        username,
        useAI: request.useAI,
        topic: request.aiTopic
      });

      // Try to find a match
      await this.tryMatchmaking(userId, username, socketId, request);

    } catch (error) {
      logger.error('Failed to add player to matchmaking queue', { error, userId });
      throw error;
    }
  }

  /**
   * Remove player from matchmaking queue
   */
  public cancelSearch(userId: string): void {
    if (this.matchmakingQueue.has(userId)) {
      this.matchmakingQueue.delete(userId);
      logger.info('Player removed from matchmaking queue', { userId });
    }
  }

  /**
   * Try to find a match for the player
   */
  private async tryMatchmaking(
    userId: string, 
    username: string, 
    socketId: string, 
    request: OneVsOneMatchRequest
  ): Promise<void> {
    // Look for compatible opponent
    for (const [opponentId, opponentRequest] of this.matchmakingQueue.entries()) {
      if (opponentId === userId) continue;

      // Check compatibility
      if (this.arePlayersCompatible(request, opponentRequest)) {
        // Found a match!
        await this.createMatch(
          { userId, username, socketId, request },
          { userId: opponentId, request: opponentRequest }
        );
        return;
      }
    }

    // No match found yet, player remains in queue
    logger.info('No match found yet, player remains in queue', { userId });
  }

  /**
   * Check if two players are compatible for matching
   */
  private arePlayersCompatible(req1: OneVsOneMatchRequest, req2: OneVsOneMatchRequest): boolean {
    // Match based on:
    // 1. AI vs Library preference
    // 2. Similar difficulty
    // 3. Similar AI topic (if AI mode)
    
    if (req1.useAI !== req2.useAI) return false;
    
    if (Math.abs(req1.difficulty - req2.difficulty) > 1) return false;
    
    if (req1.useAI && req1.aiTopic && req2.aiTopic) {
      // For AI mode, topics should be similar or related (simplified to exact match for now)
      if (req1.aiTopic.toLowerCase() !== req2.aiTopic.toLowerCase()) return false;
    }
    
    return true;
  }

  /**
   * Create a 1vs1 match between two players
   */
  private async createMatch(
    player1: { userId: string; username: string; socketId: string; request: OneVsOneMatchRequest },
    player2: { userId: string; request: OneVsOneMatchRequest }
  ): Promise<void> {
    try {
      // Remove both players from queue
      this.matchmakingQueue.delete(player1.userId);
      this.matchmakingQueue.delete(player2.userId);

      // Get player 2's socket
      const player2Socket = this.findSocketByUserId(player2.userId);
      if (!player2Socket) {
        throw new Error('Player 2 socket not found');
      }

      // Generate questions
      const questions = await this.generateQuestions(player1.request);

      // Create game
      const gameId = `1v1_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const game: OneVsOneGame = {
        id: gameId,
        player1: {
          userId: player1.userId,
          username: player1.username,
          socketId: player1.socketId,
          isReady: false,
          isConnected: true,
          score: 0,
          correctAnswers: 0,
        },
        player2: {
          userId: player2.userId,
          username: (player2Socket as any).data?.user?.username || 'Player 2',
          socketId: player2Socket.id,
          isReady: false,
          isConnected: true,
          score: 0,
          correctAnswers: 0,
        },
        questions,
        currentQuestionIndex: -1,
        status: 'WAITING_FOR_READY',
        useAI: player1.request.useAI,
        aiTopic: player1.request.aiTopic,
        createdAt: new Date(),
        settings: {
          timePerQuestion: 30,
          questionCount: questions.length,
          allowHints: false,
          showExplanations: true,
        }
      };

      // Store game
      this.activeGames.set(gameId, game);
      this.userGameMap.set(player1.userId, gameId);
      this.userGameMap.set(player2.userId, gameId);

      // Notify both players
      if (this.io) {
        this.io.to(player1.socketId).emit('onevsone:match_found', {
          gameId,
          opponent: {
            userId: player2.userId,
            username: game.player2.username,
            isReady: false,
            isConnected: true,
            score: 0,
            correctAnswers: 0,
          }
        });

        this.io.to(player2Socket.id).emit('onevsone:match_found', {
          gameId,
          opponent: {
            userId: player1.userId,
            username: player1.username,
            isReady: false,
            isConnected: true,
            score: 0,
            correctAnswers: 0,
          }
        });
      }

      logger.info('1vs1 match created', {
        gameId,
        player1: player1.userId,
        player2: player2.userId,
        useAI: game.useAI,
        topic: game.aiTopic
      });

    } catch (error) {
      logger.error('Failed to create 1vs1 match', { error });
      throw error;
    }
  }

  /**
   * Generate questions for the game
   */
  private async generateQuestions(request: OneVsOneMatchRequest): Promise<OneVsOneQuestion[]> {
    const questionCount = Math.min(request.questionCount, 10); // Max 10 questions for 1vs1
    
    logger.info('Generating questions for 1vs1 match', {
      useAI: request.useAI,
      aiTopic: request.aiTopic,
      questionCount,
      difficulty: request.difficulty,
      categoryIds: request.categoryIds
    });
    
    if (request.useAI && request.aiTopic) {
      try {
        // Generate AI questions
        const aiQuestions = await generateAIQuestions({
          topic: request.aiTopic,
          difficulty: request.difficulty,
          count: questionCount,
          questionType: 'MULTIPLE_CHOICE'
        });

        logger.info('AI questions generated', {
          count: aiQuestions.length,
          questions: aiQuestions.map(q => ({
            questionText: q.questionText,
            optionsCount: q.options?.length || 0,
            hasOptions: Array.isArray(q.options) && q.options.length > 0
          }))
        });

        const mappedQuestions = aiQuestions.map((q, index) => ({
          id: `ai_${Date.now()}_${index}`,
          text: q.questionText,
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          difficulty: q.difficulty,
          timeLimit: 30,
        }));

        logger.info('Mapped AI questions for 1vs1', {
          count: mappedQuestions.length,
          questions: mappedQuestions.map(q => ({
            id: q.id,
            text: q.text,
            optionsCount: q.options.length,
            options: q.options
          }))
        });

        return mappedQuestions;
      } catch (error) {
        logger.error('Failed to generate AI questions for 1vs1, falling back to database', { error });
        // Fall back to database questions
      }
    }
    
    // Get database questions (either by choice or fallback)
    logger.info('Using database questions for 1vs1');
    const dbQuestions = await this.questionService.searchQuestions({
      categoryIds: request.categoryIds || [],
      difficultyLevel: [request.difficulty as any],
      questionType: 'MULTIPLE_CHOICE',
      limit: questionCount,
      page: 1,
    });

    logger.info('Database questions retrieved', {
      count: dbQuestions.questions.length,
      questions: dbQuestions.questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        optionsType: typeof q.options,
        optionsLength: Array.isArray(q.options) ? q.options.length : 'NOT_ARRAY'
      }))
    });

    return dbQuestions.questions.map(q => ({
      id: q.id,
      text: q.questionText,
      options: Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options) : []),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
      difficulty: q.difficultyLevel,
      timeLimit: 30,
    }));
  }

  /**
   * Mark player as ready
   */
  public async playerReady(userId: string): Promise<void> {
    const gameId = this.userGameMap.get(userId);
    if (!gameId) {
      throw new Error('User not in any active game');
    }

    const game = this.activeGames.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    // Mark player as ready
    if (game.player1.userId === userId) {
      game.player1.isReady = true;
    } else if (game.player2.userId === userId) {
      game.player2.isReady = true;
    }

    // Check if both players are ready
    if (game.player1.isReady && game.player2.isReady) {
      await this.startGame(gameId);
    }

    logger.info('Player marked as ready', { userId, gameId, bothReady: game.player1.isReady && game.player2.isReady });
  }

  /**
   * Start the game
   */
  private async startGame(gameId: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    game.status = 'STARTING';
    game.startedAt = new Date();

    // Notify players game is starting
    if (this.io) {
      this.io.to(game.player1.socketId).emit('onevsone:game_starting', { countdown: 3 });
      this.io.to(game.player2.socketId).emit('onevsone:game_starting', { countdown: 3 });
    }

    // Start first question after countdown
    setTimeout(() => {
      this.nextQuestion(gameId);
    }, 3000);

    logger.info('1vs1 game starting', { gameId });
  }

  /**
   * Move to next question
   */
  private async nextQuestion(gameId: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    game.currentQuestionIndex++;
    
    if (game.currentQuestionIndex >= game.questions.length) {
      // Game finished
      await this.finishGame(gameId);
      return;
    }

    const question = game.questions[game.currentQuestionIndex];
    game.status = 'IN_PROGRESS';

    // Clear previous answers
    question.player1Answer = undefined;
    question.player2Answer = undefined;
    question.player1AnsweredAt = undefined;
    question.player2AnsweredAt = undefined;

    // Send question to both players (without correct answer)
    const questionForClient = {
      id: question.id,
      text: question.text,
      options: Array.isArray(question.options) ? question.options : [],
      difficulty: question.difficulty,
      timeLimit: question.timeLimit,
    };

    logger.info('Sending 1vs1 question to players', { 
      gameId, 
      questionIndex: game.currentQuestionIndex,
      questionId: question.id,
      questionText: question.text,
      optionsCount: questionForClient.options.length,
      options: questionForClient.options,
      hasOptions: Array.isArray(question.options) && question.options.length > 0
    });

    if (this.io) {
      this.io.to(game.player1.socketId).emit('onevsone:question', {
        question: questionForClient,
        questionIndex: game.currentQuestionIndex
      });
      this.io.to(game.player2.socketId).emit('onevsone:question', {
        question: questionForClient,
        questionIndex: game.currentQuestionIndex
      });
    }

    // Set timeout for question
    setTimeout(() => {
      this.processQuestionResults(gameId);
    }, (question.timeLimit + 2) * 1000); // Add 2 seconds buffer

    logger.info('Next question sent', { 
      gameId, 
      questionIndex: game.currentQuestionIndex,
      question: question.text
    });
  }

  /**
   * Submit player answer
   */
  public async submitAnswer(userId: string, answer: string, timeToAnswer: number): Promise<void> {
    const gameId = this.userGameMap.get(userId);
    if (!gameId) return;

    const game = this.activeGames.get(gameId);
    if (!game || game.status !== 'IN_PROGRESS') return;

    const question = game.questions[game.currentQuestionIndex];
    const now = new Date();

    if (game.player1.userId === userId) {
      question.player1Answer = answer;
      question.player1AnsweredAt = now;
      game.player1.timeToAnswer = timeToAnswer;
    } else if (game.player2.userId === userId) {
      question.player2Answer = answer;
      question.player2AnsweredAt = now;
      game.player2.timeToAnswer = timeToAnswer;
    }

    // Check if both players answered
    if (question.player1Answer && question.player2Answer) {
      await this.processQuestionResults(gameId);
    }

    logger.info('Player submitted answer', { 
      userId, 
      gameId, 
      answer, 
      timeToAnswer,
      bothAnswered: question.player1Answer && question.player2Answer
    });
  }

  /**
   * Process question results and show scores
   */
  private async processQuestionResults(gameId: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    const question = game.questions[game.currentQuestionIndex];
    game.status = 'ROUND_COMPLETE';

    // Calculate results
    const player1Correct = question.player1Answer === question.correctAnswer;
    const player2Correct = question.player2Answer === question.correctAnswer;

    // Award points with improved scoring
    if (player1Correct) {
      const timeBonus = Math.max(0, 30 - Math.floor((game.player1.timeToAnswer || 30000) / 1000));
      const basePoints = 100;
      const bonusPoints = Math.floor(timeBonus * 2);
      const totalPoints = basePoints + bonusPoints;
      
      game.player1.score += totalPoints;
      game.player1.correctAnswers++;
      
      logger.info('Player 1 scored points', {
        gameId,
        basePoints,
        timeBonus,
        bonusPoints,
        totalPoints,
        newScore: game.player1.score
      });
    }

    if (player2Correct) {
      const timeBonus = Math.max(0, 30 - Math.floor((game.player2.timeToAnswer || 30000) / 1000));
      const basePoints = 100;
      const bonusPoints = Math.floor(timeBonus * 2);
      const totalPoints = basePoints + bonusPoints;
      
      game.player2.score += totalPoints;
      game.player2.correctAnswers++;
      
      logger.info('Player 2 scored points', {
        gameId,
        basePoints,
        timeBonus,
        bonusPoints,
        totalPoints,
        newScore: game.player2.score
      });
    }

    // Send results to both players
    if (this.io) {
      const results = {
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        player1Answer: question.player1Answer,
        player2Answer: question.player2Answer,
        player1Correct,
        player2Correct,
        currentScores: {
          player1: game.player1.score,
          player2: game.player2.score
        }
      };

      this.io.to(game.player1.socketId).emit('onevsone:round_result', results);
      this.io.to(game.player2.socketId).emit('onevsone:round_result', results);
    }

    // Continue to next question after showing results
    setTimeout(() => {
      this.nextQuestion(gameId);
    }, 5000); // 5 seconds to show results

    logger.info('Question results processed', {
      gameId,
      questionIndex: game.currentQuestionIndex,
      player1Correct,
      player2Correct,
      scores: { player1: game.player1.score, player2: game.player2.score }
    });
  }

  /**
   * Finish the game and determine winner
   */
  private async finishGame(gameId: string): Promise<void> {
    const game = this.activeGames.get(gameId);
    if (!game) return;

    game.status = 'FINISHED';
    game.endedAt = new Date();

    // Determine winner
    let winnerId: string | undefined;
    const isDraw = game.player1.score === game.player2.score;
    
    if (!isDraw) {
      winnerId = game.player1.score > game.player2.score ? game.player1.userId : game.player2.userId;
    }

    const result: OneVsOneMatchResult = {
      gameId,
      winnerId,
      isDraw,
      player1Score: game.player1.score,
      player2Score: game.player2.score,
      totalQuestions: game.questions.length,
      gameSettings: game.settings,
      gameDuration: Math.floor((game.endedAt.getTime() - (game.startedAt?.getTime() || 0)) / 1000)
    };

    // Notify players
    if (this.io) {
      this.io.to(game.player1.socketId).emit('onevsone:game_finished', result);
      this.io.to(game.player2.socketId).emit('onevsone:game_finished', result);
    }

    // Cleanup
    this.userGameMap.delete(game.player1.userId);
    this.userGameMap.delete(game.player2.userId);
    this.activeGames.delete(gameId);

    logger.info('1vs1 game finished', {
      gameId,
      winnerId,
      isDraw,
      finalScores: { player1: game.player1.score, player2: game.player2.score }
    });
  }

  /**
   * Handle player disconnection
   */
  public handlePlayerDisconnection(userId: string): void {
    const gameId = this.userGameMap.get(userId);
    if (!gameId) return;

    const game = this.activeGames.get(gameId);
    if (!game) return;

    // Cancel the game
    game.status = 'CANCELLED';

    // Notify the other player
    const otherPlayer = game.player1.userId === userId ? game.player2 : game.player1;
    if (this.io) {
      this.io.to(otherPlayer.socketId).emit('onevsone:opponent_disconnected');
    }

    // Cleanup
    this.userGameMap.delete(game.player1.userId);
    this.userGameMap.delete(game.player2.userId);
    this.activeGames.delete(gameId);

    logger.info('1vs1 game cancelled due to disconnection', {
      gameId,
      disconnectedPlayer: userId
    });
  }

  /**
   * Get game state for a user
   */
  public getGameForUser(userId: string): OneVsOneGame | null {
    const gameId = this.userGameMap.get(userId);
    if (!gameId) return null;
    
    return this.activeGames.get(gameId) || null;
  }

  /**
   * Get the size of the matchmaking queue
   */
  public getQueueSize(): number {
    return this.matchmakingQueue.size;
  }

  /**
   * Get all active games
   */
  public getActiveGames(): Map<string, OneVsOneGame> {
    return new Map(this.activeGames);
  }

  /**
   * Get user's active game ID
   */
  public getUserGame(userId: string): string | undefined {
    return this.userGameMap.get(userId);
  }

  /**
   * Find socket by user ID
   */
  private findSocketByUserId(userId: string): any {
    if (!this.io) return null;

    for (const socket of this.io.sockets.sockets.values()) {
      if ((socket as any).data?.user?.id === userId) {
        return socket;
      }
    }
    return null;
  }
}
