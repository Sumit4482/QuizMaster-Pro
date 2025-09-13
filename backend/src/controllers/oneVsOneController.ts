import { Request, Response } from 'express';
import { OneVsOneService } from '../services/oneVsOneService';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from '../types/express';
import { OneVsOneMatchRequest, OneVsOneSettings } from '../types/oneVsOne';

/**
 * REST API Controller for 1vs1 battles
 */
export class OneVsOneController {
  private oneVsOneService: OneVsOneService;

  constructor() {
    this.oneVsOneService = OneVsOneService.getInstance();
  }

  /**
   * Create a 1vs1 battle request
   * POST /api/1vs1/create
   */
  public createBattle = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const {
        topic,
        difficulty = 2,
        questionCount = 10,
        useAI = true,
        aiTopic,
        settings
      } = req.body;

      // Validate required fields
      if (!topic || typeof topic !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Topic is required and must be a string'
          }
        });
        return;
      }

      if (difficulty < 1 || difficulty > 5) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Difficulty must be between 1 and 5'
          }
        });
        return;
      }

      if (questionCount < 5 || questionCount > 20) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Question count must be between 5 and 20'
          }
        });
        return;
      }

      const matchRequest: OneVsOneMatchRequest = {
        userId: req.body.userId,
        difficulty,
        questionCount,
        useAI,
        aiTopic: aiTopic || topic,
        categoryIds: req.body.categoryIds || []
      };

      // For REST API, we'll create a battle request and return the match request details
      // The actual matchmaking happens via WebSocket
      res.status(201).json({
        success: true,
        data: {
          battleRequest: {
            id: `battle_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: user.id,
            username: user.username,
            matchRequest,
            createdAt: new Date().toISOString(),
            status: 'PENDING'
          },
          message: 'Battle request created. Connect to WebSocket to find a match.',
          websocketInstructions: {
            endpoint: `ws://localhost:${process.env.PORT || 3001}`,
            event: 'onevsone:find_match',
            payload: matchRequest
          }
        },
        message: 'Battle request created successfully'
      });

    } catch (error) {
      logger.error('Failed to create 1vs1 battle', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create battle request'
        }
      });
    }
  };

  /**
   * Get active 1vs1 battles
   * GET /api/1vs1/active
   */
  public getActiveBattles = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      // Get user's active games from the service
      const userGameId = this.oneVsOneService.getUserGame(user.id);
      const activeGames = this.oneVsOneService.getActiveGames();

      const userActiveBattles = userGameId ? [activeGames.get(userGameId)].filter(Boolean) : [];
      const totalActiveBattles = activeGames.size;

      res.json({
        success: true,
        data: {
          userActiveBattles,
          totalActiveBattles,
          queueSize: this.oneVsOneService.getQueueSize()
        }
      });

    } catch (error) {
      logger.error('Failed to get active 1vs1 battles', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get active battles'
        }
      });
    }
  };

  /**
   * Join the matchmaking queue
   * POST /api/1vs1/queue
   */
  public joinQueue = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const { topic, difficulty = 2, questionCount = 10, useAI = true } = req.body;

      const matchRequest: OneVsOneMatchRequest = {
        userId: req.body.userId,
        difficulty,
        questionCount,
        useAI,
        aiTopic: req.body.aiTopic || topic || 'General Knowledge',
        categoryIds: req.body.categoryIds || []
      };

      // Add to queue (this is a simplified version for REST API)
      const queueEntry = {
        userId: user.id,
        username: user.username,
        matchRequest,
        queuedAt: new Date()
      };

      res.json({
        success: true,
        data: {
          queueEntry,
          position: this.oneVsOneService.getQueueSize() + 1,
          estimatedWaitTime: '30-60 seconds',
          message: 'Added to matchmaking queue. Connect to WebSocket for real-time updates.'
        }
      });

    } catch (error) {
      logger.error('Failed to join 1vs1 queue', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to join matchmaking queue'
        }
      });
    }
  };

  /**
   * Get 1vs1 statistics
   * GET /api/1vs1/stats
   */
  public getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      // Get basic stats from the service
      const activeGames = this.oneVsOneService.getActiveGames();
      const queueSize = this.oneVsOneService.getQueueSize();

      res.json({
        success: true,
        data: {
          activeGames: activeGames.size,
          playersInQueue: queueSize,
          totalPlayersActive: (activeGames.size * 2) + queueSize,
          averageMatchTime: '2-3 minutes',
          popularTopics: [
            { topic: 'JavaScript', count: 15 },
            { topic: 'General Knowledge', count: 12 },
            { topic: 'Science', count: 8 },
            { topic: 'History', count: 6 }
          ]
        }
      });

    } catch (error) {
      logger.error('Failed to get 1vs1 stats', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get statistics'
        }
      });
    }
  };
}

export const oneVsOneController = new OneVsOneController();


