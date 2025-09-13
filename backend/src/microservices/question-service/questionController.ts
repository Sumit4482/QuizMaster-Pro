import { Request, Response } from 'express';
import { QuestionService } from './questionService';
import { logger } from '../../utils/logger';
import { 
  successResponse, 
  errorResponse,
  badRequestResponse,
  notFoundResponse
} from '../../utils/responseUtils';
import { AuthenticatedRequest } from '../../types/auth';

export class QuestionController {
  private questionService: QuestionService;

  constructor() {
    this.questionService = new QuestionService();
  }

  /**
   * Create a new question
   */
  public createQuestion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        content,
        options,
        correctAnswers,
        type,
        difficulty,
        category,
        subject,
        tags,
        explanation,
        timeLimit,
        points,
        isActive
      } = req.body;

      if (!content || !options || !correctAnswers || !type || !difficulty || !category || !subject) {
        badRequestResponse(res, 'Missing required fields: content, options, correctAnswers, type, difficulty, category, subject');
        return;
      }

      if (!req.user?.id) {
        badRequestResponse(res, 'User authentication required');
        return;
      }

      const question = await this.questionService.createQuestion({
        content,
        options,
        correctAnswers,
        type,
        difficulty,
        category,
        subject,
        tags: tags || [],
        explanation,
        timeLimit,
        points,
        isActive
      }, req.user.id);

      logger.info('Question created successfully', {
        component: 'QuestionController',
        questionId: question.id,
        createdBy: req.user.id
      });

      successResponse(res, question, 'Question created successfully', 201);
    } catch (error) {
      logger.error('Create question failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to create question');
    }
  };

  /**
   * Get question by ID
   */
  public getQuestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        badRequestResponse(res, 'Question ID is required');
        return;
      }

      const question = await this.questionService.getQuestionById(id);

      if (!question) {
        notFoundResponse(res, 'Question not found');
        return;
      }

      logger.info('Question retrieved successfully', {
        component: 'QuestionController',
        questionId: id
      });

      successResponse(res, question, 'Question retrieved successfully');
    } catch (error) {
      logger.error('Get question failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error),
        questionId: req.params.id
      });

      errorResponse(res, 'Failed to retrieve question');
    }
  };

  /**
   * Update question
   */
  public updateQuestion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        badRequestResponse(res, 'Question ID is required');
        return;
      }

      if (!req.user?.id) {
        badRequestResponse(res, 'User authentication required');
        return;
      }

      const updatedQuestion = await this.questionService.updateQuestion(id, updateData, req.user.id);

      logger.info('Question updated successfully', {
        component: 'QuestionController',
        questionId: id,
        updatedBy: req.user.id
      });

      successResponse(res, updatedQuestion, 'Question updated successfully');
    } catch (error) {
      logger.error('Update question failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error),
        questionId: req.params.id,
        userId: req.user?.id
      });

      if (error instanceof Error && error.message === 'Question not found') {
        notFoundResponse(res, error.message);
        return;
      }

      errorResponse(res, 'Failed to update question');
    }
  };

  /**
   * Delete question
   */
  public deleteQuestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        badRequestResponse(res, 'Question ID is required');
        return;
      }

      await this.questionService.deleteQuestion(id);

      logger.info('Question deleted successfully', {
        component: 'QuestionController',
        questionId: id
      });

      successResponse(res, {}, 'Question deleted successfully');
    } catch (error) {
      logger.error('Delete question failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error),
        questionId: req.params.id
      });

      if (error instanceof Error && error.message === 'Question not found') {
        notFoundResponse(res, error.message);
        return;
      }

      errorResponse(res, 'Failed to delete question');
    }
  };

  /**
   * Search questions
   */
  public searchQuestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        category,
        subject,
        difficulty,
        type,
        tags,
        isActive,
        createdBy,
        searchTerm,
        limit,
        offset,
        sortBy,
        sortOrder,
        includeInactive
      } = req.query;

      const filters = {
        category: category as string,
        subject: subject as string,
        difficulty: difficulty as any,
        type: type as any,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        createdBy: createdBy as string,
        searchTerm: searchTerm as string
      };

      const options = {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        sortBy: sortBy as string,
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
        includeInactive: includeInactive === 'true'
      };

      const result = await this.questionService.searchQuestions(filters, options);

      logger.info('Questions searched successfully', {
        component: 'QuestionController',
        total: result.total,
        returned: result.questions.length
      });

      successResponse(res, result, 'Questions retrieved successfully');
    } catch (error) {
      logger.error('Search questions failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to search questions');
    }
  };

  /**
   * Get random questions
   */
  public getRandomQuestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { count, category, subject, difficulty, type, tags, isActive } = req.query;

      if (!count) {
        badRequestResponse(res, 'Count parameter is required');
        return;
      }

      const questionCount = parseInt(count as string, 10);
      if (isNaN(questionCount) || questionCount < 1 || questionCount > 100) {
        badRequestResponse(res, 'Count must be a number between 1 and 100');
        return;
      }

      const filters = {
        category: category as string,
        subject: subject as string,
        difficulty: difficulty as any,
        type: type as any,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
        isActive: isActive !== undefined ? isActive === 'true' : undefined
      };

      const questions = await this.questionService.getRandomQuestions(questionCount, filters);

      logger.info('Random questions retrieved successfully', {
        component: 'QuestionController',
        count: questions.length,
        requested: questionCount
      });

      successResponse(res, { questions, count: questions.length }, 'Random questions retrieved successfully');
    } catch (error) {
      logger.error('Get random questions failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to get random questions');
    }
  };

  /**
   * Get question statistics
   */
  public getStatistics = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.questionService.getQuestionStatistics();

      logger.info('Question statistics retrieved successfully', {
        component: 'QuestionController',
        totalQuestions: stats.totalQuestions
      });

      successResponse(res, stats, 'Statistics retrieved successfully');
    } catch (error) {
      logger.error('Get question statistics failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Failed to retrieve statistics');
    }
  };

  /**
   * Bulk import questions
   */
  public bulkImportQuestions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { questions } = req.body;

      if (!questions || !Array.isArray(questions)) {
        badRequestResponse(res, 'Questions array is required');
        return;
      }

      if (!req.user?.id) {
        badRequestResponse(res, 'User authentication required');
        return;
      }

      const result = await this.questionService.bulkImportQuestions(questions, req.user.id);

      logger.info('Bulk import completed', {
        component: 'QuestionController',
        total: questions.length,
        imported: result.imported,
        failed: result.failed,
        importedBy: req.user.id
      });

      successResponse(res, result, 'Bulk import completed');
    } catch (error) {
      logger.error('Bulk import questions failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      errorResponse(res, 'Failed to bulk import questions');
    }
  };

  /**
   * Health check for question service
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.questionService.healthCheck();

      if (health.status === 'healthy') {
        successResponse(res, health, 'Question service is healthy');
      } else {
        errorResponse(res, 'Question service is unhealthy', 503, health);
      }
    } catch (error) {
      logger.error('Question service health check failed', {
        component: 'QuestionController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Question service is unhealthy', 503);
    }
  };
}

export default QuestionController;

