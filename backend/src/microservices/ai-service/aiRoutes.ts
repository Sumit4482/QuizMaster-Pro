import { Router } from 'express';
import { AiController } from './aiController';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';
import { rateLimitMiddleware } from '../../middleware/rateLimit';
import { body, query } from 'express-validator';

const router = Router();
const aiController = new AiController();

// Validation rules
const generateQuestionsValidation = [
  body('topic')
    .notEmpty()
    .isLength({ min: 3, max: 200 })
    .withMessage('Topic must be between 3 and 200 characters'),
  body('difficulty')
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Invalid difficulty level'),
  body('type')
    .isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'ESSAY'])
    .withMessage('Invalid question type'),
  body('category')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be between 1 and 100 characters'),
  body('subject')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Subject must be between 1 and 100 characters'),
  body('context')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Context must not exceed 1000 characters'),
  body('count')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Count must be between 1 and 20'),
  body('constraints')
    .optional()
    .isObject()
    .withMessage('Constraints must be an object'),
  body('constraints.maxLength')
    .optional()
    .isInt({ min: 50, max: 5000 })
    .withMessage('Max length must be between 50 and 5000 characters'),
  body('constraints.minOptions')
    .optional()
    .isInt({ min: 2, max: 10 })
    .withMessage('Min options must be between 2 and 10'),
  body('constraints.maxOptions')
    .optional()
    .isInt({ min: 2, max: 10 })
    .withMessage('Max options must be between 2 and 10'),
  body('constraints.language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),
  body('constraints.includeExplanation')
    .optional()
    .isBoolean()
    .withMessage('Include explanation must be a boolean')
];

const moderateContentValidation = [
  body('content')
    .notEmpty()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Content must be between 1 and 10000 characters'),
  body('type')
    .isIn(['question', 'answer', 'comment', 'discussion'])
    .withMessage('Invalid content type'),
  body('context')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Context must not exceed 500 characters')
];

const verifyFactsValidation = [
  body('claim')
    .notEmpty()
    .isLength({ min: 5, max: 1000 })
    .withMessage('Claim must be between 5 and 1000 characters'),
  body('context')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Context must not exceed 2000 characters'),
  body('domain')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Domain must be between 2 and 100 characters')
];

const enhanceContentValidation = [
  body('content')
    .notEmpty()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Content must be between 10 and 5000 characters'),
  body('type')
    .isIn(['improve', 'summarize', 'expand', 'translate'])
    .withMessage('Invalid enhancement type'),
  body('targetLanguage')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Target language must be a valid language code'),
  body('maxLength')
    .optional()
    .isInt({ min: 50, max: 10000 })
    .withMessage('Max length must be between 50 and 10000 characters'),
  body('style')
    .optional()
    .isIn(['formal', 'casual', 'academic', 'conversational'])
    .withMessage('Invalid style option')
];

const batchProcessValidation = [
  body('operations')
    .isArray({ min: 1, max: 10 })
    .withMessage('Operations must be an array with 1-10 items'),
  body('operations.*.type')
    .isIn(['generateQuestions', 'moderateContent', 'verifyFacts', 'enhanceContent'])
    .withMessage('Invalid operation type'),
  body('operations.*.params')
    .isObject()
    .withMessage('Operation params must be an object'),
  body('operations.*.count')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Operation count must be between 1 and 20')
];

// Public routes (minimal authentication)
router.get('/health',
  aiController.healthCheck
);

router.get('/capabilities',
  rateLimitMiddleware('lenient'),
  aiController.getCapabilities
);

// Protected routes (basic authentication required)
router.get('/statistics',
  rateLimitMiddleware('lenient'),
  authenticateToken,
  aiController.getStatistics
);

// Content moderation (available to authenticated users)
router.post('/moderate',
  rateLimitMiddleware('moderate'),
  moderateContentValidation,
  validationMiddleware,
  authenticateToken,
  aiController.moderateContent
);

// Fact verification (available to authenticated users)
router.post('/verify-facts',
  rateLimitMiddleware('moderate'),
  verifyFactsValidation,
  validationMiddleware,
  authenticateToken,
  aiController.verifyFacts
);

// Content enhancement (available to authenticated users)
router.post('/enhance',
  rateLimitMiddleware('moderate'),
  enhanceContentValidation,
  validationMiddleware,
  authenticateToken,
  aiController.enhanceContent
);

// Question generation (teachers, admins, and content creators only)
router.post('/generate/questions',
  rateLimitMiddleware('strict'), // Strict rate limiting for expensive AI operations
  generateQuestionsValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['teacher', 'admin', 'superadmin', 'content_creator']),
  aiController.generateQuestions
);

// Batch processing (admins and power users only)
router.post('/batch',
  rateLimitMiddleware('strict'),
  batchProcessValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['admin', 'superadmin', 'power_user']),
  aiController.batchProcess
);

export default router;

