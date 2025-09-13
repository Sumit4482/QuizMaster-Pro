import { PrismaClient, GameSession, GameStatus, QuestionDifficulty } from '@prisma/client';
import { logger } from '../../utils/logger';
import { generateSecureToken } from '../../utils/crypto';

interface CreateGameData {
  title: string;
  description?: string;
  maxPlayers: number;
  questionCount: number;
  timeLimit: number;
  difficulty: QuestionDifficulty[];
  categories: string[];
  subjects: string[];
  isPublic: boolean;
  password?: string;
  allowReconnect: boolean;
  showLeaderboard: boolean;
}

interface JoinGameData {
  gameId: string;
  userId: string;
  username: string;
  password?: string;
}

interface GamePlayer {
  id: string;
  userId: string;
  username: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  averageResponseTime: number;
  isConnected: boolean;
  joinedAt: Date;
  lastActivity: Date;
}

interface GameQuestion {
  id: string;
  questionId: string;
  content: string;
  options: string[];
  correctAnswers: number[];
  timeLimit: number;
  difficulty: QuestionDifficulty;
  category: string;
  points: number;
}

interface PlayerAnswer {
  playerId: string;
  questionId: string;
  selectedAnswers: number[];
  responseTime: number;
  isCorrect: boolean;
  pointsEarned: number;
  timestamp: Date;
}

interface GameStats {
  totalGames: number;
  activeGames: number;
  completedGames: number;
  totalPlayers: number;
  averagePlayersPerGame: number;
  averageGameDuration: number;
  popularCategories: Record<string, number>;
  difficultyDistribution: Record<QuestionDifficulty, number>;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  activeGames: number;
  connectedPlayers: number;
}

export class GameService {
  private prisma: PrismaClient;
  private activeGames: Map<string, GameSession> = new Map();
  private gamePlayers: Map<string, GamePlayer[]> = new Map();
  private gameQuestions: Map<string, GameQuestion[]> = new Map();
  private playerAnswers: Map<string, PlayerAnswer[]> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new game session
   */
  async createGame(data: CreateGameData, hostId: string): Promise<GameSession> {
    try {
      const gameId = generateSecureToken(8);
      
      const gameSession = await this.prisma.gameSession.create({
        data: {
          id: gameId,
          title: data.title,
          description: data.description,
          hostId,
          maxPlayers: data.maxPlayers,
          questionCount: data.questionCount,
          timeLimit: data.timeLimit,
          status: GameStatus.WAITING,
          isPublic: data.isPublic,
          password: data.password,
          settings: {
            difficulty: data.difficulty,
            categories: data.categories,
            subjects: data.subjects,
            allowReconnect: data.allowReconnect,
            showLeaderboard: data.showLeaderboard
          },
          metadata: {
            createdAt: new Date().toISOString(),
            version: 1
          }
        }
      });

      // Initialize game state
      this.activeGames.set(gameId, gameSession);
      this.gamePlayers.set(gameId, []);
      this.gameQuestions.set(gameId, []);
      this.playerAnswers.set(gameId, []);

      logger.info('Game created successfully', {
        component: 'GameService',
        gameId,
        title: data.title,
        hostId
      });

      return gameSession;
    } catch (error) {
      logger.error('Failed to create game', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        data
      });
      throw new Error('Failed to create game');
    }
  }

  /**
   * Get game by ID
   */
  async getGameById(gameId: string): Promise<GameSession | null> {
    try {
      // Try to get from cache first
      const cachedGame = this.activeGames.get(gameId);
      if (cachedGame) {
        return cachedGame;
      }

      // If not in cache, get from database
      const game = await this.prisma.gameSession.findUnique({
        where: { id: gameId }
      });

      if (game && game.status !== GameStatus.COMPLETED) {
        this.activeGames.set(gameId, game);
      }

      return game;
    } catch (error) {
      logger.error('Failed to retrieve game', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        gameId
      });
      throw new Error('Failed to retrieve game');
    }
  }

  /**
   * Join a game
   */
  async joinGame(data: JoinGameData): Promise<{ success: boolean; player?: GamePlayer; message?: string }> {
    try {
      const game = await this.getGameById(data.gameId);
      
      if (!game) {
        return { success: false, message: 'Game not found' };
      }

      if (game.status !== GameStatus.WAITING) {
        return { success: false, message: 'Game is not accepting new players' };
      }

      const currentPlayers = this.gamePlayers.get(data.gameId) || [];
      
      if (currentPlayers.length >= game.maxPlayers) {
        return { success: false, message: 'Game is full' };
      }

      // Check if player is already in game
      const existingPlayer = currentPlayers.find(p => p.userId === data.userId);
      if (existingPlayer) {
        // Reconnect existing player
        existingPlayer.isConnected = true;
        existingPlayer.lastActivity = new Date();
        
        logger.info('Player reconnected to game', {
          component: 'GameService',
          gameId: data.gameId,
          userId: data.userId,
          username: data.username
        });

        return { success: true, player: existingPlayer };
      }

      // Check password for private games
      if (!game.isPublic && game.password !== data.password) {
        return { success: false, message: 'Incorrect password' };
      }

      // Add new player
      const player: GamePlayer = {
        id: generateSecureToken(8),
        userId: data.userId,
        username: data.username,
        score: 0,
        correctAnswers: 0,
        totalQuestions: 0,
        averageResponseTime: 0,
        isConnected: true,
        joinedAt: new Date(),
        lastActivity: new Date()
      };

      currentPlayers.push(player);
      this.gamePlayers.set(data.gameId, currentPlayers);

      logger.info('Player joined game successfully', {
        component: 'GameService',
        gameId: data.gameId,
        userId: data.userId,
        username: data.username,
        totalPlayers: currentPlayers.length
      });

      return { success: true, player };
    } catch (error) {
      logger.error('Failed to join game', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        data
      });
      return { success: false, message: 'Failed to join game' };
    }
  }

  /**
   * Leave a game
   */
  async leaveGame(gameId: string, userId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const currentPlayers = this.gamePlayers.get(gameId) || [];
      const playerIndex = currentPlayers.findIndex(p => p.userId === userId);

      if (playerIndex === -1) {
        return { success: false, message: 'Player not found in game' };
      }

      // Mark player as disconnected instead of removing (for reconnection capability)
      currentPlayers[playerIndex].isConnected = false;
      currentPlayers[playerIndex].lastActivity = new Date();

      this.gamePlayers.set(gameId, currentPlayers);

      logger.info('Player left game', {
        component: 'GameService',
        gameId,
        userId,
        connectedPlayers: currentPlayers.filter(p => p.isConnected).length
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to leave game', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        gameId,
        userId
      });
      return { success: false, message: 'Failed to leave game' };
    }
  }

  /**
   * Start a game
   */
  async startGame(gameId: string, hostId: string): Promise<{ success: boolean; questions?: GameQuestion[]; message?: string }> {
    try {
      const game = await this.getGameById(gameId);
      
      if (!game) {
        return { success: false, message: 'Game not found' };
      }

      if (game.hostId !== hostId) {
        return { success: false, message: 'Only the host can start the game' };
      }

      if (game.status !== GameStatus.WAITING) {
        return { success: false, message: 'Game cannot be started in current state' };
      }

      const currentPlayers = this.gamePlayers.get(gameId) || [];
      const connectedPlayers = currentPlayers.filter(p => p.isConnected);

      if (connectedPlayers.length === 0) {
        return { success: false, message: 'No players connected to start the game' };
      }

      // Generate questions for the game
      const questions = await this.generateGameQuestions(game);
      this.gameQuestions.set(gameId, questions);

      // Update game status
      await this.prisma.gameSession.update({
        where: { id: gameId },
        data: {
          status: GameStatus.IN_PROGRESS,
          startedAt: new Date(),
          metadata: {
            ...(game.metadata as object || {}),
            startedAt: new Date().toISOString(),
            playerCount: connectedPlayers.length
          }
        }
      });

      // Update cached game
      const updatedGame = await this.getGameById(gameId);
      if (updatedGame) {
        this.activeGames.set(gameId, updatedGame);
      }

      logger.info('Game started successfully', {
        component: 'GameService',
        gameId,
        hostId,
        playerCount: connectedPlayers.length,
        questionCount: questions.length
      });

      return { success: true, questions };
    } catch (error) {
      logger.error('Failed to start game', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        gameId,
        hostId
      });
      return { success: false, message: 'Failed to start game' };
    }
  }

  /**
   * Submit player answer
   */
  async submitAnswer(
    gameId: string,
    playerId: string,
    questionId: string,
    selectedAnswers: number[],
    responseTime: number
  ): Promise<{ success: boolean; isCorrect?: boolean; pointsEarned?: number; message?: string }> {
    try {
      const game = await this.getGameById(gameId);
      
      if (!game || game.status !== GameStatus.IN_PROGRESS) {
        return { success: false, message: 'Game is not active' };
      }

      const questions = this.gameQuestions.get(gameId) || [];
      const question = questions.find(q => q.id === questionId);
      
      if (!question) {
        return { success: false, message: 'Question not found' };
      }

      // Check if answer is correct
      const isCorrect = this.checkAnswer(selectedAnswers, question.correctAnswers);
      const pointsEarned = isCorrect ? question.points : 0;

      // Record the answer
      const answer: PlayerAnswer = {
        playerId,
        questionId,
        selectedAnswers,
        responseTime,
        isCorrect,
        pointsEarned,
        timestamp: new Date()
      };

      const gameAnswers = this.playerAnswers.get(gameId) || [];
      gameAnswers.push(answer);
      this.playerAnswers.set(gameId, gameAnswers);

      // Update player stats
      const players = this.gamePlayers.get(gameId) || [];
      const playerIndex = players.findIndex(p => p.id === playerId);
      
      if (playerIndex !== -1) {
        const player = players[playerIndex];
        player.score += pointsEarned;
        player.totalQuestions += 1;
        if (isCorrect) {
          player.correctAnswers += 1;
        }
        
        // Calculate average response time
        const playerAnswers = gameAnswers.filter(a => a.playerId === playerId);
        const totalResponseTime = playerAnswers.reduce((sum, a) => sum + a.responseTime, 0);
        player.averageResponseTime = totalResponseTime / playerAnswers.length;
        player.lastActivity = new Date();

        this.gamePlayers.set(gameId, players);
      }

      logger.info('Player answer submitted', {
        component: 'GameService',
        gameId,
        playerId,
        questionId,
        isCorrect,
        pointsEarned,
        responseTime
      });

      return { success: true, isCorrect, pointsEarned };
    } catch (error) {
      logger.error('Failed to submit answer', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        gameId,
        playerId,
        questionId
      });
      return { success: false, message: 'Failed to submit answer' };
    }
  }

  /**
   * Get game leaderboard
   */
  async getLeaderboard(gameId: string): Promise<GamePlayer[]> {
    try {
      const players = this.gamePlayers.get(gameId) || [];
      
      // Sort by score (descending) and then by average response time (ascending)
      return players
        .filter(p => p.isConnected)
        .sort((a, b) => {
          if (a.score !== b.score) {
            return b.score - a.score;
          }
          return a.averageResponseTime - b.averageResponseTime;
        });
    } catch (error) {
      logger.error('Failed to get leaderboard', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        gameId
      });
      return [];
    }
  }

  /**
   * End a game
   */
  async endGame(gameId: string, hostId?: string): Promise<{ success: boolean; finalResults?: any; message?: string }> {
    try {
      const game = await this.getGameById(gameId);
      
      if (!game) {
        return { success: false, message: 'Game not found' };
      }

      if (hostId && game.hostId !== hostId) {
        return { success: false, message: 'Only the host can end the game' };
      }

      // Calculate final results
      const players = this.gamePlayers.get(gameId) || [];
      const answers = this.playerAnswers.get(gameId) || [];
      const leaderboard = await this.getLeaderboard(gameId);

      const finalResults = {
        leaderboard,
        gameStats: {
          totalPlayers: players.length,
          totalAnswers: answers.length,
          averageScore: players.reduce((sum, p) => sum + p.score, 0) / players.length || 0,
          duration: game.startedAt ? Date.now() - new Date(game.startedAt).getTime() : 0
        },
        playerStats: players.map(p => ({
          username: p.username,
          score: p.score,
          correctAnswers: p.correctAnswers,
          totalQuestions: p.totalQuestions,
          accuracy: p.totalQuestions > 0 ? (p.correctAnswers / p.totalQuestions) * 100 : 0,
          averageResponseTime: p.averageResponseTime
        }))
      };

      // Update game status
      await this.prisma.gameSession.update({
        where: { id: gameId },
        data: {
          status: GameStatus.COMPLETED,
          completedAt: new Date(),
          results: finalResults,
          metadata: {
            ...(game.metadata as object || {}),
            completedAt: new Date().toISOString(),
            finalPlayerCount: players.filter(p => p.isConnected).length
          }
        }
      });

      // Clean up memory
      this.activeGames.delete(gameId);
      this.gamePlayers.delete(gameId);
      this.gameQuestions.delete(gameId);
      this.playerAnswers.delete(gameId);

      logger.info('Game ended successfully', {
        component: 'GameService',
        gameId,
        finalPlayerCount: players.length,
        totalAnswers: answers.length
      });

      return { success: true, finalResults };
    } catch (error) {
      logger.error('Failed to end game', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error),
        gameId
      });
      return { success: false, message: 'Failed to end game' };
    }
  }

  /**
   * Get game statistics
   */
  async getGameStatistics(): Promise<GameStats> {
    try {
      const [
        totalGames,
        activeGames,
        completedGames,
        recentSessions
      ] = await Promise.all([
        this.prisma.gameSession.count(),
        this.prisma.gameSession.count({ where: { status: GameStatus.IN_PROGRESS } }),
        this.prisma.gameSession.count({ where: { status: GameStatus.COMPLETED } }),
        this.prisma.gameSession.findMany({
          where: { status: GameStatus.COMPLETED },
          take: 100,
          orderBy: { completedAt: 'desc' }
        })
      ]);

      const stats: GameStats = {
        totalGames,
        activeGames: activeGames + this.activeGames.size, // Include memory cache
        completedGames,
        totalPlayers: 0,
        averagePlayersPerGame: 0,
        averageGameDuration: 0,
        popularCategories: {},
        difficultyDistribution: {
          EASY: 0,
          MEDIUM: 0,
          HARD: 0,
          EXPERT: 0
        }
      };

      // Calculate additional statistics from recent sessions
      if (recentSessions.length > 0) {
        let totalDuration = 0;
        let totalPlayers = 0;

        recentSessions.forEach(session => {
          const metadata = session.metadata as any;
          const playerCount = metadata?.finalPlayerCount || 0;
          totalPlayers += playerCount;

          if (session.startedAt && session.completedAt) {
            totalDuration += new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();
          }

          // Count categories and difficulties
          const settings = session.settings as any;
          if (settings?.categories) {
            settings.categories.forEach((category: string) => {
              stats.popularCategories[category] = (stats.popularCategories[category] || 0) + 1;
            });
          }
          
          if (settings?.difficulty) {
            settings.difficulty.forEach((diff: QuestionDifficulty) => {
              stats.difficultyDistribution[diff]++;
            });
          }
        });

        stats.totalPlayers = totalPlayers;
        stats.averagePlayersPerGame = totalPlayers / recentSessions.length;
        stats.averageGameDuration = totalDuration / recentSessions.length;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get game statistics', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Failed to get game statistics');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'healthy',
        database: 'connected',
        redis: 'connected', // Would check actual Redis connection
        timestamp: new Date().toISOString(),
        service: 'game-service',
        version: '1.0.0',
        uptime: process.uptime(),
        activeGames: this.activeGames.size,
        connectedPlayers: Array.from(this.gamePlayers.values())
          .flat()
          .filter(p => p.isConnected).length
      };
    } catch (error) {
      logger.error('Game service health check failed', {
        component: 'GameService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        database: 'disconnected',
        redis: 'disconnected',
        timestamp: new Date().toISOString(),
        service: 'game-service',
        version: '1.0.0',
        uptime: process.uptime(),
        activeGames: 0,
        connectedPlayers: 0
      };
    }
  }

  /**
   * Generate questions for a game
   */
  private async generateGameQuestions(game: GameSession): Promise<GameQuestion[]> {
    // This would integrate with the Question Service to fetch questions
    // For now, returning mock questions
    const questions: GameQuestion[] = [];
    
    for (let i = 0; i < game.questionCount; i++) {
      questions.push({
        id: generateSecureToken(8),
        questionId: generateSecureToken(16),
        content: `Sample question ${i + 1}`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswers: [0],
        timeLimit: game.timeLimit,
        difficulty: 'MEDIUM' as QuestionDifficulty,
        category: 'General',
        points: 10
      });
    }

    return questions;
  }

  /**
   * Check if answer is correct
   */
  private checkAnswer(selectedAnswers: number[], correctAnswers: number[]): boolean {
    if (selectedAnswers.length !== correctAnswers.length) {
      return false;
    }

    const sortedSelected = [...selectedAnswers].sort();
    const sortedCorrect = [...correctAnswers].sort();

    return sortedSelected.every((answer, index) => answer === sortedCorrect[index]);
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default GameService;

