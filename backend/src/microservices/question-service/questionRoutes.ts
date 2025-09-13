import { Router } from 'express';
import { QuestionController } from './questionController';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';
import { rateLimitMiddleware } from '../../middleware/rateLimit';
import { body, param, query } from 'express-validator';

const router = Router();
const questionController = new QuestionController();

// Validation rules
const createQuestionValidation = [
  body('content')
    .notEmpty()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Content must be between 10 and 2000 characters'),
  body('options')
    .isArray({ min: 2, max: 10 })
    .withMessage('Options must be an array with 2-10 items'),
  body('options.*')
    .notEmpty()
    .isLength({ min: 1, max: 500 })
    .withMessage('Each option must be between 1 and 500 characters'),
  body('correctAnswers')
    .isArray({ min: 1 })
    .withMessage('At least one correct answer is required'),
  body('correctAnswers.*')
    .isInt({ min: 0 })
    .withMessage('Correct answers must be valid option indices'),
  body('type')
    .isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY', 'MATCHING'])
    .withMessage('Invalid question type'),
  body('difficulty')
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Invalid difficulty level'),
  body('category')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category is required and must be between 1 and 100 characters'),
  body('subject')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Subject is required and must be between 1 and 100 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),
  body('explanation')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Explanation must not exceed 1000 characters'),
  body('timeLimit')
    .optional()
    .isInt({ min: 10, max: 3600 })
    .withMessage('Time limit must be between 10 and 3600 seconds'),
  body('points')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Points must be between 1 and 1000'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const updateQuestionValidation = [
  param('id')
    .notEmpty()
    .withMessage('Question ID is required'),
  body('content')
    .optional()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Content must be between 10 and 2000 characters'),
  body('options')
    .optional()
    .isArray({ min: 2, max: 10 })
    .withMessage('Options must be an array with 2-10 items'),
  body('options.*')
    .optional()
    .isLength({ min: 1, max: 500 })
    .withMessage('Each option must be between 1 and 500 characters'),
  body('correctAnswers')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one correct answer is required'),
  body('correctAnswers.*')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Correct answers must be valid option indices'),
  body('type')
    .optional()
    .isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY', 'MATCHING'])
    .withMessage('Invalid question type'),
  body('difficulty')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Invalid difficulty level'),
  body('category')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be between 1 and 100 characters'),
  body('subject')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Subject must be between 1 and 100 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('explanation')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Explanation must not exceed 1000 characters'),
  body('timeLimit')
    .optional()
    .isInt({ min: 10, max: 3600 })
    .withMessage('Time limit must be between 10 and 3600 seconds'),
  body('points')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Points must be between 1 and 1000'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const questionIdValidation = [
  param('id')
    .notEmpty()
    .withMessage('Question ID is required')
];

const searchQuestionsValidation = [
  query('category')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be between 1 and 100 characters'),
  query('subject')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Subject must be between 1 and 100 characters'),
  query('difficulty')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Invalid difficulty level'),
  query('type')
    .optional()
    .isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY', 'MATCHING'])
    .withMessage('Invalid question type'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  query('searchTerm')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search term must be between 1 and 200 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'difficulty', 'category', 'subject', 'content'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  query('includeInactive')
    .optional()
    .isBoolean()
    .withMessage('includeInactive must be a boolean')
];

const randomQuestionsValidation = [
  query('count')
    .notEmpty()
    .isInt({ min: 1, max: 100 })
    .withMessage('Count must be between 1 and 100'),
  query('category')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be between 1 and 100 characters'),
  query('subject')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Subject must be between 1 and 100 characters'),
  query('difficulty')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Invalid difficulty level'),
  query('type')
    .optional()
    .isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY', 'MATCHING'])
    .withMessage('Invalid question type'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const bulkImportValidation = [
  body('questions')
    .isArray({ min: 1, max: 1000 })
    .withMessage('Questions must be an array with 1-1000 items'),
  body('questions.*.content')
    .notEmpty()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Each question content must be between 10 and 2000 characters'),
  body('questions.*.options')
    .isArray({ min: 2, max: 10 })
    .withMessage('Each question must have 2-10 options'),
  body('questions.*.correctAnswers')
    .isArray({ min: 1 })
    .withMessage('Each question must have at least one correct answer'),
  body('questions.*.type')
    .isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY', 'MATCHING'])
    .withMessage('Each question must have a valid type'),
  body('questions.*.difficulty')
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Each question must have a valid difficulty'),
  body('questions.*.category')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each question must have a valid category'),
  body('questions.*.subject')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each question must have a valid subject')
];

// Public routes (minimal authentication required)
router.get('/health',
  questionController.healthCheck
);

// Read-only routes (basic authentication)
router.get('/search',
  rateLimitMiddleware('lenient'),
  searchQuestionsValidation,
  validationMiddleware,
  authenticateToken,
  questionController.searchQuestions
);

router.get('/random',
  rateLimitMiddleware('lenient'),
  randomQuestionsValidation,
  validationMiddleware,
  authenticateToken,
  questionController.getRandomQuestions
);

router.get('/statistics',
  rateLimitMiddleware('lenient'),
  authenticateToken,
  questionController.getStatistics
);

router.get('/:id',
  rateLimitMiddleware('lenient'),
  questionIdValidation,
  validationMiddleware,
  authenticateToken,
  questionController.getQuestion
);

// Create/Update routes (authenticated users with content creation permissions)
router.post('/',
  rateLimitMiddleware('moderate'),
  createQuestionValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['teacher', 'admin', 'superadmin']),
  questionController.createQuestion
);

router.put('/:id',
  rateLimitMiddleware('moderate'),
  updateQuestionValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['teacher', 'admin', 'superadmin']),
  questionController.updateQuestion
);

// Bulk operations (admin/teacher only)
router.post('/bulk/import',
  rateLimitMiddleware('strict'),
  bulkImportValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['teacher', 'admin', 'superadmin']),
  questionController.bulkImportQuestions
);

// Admin only routes
router.delete('/:id',
  rateLimitMiddleware('strict'),
  questionIdValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  questionController.deleteQuestion
);

export default router;

