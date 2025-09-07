import { Request, Response, NextFunction } from 'express';
import { QuizSessionService } from '@/services/quizSessionService';
import { QuizResultsService } from '@/services/quizResultsService';
import { AuthenticatedRequest } from '@/types/express';
import { logger } from '@/config/logger';
import {
  CreateQuizSessionRequest,
  SubmitAnswerRequest,
  QuizSessionSearchParams,
  QuizSessionStatus,
} from '@/types/quiz';

// Helper functions for responses
const sendSuccess = (res: Response, data: any, message: string, status = 200) => {
  return res.status(status).json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  });
};

const sendError = (res: Response, message: string, code: string, status = 400) => {
  return res.status(status).json({
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString()
  });
};

export class QuizController {
  private quizSessionService: QuizSessionService;
  private quizResultsService: QuizResultsService;

  constructor() {
    this.quizSessionService = new QuizSessionService();
    this.quizResultsService = new QuizResultsService();
  }

  /**
   * Create a new quiz session
   * POST /api/quiz/sessions
   */
  createSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const config: CreateQuizSessionRequest = req.body;

      // Validate required fields
      if (!config.totalQuestions || !config.categoryIds || !config.difficultyLevels || !config.questionTypes) {
        sendError(res, 'Missing required quiz configuration', 'INVALID_CONFIG', 400);
        return;
      }

      const session = await this.quizSessionService.createSession(userId, config);

      logger.info('Quiz session created via API', { sessionId: session.id, userId });
      sendSuccess(res, session, 'Quiz session created successfully', 201);
    } catch (error) {
      logger.error('Error in createSession controller', { error, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Start a quiz session
   * POST /api/quiz/sessions/:sessionId/start
   */
  startSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      if (!sessionId) {
        sendError(res, 'Session ID is required', 'INVALID_SESSION_ID', 400);
        return;
      }

      const session = await this.quizSessionService.startSession(sessionId, userId);

      logger.info('Quiz session started via API', { sessionId, userId });
      sendSuccess(res, session, 'Quiz session started successfully');
    } catch (error) {
      logger.error('Error in startSession controller', { error, sessionId: req.params.sessionId, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Pause a quiz session
   * POST /api/quiz/sessions/:sessionId/pause
   */
  pauseSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const session = await this.quizSessionService.pauseSession(sessionId, userId);

      logger.info('Quiz session paused via API', { sessionId, userId });
      sendSuccess(res, session, 'Quiz session paused successfully');
    } catch (error) {
      logger.error('Error in pauseSession controller', { error, sessionId: req.params.sessionId, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Resume a quiz session
   * POST /api/quiz/sessions/:sessionId/resume
   */
  resumeSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const session = await this.quizSessionService.resumeSession(sessionId, userId);

      logger.info('Quiz session resumed via API', { sessionId, userId });
      sendSuccess(res, session, 'Quiz session resumed successfully');
    } catch (error) {
      logger.error('Error in resumeSession controller', { error, sessionId: req.params.sessionId, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Get current question for a session
   * GET /api/quiz/sessions/:sessionId/current-question
   */
  getCurrentQuestion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const question = await this.quizSessionService.getCurrentQuestion(sessionId, userId);

      if (!question) {
        sendSuccess(res, null, 'Quiz completed - no more questions');
        return;
      }

      sendSuccess(res, question, 'Current question retrieved successfully');
    } catch (error) {
      logger.error('Error in getCurrentQuestion controller', { error, sessionId: req.params.sessionId, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Submit an answer for the current question
   * POST /api/quiz/sessions/:sessionId/submit-answer
   */
  submitAnswer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const answerData = req.body;
      const request: SubmitAnswerRequest = {
        sessionId,
        ...answerData,
      };

      // Validate required fields
      if (!request.questionId || request.userAnswer === undefined || request.timeTaken === undefined || request.timeTaken === null) {
        sendError(res, 'Missing required answer data', 'INVALID_ANSWER_DATA', 400);
        return;
      }

      // Validate that timeTaken is a non-negative number
      if (typeof request.timeTaken !== 'number' || request.timeTaken < 0) {
        sendError(res, 'Invalid time taken value', 'INVALID_ANSWER_DATA', 400);
        return;
      }

      const response = await this.quizSessionService.submitAnswer(request, userId);

      logger.info('Answer submitted via API', { 
        sessionId, 
        questionId: request.questionId, 
        isCorrect: response.isCorrect,
        userId 
      });

      sendSuccess(res, response, 'Answer submitted successfully');
    } catch (error) {
      logger.error('Error in submitAnswer controller', { 
        error, 
        sessionId: req.params.sessionId, 
        userId: req.user?.id 
      });
      next(error);
    }
  };

  /**
   * Get quiz session details
   * GET /api/quiz/sessions/:sessionId
   */
  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const session = await this.quizSessionService.getSession(sessionId, userId);

      sendSuccess(res, session, 'Session details retrieved successfully');
    } catch (error) {
      logger.error('Error in getSession controller', { error, sessionId: req.params.sessionId, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Get user's quiz sessions
   * GET /api/quiz/sessions
   */
  getUserSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const { page, limit, status } = req.query;

      const options: any = {};
      if (page) options.page = parseInt(page as string, 10);
      if (limit) options.limit = parseInt(limit as string, 10);
      if (status) {
        const statusArray = Array.isArray(status) ? status : [status];
        options.status = statusArray.map(s => s.toString().toUpperCase() as QuizSessionStatus);
      }

      const result = await this.quizSessionService.getUserSessions(userId, options);

      sendSuccess(res, result, 'User sessions retrieved successfully');
    } catch (error) {
      logger.error('Error in getUserSessions controller', { error, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Get quiz results
   * GET /api/quiz/sessions/:sessionId/results
   */
  getQuizResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const results = await this.quizResultsService.getQuizResult(sessionId, userId);

      if (!results) {
        sendError(res, 'Quiz results not found', 'RESULTS_NOT_FOUND', 404);
        return;
      }

      sendSuccess(res, results, 'Quiz results retrieved successfully');
    } catch (error) {
      logger.error('Error in getQuizResults controller', { error, sessionId: req.params.sessionId, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Generate quiz results (force generation)
   * POST /api/quiz/sessions/:sessionId/generate-results
   */
  generateQuizResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { sessionId } = req.params;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      // Verify session ownership
      await this.quizSessionService.getSession(sessionId, userId);

      const results = await this.quizResultsService.generateQuizResults(sessionId);

      logger.info('Quiz results generated via API', { sessionId, userId });
      sendSuccess(res, results, 'Quiz results generated successfully');
    } catch (error) {
      logger.error('Error in generateQuizResults controller', { 
        error, 
        sessionId: req.params.sessionId, 
        userId: req.user?.id 
      });
      next(error);
    }
  };

  /**
   * Get user's quiz history
   * GET /api/quiz/history
   */
  getQuizHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const { page, limit, sortBy, sortOrder } = req.query;

      const options: any = {};
      if (page) options.page = parseInt(page as string, 10);
      if (limit) options.limit = parseInt(limit as string, 10);
      if (sortBy) options.sortBy = sortBy as string;
      if (sortOrder) options.sortOrder = sortOrder as 'asc' | 'desc';

      const history = await this.quizResultsService.getUserQuizHistory(userId, options);

      sendSuccess(res, history, 'Quiz history retrieved successfully');
    } catch (error) {
      logger.error('Error in getQuizHistory controller', { error, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Get user statistics
   * GET /api/quiz/statistics
   */
  getUserStatistics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        sendError(res, 'Authentication required', 'UNAUTHORIZED', 401);
        return;
      }

      const statistics = await this.quizResultsService.getUserStatistics(userId);

      sendSuccess(res, statistics, 'User statistics retrieved successfully');
    } catch (error) {
      logger.error('Error in getUserStatistics controller', { error, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Cleanup expired sessions (admin only)
   * POST /api/quiz/admin/cleanup-sessions
   */
  cleanupExpiredSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (!user || user.role !== 'ADMIN') {
        sendError(res, 'Admin access required', 'FORBIDDEN', 403);
        return;
      }

      const count = await this.quizSessionService.cleanupExpiredSessions();

      logger.info('Expired sessions cleaned up via API', { count, userId: user.id });
      sendSuccess(res, { cleanedUpCount: count }, `${count} expired sessions cleaned up`);
    } catch (error) {
      logger.error('Error in cleanupExpiredSessions controller', { error, userId: req.user?.id });
      next(error);
    }
  };

  /**
   * Health check for quiz service
   * GET /api/quiz/health
   */
  healthCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Basic health check - could be expanded with database connectivity tests
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          quizSession: 'operational',
          quizResults: 'operational',
        },
      };

      sendSuccess(res, health, 'Quiz service is healthy');
    } catch (error) {
      logger.error('Error in quiz health check', { error });
      next(error);
    }
  };
}

// Create and export a singleton instance
export const quizController = new QuizController();
