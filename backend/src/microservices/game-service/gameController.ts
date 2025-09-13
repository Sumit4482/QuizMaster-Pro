import { Request, Response } from 'express';
import { GameService } from './gameService';
import { logger } from '../../utils/logger';
import { 
  successResponse, 
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  unauthorizedResponse
} from '../../utils/responseUtils';
import { AuthenticatedRequest } from '../../types/auth';

export class GameController {
  private gameService: GameService;

  constructor() {
    this.gameService = new GameService();
  }

  /**
   * Create a new game session
   */
  public createGame = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        title,
        description,
        maxPlayers,
        questionCount,
        timeLimit,
        difficulty,
        categories,
        subjects,
        isPublic,
        password,
        allowReconnect,
        showLeaderboard
      } = req.body;

      if (!title || !maxPlayers || !questionCount || !timeLimit || !difficulty || !categories || !subjects) {
        badRequestResponse(res, 'Missing required fields: title, maxPlayers, questionCount, timeLimit, difficulty, categories, subjects');
        return;
      }

      if (!req.user?.id) {
        unauthorizedResponse(res, 'User authentication required');
        return;
      }

      const game = await this.gameService.createGame({
        title,
        description,
        maxPlayers,
        questionCount,
        timeLimit,
        difficulty,
        categories,
        subjects,
        isPublic: isPublic ?? true,
        password,
        allowReconnect: allowReconnect ?? true,
        showLeaderboard: showLeaderboard ?? true
      }, req.user.id);

      logger.info('Game created successfully', {
        component: 'GameController',
        gameId: game.id,
        hostId: req.user.id,
        title
      });

      successResponse(res, game, 'Game created successfully', 201);
    } catch (error) {
      logger.error('Create game failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to create game');
    }
  };

  /**
   * Get game by ID
   */
  public getGame = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        badRequestResponse(res, 'Game ID is required');
        return;
      }

      const game = await this.gameService.getGameById(id);

      if (!game) {
        notFoundResponse(res, 'Game not found');
        return;
      }

      logger.info('Game retrieved successfully', {
        component: 'GameController',
        gameId: id
      });

      successResponse(res, game, 'Game retrieved successfully');
    } catch (error) {
      logger.error('Get game failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        gameId: req.params.id
      });

      errorResponse(res, 'Failed to retrieve game');
    }
  };

  /**
   * Join a game
   */
  public joinGame = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { gameId } = req.params;
      const { username, password } = req.body;

      if (!gameId) {
        badRequestResponse(res, 'Game ID is required');
        return;
      }

      if (!username) {
        badRequestResponse(res, 'Username is required');
        return;
      }

      if (!req.user?.id) {
        unauthorizedResponse(res, 'User authentication required');
        return;
      }

      const result = await this.gameService.joinGame({
        gameId,
        userId: req.user.id,
        username,
        password
      });

      if (!result.success) {
        badRequestResponse(res, result.message || 'Failed to join game');
        return;
      }

      logger.info('Player joined game successfully', {
        component: 'GameController',
        gameId,
        userId: req.user.id,
        username
      });

      successResponse(res, { player: result.player }, 'Successfully joined game');
    } catch (error) {
      logger.error('Join game failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        gameId: req.params.gameId,
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to join game');
    }
  };

  /**
   * Leave a game
   */
  public leaveGame = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { gameId } = req.params;

      if (!gameId) {
        badRequestResponse(res, 'Game ID is required');
        return;
      }

      if (!req.user?.id) {
        unauthorizedResponse(res, 'User authentication required');
        return;
      }

      const result = await this.gameService.leaveGame(gameId, req.user.id);

      if (!result.success) {
        badRequestResponse(res, result.message || 'Failed to leave game');
        return;
      }

      logger.info('Player left game successfully', {
        component: 'GameController',
        gameId,
        userId: req.user.id
      });

      successResponse(res, {}, 'Successfully left game');
    } catch (error) {
      logger.error('Leave game failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        gameId: req.params.gameId,
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to leave game');
    }
  };

  /**
   * Start a game
   */
  public startGame = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { gameId } = req.params;

      if (!gameId) {
        badRequestResponse(res, 'Game ID is required');
        return;
      }

      if (!req.user?.id) {
        unauthorizedResponse(res, 'User authentication required');
        return;
      }

      const result = await this.gameService.startGame(gameId, req.user.id);

      if (!result.success) {
        badRequestResponse(res, result.message || 'Failed to start game');
        return;
      }

      logger.info('Game started successfully', {
        component: 'GameController',
        gameId,
        hostId: req.user.id,
        questionCount: result.questions?.length || 0
      });

      successResponse(res, { questions: result.questions }, 'Game started successfully');
    } catch (error) {
      logger.error('Start game failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        gameId: req.params.gameId,
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to start game');
    }
  };

  /**
   * Submit player answer
   */
  public submitAnswer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { gameId, questionId } = req.params;
      const { playerId, selectedAnswers, responseTime } = req.body;

      if (!gameId || !questionId) {
        badRequestResponse(res, 'Game ID and Question ID are required');
        return;
      }

      if (!playerId || selectedAnswers === undefined || responseTime === undefined) {
        badRequestResponse(res, 'Player ID, selected answers, and response time are required');
        return;
      }

      if (!req.user?.id) {
        unauthorizedResponse(res, 'User authentication required');
        return;
      }

      const result = await this.gameService.submitAnswer(
        gameId,
        playerId,
        questionId,
        selectedAnswers,
        responseTime
      );

      if (!result.success) {
        badRequestResponse(res, result.message || 'Failed to submit answer');
        return;
      }

      logger.info('Answer submitted successfully', {
        component: 'GameController',
        gameId,
        questionId,
        playerId,
        isCorrect: result.isCorrect,
        pointsEarned: result.pointsEarned
      });

      successResponse(res, {
        isCorrect: result.isCorrect,
        pointsEarned: result.pointsEarned
      }, 'Answer submitted successfully');
    } catch (error) {
      logger.error('Submit answer failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        gameId: req.params.gameId,
        questionId: req.params.questionId
      });

      errorResponse(res, 'Failed to submit answer');
    }
  };

  /**
   * Get game leaderboard
   */
  public getLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const { gameId } = req.params;

      if (!gameId) {
        badRequestResponse(res, 'Game ID is required');
        return;
      }

      const leaderboard = await this.gameService.getLeaderboard(gameId);

      logger.info('Leaderboard retrieved successfully', {
        component: 'GameController',
        gameId,
        playerCount: leaderboard.length
      });

      successResponse(res, { leaderboard }, 'Leaderboard retrieved successfully');
    } catch (error) {
      logger.error('Get leaderboard failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        gameId: req.params.gameId
      });

      errorResponse(res, 'Failed to retrieve leaderboard');
    }
  };

  /**
   * End a game
   */
  public endGame = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { gameId } = req.params;

      if (!gameId) {
        badRequestResponse(res, 'Game ID is required');
        return;
      }

      if (!req.user?.id) {
        unauthorizedResponse(res, 'User authentication required');
        return;
      }

      const result = await this.gameService.endGame(gameId, req.user.id);

      if (!result.success) {
        badRequestResponse(res, result.message || 'Failed to end game');
        return;
      }

      logger.info('Game ended successfully', {
        component: 'GameController',
        gameId,
        hostId: req.user.id
      });

      successResponse(res, { results: result.finalResults }, 'Game ended successfully');
    } catch (error) {
      logger.error('End game failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error),
        gameId: req.params.gameId,
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to end game');
    }
  };

  /**
   * Get game statistics
   */
  public getStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.gameService.getGameStatistics();

      logger.info('Game statistics retrieved successfully', {
        component: 'GameController',
        totalGames: stats.totalGames,
        activeGames: stats.activeGames
      });

      successResponse(res, stats, 'Statistics retrieved successfully');
    } catch (error) {
      logger.error('Get game statistics failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to retrieve statistics');
    }
  };

  /**
   * Search public games
   */
  public searchPublicGames = async (req: Request, res: Response): Promise<void> => {
    try {
      // This would implement game search functionality
      // For now, returning a mock response
      
      const { category, difficulty, status, limit = 20, offset = 0 } = req.query;

      logger.info('Public games search requested', {
        component: 'GameController',
        category,
        difficulty,
        status
      });

      // Mock data for now
      const games = [
        {
          id: 'game1',
          title: 'General Knowledge Quiz',
          description: 'Test your general knowledge',
          maxPlayers: 10,
          currentPlayers: 3,
          status: 'WAITING',
          category: 'General',
          difficulty: 'MEDIUM',
          isPublic: true
        }
      ];

      successResponse(res, {
        games,
        total: games.length,
        hasMore: false
      }, 'Public games retrieved successfully');
    } catch (error) {
      logger.error('Search public games failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to search public games');
    }
  };

  /**
   * Health check for game service
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.gameService.healthCheck();

      if (health.status === 'healthy') {
        successResponse(res, health, 'Game service is healthy');
      } else {
        errorResponse(res, 'Game service is unhealthy', 503, health);
      }
    } catch (error) {
      logger.error('Game service health check failed', {
        component: 'GameController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Game service is unhealthy', 503);
    }
  };
}

export default GameController;

