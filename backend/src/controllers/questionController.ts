import { Request, Response } from 'express';
import { QuestionService } from '../services/questionService';
import { AuthenticatedRequest } from '../types/auth';
import { sendSuccessResponse, sendErrorResponse } from '../utils/response';
import { logger } from '../config/logger';
import {
  createQuestionValidation,
  updateQuestionValidation,
  questionSearchValidation,
  bulkQuestionOperationValidation,
  questionImportValidation,
  commonValidation
} from '../utils/questionValidation';
import {
  CreateQuestionRequest,
  UpdateQuestionRequest,
  QuestionSearchParams,
  BulkQuestionOperation,
  QuestionImportData
} from '../types/question';
import { UserRole } from '@prisma/client';
import { canViewUnpublishedQuestions } from '../middleware/adminAuth';

export class QuestionController {
  private questionService: QuestionService;

  constructor() {
    this.questionService = new QuestionService();
  }

  // Create a new question
  async createQuestion(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate request body
      const { error, value } = createQuestionValidation.validate(req.body);
      if (error) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', error.details[0].message);
        return;
      }

      const questionData: CreateQuestionRequest = value;
      const question = await this.questionService.createQuestion(questionData, authReq.user!.id);

      logger.info('Question created via API', {
        questionId: question.id,
        questionType: question.questionType,
        createdBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 201, question, 'Question created successfully');
    } catch (error) {
      logger.error('Failed to create question via API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error) {
        sendErrorResponse(res, 400, 'CREATION_FAILED', error.message);
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create question');
      }
    }
  }

  // Get question by ID
  async getQuestionById(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.uuidParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      const { id } = params;
      const userRole = authReq.user?.role;

      // Determine if correct answer should be included
      const includeCorrectAnswer = userRole === UserRole.ADMIN || userRole === UserRole.HOST;

      const question = await this.questionService.getQuestionById(id, authReq.user?.id, includeCorrectAnswer);

      // Check if user can view unpublished questions
      if (!question.isPublished && userRole && !canViewUnpublishedQuestions(userRole)) {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Question not found');
        return;
      }

      sendSuccessResponse(res, 200, question);
    } catch (error) {
      logger.error('Failed to get question by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Question not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Question not found');
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve question');
      }
    }
  }

  // Update question
  async updateQuestion(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.uuidParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      // Validate request body
      const { error, value } = updateQuestionValidation.validate(req.body);
      if (error) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', error.details[0].message);
        return;
      }

      const { id } = params;
      const updateData: UpdateQuestionRequest = value;

      const question = await this.questionService.updateQuestion(id, updateData, authReq.user!.id);

      logger.info('Question updated via API', {
        questionId: id,
        updatedBy: authReq.user!.username,
        changes: Object.keys(updateData),
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, question, 'Question updated successfully');
    } catch (error) {
      logger.error('Failed to update question via API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Question not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Question not found');
      } else if (error instanceof Error) {
        sendErrorResponse(res, 400, 'UPDATE_FAILED', error.message);
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update question');
      }
    }
  }

  // Delete question
  async deleteQuestion(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.uuidParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      const { id } = params;
      await this.questionService.deleteQuestion(id, authReq.user!.id);

      logger.info('Question deleted via API', {
        questionId: id,
        deletedBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, null, 'Question deleted successfully');
    } catch (error) {
      logger.error('Failed to delete question via API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Question not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Question not found');
      } else if (error instanceof Error) {
        sendErrorResponse(res, 400, 'DELETE_FAILED', error.message);
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to delete question');
      }
    }
  }

  // Search questions
  async searchQuestions(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate query parameters
      const { error, value } = questionSearchValidation.validate(req.query);
      if (error) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', error.details[0].message);
        return;
      }

      const searchParams: QuestionSearchParams = value;
      
      // If user is not admin/host, only show published questions
      const userRole = authReq.user?.role;
      if (userRole && !canViewUnpublishedQuestions(userRole)) {
        searchParams.isPublished = true;
      }

      const result = await this.questionService.searchQuestions(searchParams, authReq.user?.id);

      sendSuccessResponse(res, 200, result);
    } catch (error) {
      logger.error('Failed to search questions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        searchParams: req.query,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to search questions');
    }
  }

  // Bulk operations on questions
  async bulkOperation(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate request body
      const { error, value } = bulkQuestionOperationValidation.validate(req.body);
      if (error) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', error.details[0].message);
        return;
      }

      const operation: BulkQuestionOperation = value;
      const result = await this.questionService.bulkOperation(operation, authReq.user!.id);

      logger.info('Bulk operation completed via API', {
        operation: operation.operation,
        questionCount: operation.questionIds.length,
        processed: result.processed,
        failed: result.failed,
        userId: authReq.user!.id,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, result, 'Bulk operation completed');
    } catch (error) {
      logger.error('Failed to perform bulk operation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operation: req.body.operation,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to perform bulk operation');
    }
  }

  // Import questions
  async importQuestions(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate request body
      const { error, value } = questionImportValidation.validate(req.body);
      if (error) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', error.details[0].message);
        return;
      }

      const importData: QuestionImportData = value;
      const result = await this.questionService.importQuestions(importData, authReq.user!.id);

      logger.info('Questions imported via API', {
        questionCount: importData.questions.length,
        categoryCount: importData.categories?.length || 0,
        processed: result.processed,
        failed: result.failed,
        importedBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, result, 'Questions imported successfully');
    } catch (error) {
      logger.error('Failed to import questions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to import questions');
    }
  }

  // Export questions
  async exportQuestions(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Parse category IDs from query
      const categoryIds = req.query.categoryIds 
        ? (Array.isArray(req.query.categoryIds) 
          ? req.query.categoryIds.map(id => parseInt(id as string))
          : [parseInt(req.query.categoryIds as string)])
        : undefined;

      const exportData = await this.questionService.exportQuestions(categoryIds, authReq.user?.id);

      logger.info('Questions exported via API', {
        questionCount: exportData.questions.length,
        categoryCount: exportData.categories.length,
        exportedBy: authReq.user?.username,
        correlationId: authReq.correlationId
      });

      // Set appropriate headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=questions-export-${Date.now()}.json`);
      
      res.status(200).json(exportData);
    } catch (error) {
      logger.error('Failed to export questions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to export questions');
    }
  }

  // Get question statistics
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Parse category IDs from query
      const categoryIds = req.query.categoryIds 
        ? (Array.isArray(req.query.categoryIds) 
          ? req.query.categoryIds.map(id => parseInt(id as string))
          : [parseInt(req.query.categoryIds as string)])
        : undefined;

      const statistics = await this.questionService.getQuestionStatistics(categoryIds);

      sendSuccessResponse(res, 200, statistics);
    } catch (error) {
      logger.error('Failed to get question statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve statistics');
    }
  }

  // Publish question
  async publishQuestion(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.uuidParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      const { id } = params;
      const question = await this.questionService.updateQuestion(
        id, 
        { isPublished: true }, 
        authReq.user!.id
      );

      logger.info('Question published via API', {
        questionId: id,
        publishedBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, question, 'Question published successfully');
    } catch (error) {
      logger.error('Failed to publish question', {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Question not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Question not found');
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to publish question');
      }
    }
  }

  // Unpublish question
  async unpublishQuestion(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.uuidParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      const { id } = params;
      const question = await this.questionService.updateQuestion(
        id, 
        { isPublished: false }, 
        authReq.user!.id
      );

      logger.info('Question unpublished via API', {
        questionId: id,
        unpublishedBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, question, 'Question unpublished successfully');
    } catch (error) {
      logger.error('Failed to unpublish question', {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Question not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Question not found');
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to unpublish question');
      }
    }
  }
}
