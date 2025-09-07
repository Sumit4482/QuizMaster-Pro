import { Router } from 'express';
import { QuestionController } from '../controllers/questionController';
import { authenticate } from '../middleware/auth';
import {
  requireAdmin,
  requireAdminOrHost,
  requireQuestionPermission,
  auditLog
} from '../middleware/adminAuth';
import { 
  createQuestionValidation,
  updateQuestionValidation,
  questionSearchValidation,
  bulkQuestionOperationValidation,
  questionImportValidation,
  commonValidation
} from '../utils/questionValidation';

const router = Router();
const questionController = new QuestionController();

// Apply authentication to all question routes
router.use(authenticate);

// Public routes (accessible by all authenticated users)
/**
 * @route GET /questions/search
 * @description Search questions with filters and pagination
 * @access Authenticated users (published questions only for non-admin/host)
 */
router.get(
  '/search',
  questionController.searchQuestions.bind(questionController)
);

/**
 * @route GET /questions/statistics
 * @description Get question statistics
 * @access Authenticated users
 */
router.get(
  '/statistics',
  questionController.getStatistics.bind(questionController)
);

// Import/Export routes (Admin only) - MUST come before /:id route
/**
 * @route GET /questions/export
 * @description Export questions to JSON format
 * @access Admin only
 * @query categoryIds - Optional array of category IDs to filter export
 */
router.get(
  '/export',
  requireAdmin,
  auditLog('question_export'),
  questionController.exportQuestions.bind(questionController)
);

/**
 * @route GET /questions/:id
 * @description Get question by ID
 * @access Authenticated users (correct answer only for admin/host)
 */
router.get(
  '/:id',
  requireQuestionPermission('view'),
  questionController.getQuestionById.bind(questionController)
);

// Admin/Host routes (question management)
/**
 * @route POST /questions
 * @description Create a new question
 * @access Admin, Host
 */
router.post(
  '/',
  requireAdminOrHost,
  requireQuestionPermission('create'),
  auditLog('question_create'),
  questionController.createQuestion.bind(questionController)
);

/**
 * @route PUT /questions/:id
 * @description Update a question
 * @access Admin, Host
 */
router.put(
  '/:id',
  requireAdminOrHost,
  requireQuestionPermission('update'),
  auditLog('question_update'),
  questionController.updateQuestion.bind(questionController)
);

/**
 * @route DELETE /questions/:id
 * @description Delete a question (soft delete)
 * @access Admin, Host
 */
router.delete(
  '/:id',
  requireAdminOrHost,
  requireQuestionPermission('delete'),
  auditLog('question_delete'),
  questionController.deleteQuestion.bind(questionController)
);

/**
 * @route POST /questions/:id/publish
 * @description Publish a question
 * @access Admin only
 */
router.post(
  '/:id/publish',
  requireAdmin,
  requireQuestionPermission('publish'),
  auditLog('question_publish'),
  questionController.publishQuestion.bind(questionController)
);

/**
 * @route POST /questions/:id/unpublish
 * @description Unpublish a question
 * @access Admin only
 */
router.post(
  '/:id/unpublish',
  requireAdmin,
  requireQuestionPermission('publish'),
  auditLog('question_unpublish'),
  questionController.unpublishQuestion.bind(questionController)
);

// Bulk operations (Admin only)
/**
 * @route POST /questions/bulk
 * @description Perform bulk operations on questions
 * @access Admin only
 */
router.post(
  '/bulk',
  requireAdmin,
  auditLog('question_bulk_operation'),
  questionController.bulkOperation.bind(questionController)
);

// Import/Export routes (Admin only)
/**
 * @route POST /questions/import
 * @description Import questions from JSON data
 * @access Admin only
 */
router.post(
  '/import',
  requireAdmin,
  auditLog('question_import'),
  questionController.importQuestions.bind(questionController)
);

export default router;
