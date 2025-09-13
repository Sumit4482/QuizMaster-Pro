import express from 'express';
import { HybridQuestionController } from '../controllers/hybridQuestionController';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { rateLimit } from 'express-rate-limit';
import { body, query } from 'express-validator';

const router = express.Router();
const hybridController = new HybridQuestionController();

/**
 * Phase 3.2: Hybrid Question System API Routes
 */

// Rate limiting for AI generation endpoints
const hybridGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  message: {
    success: false,
    error: 'Too many hybrid question generation requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation schemas
const hybridGenerationValidation = [
  body('topic')
    .isString()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Topic must be a string between 2 and 200 characters'),
  
  body('subject')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Subject must be a string between 2 and 100 characters'),
  
  body('difficulty')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Difficulty must be an integer between 1 and 5'),
  
  body('questionType')
    .optional()
    .isIn(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY'])
    .withMessage('Invalid question type'),
  
  body('count')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Count must be an integer between 1 and 50'),
  
  body('aiRatio')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('AI ratio must be a number between 0 and 1'),
  
  body('qualityThreshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Quality threshold must be a number between 0 and 1'),
  
  body('categoryIds')
    .optional()
    .isArray()
    .withMessage('Category IDs must be an array'),
  
  body('categoryIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Each category ID must be a positive integer'),
  
  body('contextHistory')
    .optional()
    .isArray()
    .withMessage('Context history must be an array'),
  
  body('contextHistory.*')
    .optional()
    .isString()
    .withMessage('Each context item must be a string')
];

const qualityFeedbackValidation = [
  body('questionId')
    .isUUID()
    .withMessage('Question ID must be a valid UUID'),
  
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5'),
  
  body('feedback')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Feedback must be a string with maximum 1000 characters')
];

const preferencesValidation = [
  body('defaultAiRatio')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Default AI ratio must be a number between 0 and 1'),
  
  body('qualityThreshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Quality threshold must be a number between 0 and 1')
];

/**
 * @route POST /api/hybrid-questions/generate
 * @desc Generate questions using hybrid AI/Database approach
 * @access Private
 */
router.post(
  '/generate',
  authenticate,
  hybridGenerationLimiter,
  hybridGenerationValidation,
  validateRequest,
  async (req, res) => {
    await hybridController.generateHybridQuestions(req, res);
  }
);

/**
 * @route POST /api/hybrid-questions/quality/metrics
 * @desc Get quality metrics for specific questions
 * @access Private
 */
router.post(
  '/quality/metrics',
  authenticate,
  [
    body('questionIds')
      .isArray({ min: 1, max: 20 })
      .withMessage('Question IDs must be an array with 1-20 items'),
    
    body('questionIds.*')
      .isUUID()
      .withMessage('Each question ID must be a valid UUID')
  ],
  validateRequest,
  async (req, res) => {
    await hybridController.getQualityMetrics(req, res);
  }
);

/**
 * @route POST /api/hybrid-questions/quality/feedback
 * @desc Submit quality feedback for a question
 * @access Private
 */
router.post(
  '/quality/feedback',
  authenticate,
  qualityFeedbackValidation,
  validateRequest,
  async (req, res) => {
    await hybridController.submitQualityFeedback(req, res);
  }
);

/**
 * @route GET /api/hybrid-questions/performance/metrics
 * @desc Get hybrid system performance metrics
 * @access Private
 */
router.get(
  '/performance/metrics',
  authenticate,
  [
    query('timeRange')
      .optional()
      .isIn(['1h', '24h', '7d', '30d'])
      .withMessage('Time range must be one of: 1h, 24h, 7d, 30d')
  ],
  validateRequest,
  async (req, res) => {
    await hybridController.getPerformanceMetrics(req, res);
  }
);

/**
 * @route PUT /api/hybrid-questions/preferences
 * @desc Update hybrid system preferences
 * @access Private
 */
router.put(
  '/preferences',
  authenticate,
  preferencesValidation,
  validateRequest,
  async (req, res) => {
    await hybridController.updateHybridPreferences(req, res);
  }
);

/**
 * @route GET /api/hybrid-questions/health
 * @desc Get hybrid system health status
 * @access Private
 */
router.get(
  '/health',
  authenticate,
  async (req, res) => {
    await hybridController.getSystemHealth(req, res);
  }
);

/**
 * @route GET /api/hybrid-questions/stats
 * @desc Get hybrid system statistics and usage
 * @access Private
 */
router.get(
  '/stats',
  authenticate,
  [
    query('period')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('Period must be one of: day, week, month, year'),
    
    query('includeBreakdown')
      .optional()
      .isBoolean()
      .withMessage('Include breakdown must be a boolean')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { period = 'week', includeBreakdown = 'false' } = req.query;
      const userId = (req as any).user.id;

      // Mock statistics for now - in real implementation would query analytics
      const stats = {
        period,
        totalQuestions: 1847,
        hybridBreakdown: {
          ai: 554, // 30%
          database: 1293, // 70%
        },
        qualityMetrics: {
          averageScore: 0.84,
          aboveThreshold: 1623,
          belowThreshold: 224,
          improvement: 0.07
        },
        performance: {
          averageResponseTime: 1350,
          cacheHitRate: 0.23,
          fallbackRate: 0.03,
          successRate: 0.97
        },
        usage: {
          dailyAverage: 263,
          peakHour: '14:00',
          topTopics: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL'],
          userSatisfaction: 4.2
        }
      };

      if (includeBreakdown === 'true') {
        stats['breakdown'] = {
          byDay: [
            { date: '2024-01-01', ai: 45, database: 87, total: 132 },
            { date: '2024-01-02', ai: 52, database: 93, total: 145 },
            { date: '2024-01-03', ai: 38, database: 78, total: 116 },
            { date: '2024-01-04', ai: 47, database: 89, total: 136 },
            { date: '2024-01-05', ai: 51, database: 94, total: 145 },
            { date: '2024-01-06', ai: 44, database: 82, total: 126 },
            { date: '2024-01-07', ai: 43, database: 85, total: 128 }
          ],
          byTopic: [
            { topic: 'JavaScript', count: 347, avgQuality: 0.87 },
            { topic: 'Python', count: 289, avgQuality: 0.84 },
            { topic: 'React', count: 234, avgQuality: 0.82 },
            { topic: 'Node.js', count: 198, avgQuality: 0.85 },
            { topic: 'SQL', count: 156, avgQuality: 0.88 }
          ]
        };
      }

      res.status(200).json({
        success: true,
        data: stats,
        metadata: {
          generatedAt: new Date().toISOString(),
          userId
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get hybrid system statistics',
        code: 'STATS_FAILED'
      });
    }
  }
);

export default router;

