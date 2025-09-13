import express from 'express';
import { AdvancedAiController } from '../controllers/advancedAiController';
import { authenticate, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { rateLimit } from 'express-rate-limit';
import { body, query } from 'express-validator';

const router = express.Router();
const advancedAiController = new AdvancedAiController();

/**
 * Phase 3.3: Advanced AI Features API Routes
 */

// Rate limiting for AI generation endpoints
const aiGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: {
    success: false,
    error: 'Too many AI generation requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for moderation endpoints
const moderationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Higher limit for moderation
  message: {
    success: false,
    error: 'Too many moderation requests. Please try again later.',
    code: 'MODERATION_RATE_LIMIT_EXCEEDED'
  }
});

// Validation schemas
const advancedContentGenerationValidation = [
  body('prompt')
    .isString()
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Prompt must be a string between 10 and 5000 characters'),
  
  body('contentType')
    .optional()
    .isIn(['question', 'answer', 'explanation', 'user_input'])
    .withMessage('Invalid content type'),
  
  body('preferredProvider')
    .optional()
    .isString()
    .trim()
    .withMessage('Preferred provider must be a string'),
  
  body('maxCost')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Max cost must be a number between 0 and 1'),
  
  body('minQuality')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Min quality must be a number between 0 and 1'),
  
  body('enableModeration')
    .optional()
    .isBoolean()
    .withMessage('Enable moderation must be a boolean'),
  
  body('enableFactCheck')
    .optional()
    .isBoolean()
    .withMessage('Enable fact check must be a boolean'),
  
  body('moderationThreshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Moderation threshold must be a number between 0 and 1'),
  
  body('factCheckConfidence')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Fact check confidence must be a number between 0 and 1')
];

const contentModerationValidation = [
  body('content')
    .isString()
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Content must be a string between 1 and 10000 characters'),
  
  body('contentType')
    .optional()
    .isIn(['question', 'answer', 'explanation', 'user_input', 'chat_message'])
    .withMessage('Invalid content type'),
  
  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object')
];

const batchModerationValidation = [
  body('contents')
    .isArray({ min: 1, max: 50 })
    .withMessage('Contents must be an array with 1-50 items'),
  
  body('contents.*.content')
    .isString()
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Each content must be a string between 1 and 10000 characters'),
  
  body('contents.*.contentType')
    .optional()
    .isIn(['question', 'answer', 'explanation', 'user_input', 'chat_message'])
    .withMessage('Invalid content type')
];

const factVerificationValidation = [
  body('content')
    .isString()
    .trim()
    .isLength({ min: 10, max: 10000 })
    .withMessage('Content must be a string between 10 and 10000 characters'),
  
  body('claims')
    .optional()
    .isArray()
    .withMessage('Claims must be an array'),
  
  body('claims.*')
    .optional()
    .isString()
    .withMessage('Each claim must be a string'),
  
  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object')
];

const loadBalancingValidation = [
  body('strategy')
    .isObject()
    .withMessage('Strategy must be an object'),
  
  body('strategy.type')
    .isIn(['round_robin', 'weighted', 'least_connections', 'cost_optimized', 'quality_first'])
    .withMessage('Invalid strategy type'),
  
  body('strategy.parameters')
    .optional()
    .isObject()
    .withMessage('Strategy parameters must be an object')
];

/**
 * @route POST /api/advanced-ai/generate
 * @desc Generate AI content with advanced features (moderation, fact-checking)
 * @access Private
 */
router.post(
  '/generate',
  authenticate,
  aiGenerationLimiter,
  advancedContentGenerationValidation,
  validateRequest,
  async (req, res) => {
    await advancedAiController.generateAdvancedContent(req, res);
  }
);

/**
 * @route GET /api/advanced-ai/providers/status
 * @desc Get AI provider health and status
 * @access Private
 */
router.get(
  '/providers/status',
  authenticate,
  async (req, res) => {
    await advancedAiController.getProviderStatus(req, res);
  }
);

/**
 * @route PUT /api/advanced-ai/providers/load-balancing
 * @desc Update load balancing strategy
 * @access Private (Admin only)
 */
router.put(
  '/providers/load-balancing',
  authenticate,
  requireRole(['ADMIN']),
  loadBalancingValidation,
  validateRequest,
  async (req, res) => {
    await advancedAiController.updateLoadBalancingStrategy(req, res);
  }
);

/**
 * @route POST /api/advanced-ai/moderation/content
 * @desc Moderate content independently
 * @access Private
 */
router.post(
  '/moderation/content',
  authenticate,
  moderationLimiter,
  contentModerationValidation,
  validateRequest,
  async (req, res) => {
    await advancedAiController.moderateContent(req, res);
  }
);

/**
 * @route POST /api/advanced-ai/moderation/batch
 * @desc Batch moderate multiple content items
 * @access Private
 */
router.post(
  '/moderation/batch',
  authenticate,
  moderationLimiter,
  batchModerationValidation,
  validateRequest,
  async (req, res) => {
    await advancedAiController.batchModerateContent(req, res);
  }
);

/**
 * @route GET /api/advanced-ai/moderation/stats
 * @desc Get moderation statistics
 * @access Private (Admin/Moderator only)
 */
router.get(
  '/moderation/stats',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  async (req, res) => {
    await advancedAiController.getModerationStatistics(req, res);
  }
);

/**
 * @route PUT /api/advanced-ai/moderation/thresholds
 * @desc Update moderation thresholds
 * @access Private (Admin only)
 */
router.put(
  '/moderation/thresholds',
  authenticate,
  requireRole(['ADMIN']),
  [
    body('thresholds')
      .isObject()
      .withMessage('Thresholds must be an object'),
    
    body('thresholds.toxicity')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Toxicity threshold must be between 0 and 1'),
    
    body('thresholds.bias')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Bias threshold must be between 0 and 1')
  ],
  validateRequest,
  async (req, res) => {
    await advancedAiController.updateModerationThresholds(req, res);
  }
);

/**
 * @route GET /api/advanced-ai/moderation/review-queue
 * @desc Get human review queue
 * @access Private (Moderator/Admin only)
 */
router.get(
  '/moderation/review-queue',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  [
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent')
  ],
  validateRequest,
  async (req, res) => {
    await advancedAiController.getHumanReviewQueue(req, res);
  }
);

/**
 * @route POST /api/advanced-ai/moderation/review-decision
 * @desc Process human review decision
 * @access Private (Moderator/Admin only)
 */
router.post(
  '/moderation/review-decision',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  [
    body('reviewId')
      .isString()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Review ID is required'),
    
    body('decision')
      .isIn(['approve', 'reject', 'modify'])
      .withMessage('Decision must be approve, reject, or modify'),
    
    body('feedback')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Feedback must be a string with maximum 1000 characters'),
    
    body('modifiedContent')
      .optional()
      .isString()
      .trim()
      .withMessage('Modified content must be a string')
  ],
  validateRequest,
  async (req, res) => {
    await advancedAiController.processHumanReview(req, res);
  }
);

/**
 * @route POST /api/advanced-ai/fact-verification/verify
 * @desc Verify facts in content
 * @access Private
 */
router.post(
  '/fact-verification/verify',
  authenticate,
  factVerificationValidation,
  validateRequest,
  async (req, res) => {
    await advancedAiController.verifyFacts(req, res);
  }
);

/**
 * @route GET /api/advanced-ai/fact-verification/stats
 * @desc Get fact verification statistics
 * @access Private (Admin only)
 */
router.get(
  '/fact-verification/stats',
  authenticate,
  requireRole(['ADMIN']),
  async (req, res) => {
    await advancedAiController.getFactVerificationStatistics(req, res);
  }
);

/**
 * @route POST /api/advanced-ai/fact-verification/add-fact
 * @desc Add verified fact to database
 * @access Private (Admin/Expert only)
 */
router.post(
  '/fact-verification/add-fact',
  authenticate,
  requireRole(['ADMIN', 'EXPERT']),
  [
    body('fact')
      .isObject()
      .withMessage('Fact must be an object'),
    
    body('fact.statement')
      .isString()
      .trim()
      .isLength({ min: 5, max: 1000 })
      .withMessage('Fact statement must be a string between 5 and 1000 characters'),
    
    body('fact.status')
      .isIn(['true', 'false', 'uncertain', 'context_dependent'])
      .withMessage('Invalid fact status'),
    
    body('fact.confidence')
      .isFloat({ min: 0, max: 1 })
      .withMessage('Confidence must be between 0 and 1'),
    
    body('domain')
      .optional()
      .isString()
      .trim()
      .withMessage('Domain must be a string')
  ],
  validateRequest,
  async (req, res) => {
    await advancedAiController.addVerifiedFact(req, res);
  }
);

/**
 * @route GET /api/advanced-ai/system/health
 * @desc Get comprehensive system health
 * @access Private
 */
router.get(
  '/system/health',
  authenticate,
  async (req, res) => {
    await advancedAiController.getSystemHealth(req, res);
  }
);

/**
 * @route GET /api/advanced-ai/system/performance
 * @desc Get system performance metrics
 * @access Private (Admin only)
 */
router.get(
  '/system/performance',
  authenticate,
  requireRole(['ADMIN']),
  [
    query('timeRange')
      .optional()
      .isIn(['1h', '24h', '7d', '30d'])
      .withMessage('Time range must be one of: 1h, 24h, 7d, 30d')
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { timeRange = '24h' } = req.query;

      // Mock performance data - in real implementation would query analytics
      const performanceData = {
        timeRange,
        multiProviderAI: {
          totalRequests: 2847,
          averageResponseTime: 1250,
          successRate: 0.96,
          costEfficiency: 0.82,
          providerDistribution: {
            google: 0.65,
            openai: 0.25,
            anthropic: 0.10
          }
        },
        contentModeration: {
          totalRequests: 3921,
          averageProcessingTime: 450,
          approvalRate: 0.89,
          humanReviewRate: 0.08,
          falsePositiveRate: 0.03
        },
        factVerification: {
          totalRequests: 1534,
          averageProcessingTime: 2100,
          verificationRate: 0.74,
          averageConfidence: 0.81,
          sourcesUtilized: 147
        },
        system: {
          uptime: '99.7%',
          memoryUsage: '68%',
          cpuUsage: '45%',
          errorRate: '0.4%'
        },
        trends: {
          requests: 'increasing',
          quality: 'improving',
          performance: 'stable',
          costs: 'decreasing'
        }
      };

      res.status(200).json({
        success: true,
        data: performanceData,
        metadata: {
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get performance metrics',
        code: 'PERFORMANCE_METRICS_FAILED'
      });
    }
  }
);

export default router;

