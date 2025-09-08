/**
 * AI Routes
 * API endpoints for AI-powered question generation and content validation
 */

import express, { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { adminAuth } from '@/middleware/adminAuth';
import { AiController } from '@/controllers/aiController';
import { validate } from '@/utils/validation';
import Joi from 'joi';

const router: Router = express.Router();
const aiController = new AiController();

// Validation schemas
const questionGenerationSchema = Joi.object({
  topic: Joi.string().required().min(2).max(200).description('Topic for question generation'),
  subject: Joi.string().optional().max(100).description('Subject area'),
  difficulty: Joi.number().integer().min(1).max(5).required().description('Difficulty level (1-5)'),
  questionType: Joi.string().valid('MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT_INPUT').required().description('Type of questions to generate'),
  count: Joi.number().integer().min(1).max(20).default(5).description('Number of questions to generate'),
  language: Joi.string().optional().max(20).default('en').description('Language for questions'),
  categoryId: Joi.number().integer().optional().description('Category ID for questions'),
  context: Joi.string().optional().max(1000).description('Additional context for generation'),
  customRequirements: Joi.string().optional().max(500).description('Custom requirements'),
  tags: Joi.array().items(Joi.string().max(50)).optional().description('Tags for questions'),
  preferredModel: Joi.string().optional().max(100).description('Preferred AI model'),
  preferredProvider: Joi.string().optional().max(100).description('Preferred AI provider'),
  maxCost: Joi.number().positive().optional().description('Maximum cost per request'),
  qualityThreshold: Joi.number().min(0).max(1).optional().description('Minimum quality threshold')
});

const contentValidationSchema = Joi.object({
  content: Joi.alternatives().try(
    Joi.string().required(),
    Joi.object().required(),
    Joi.array().required()
  ).description('Content to validate'),
  requestType: Joi.string().valid('QUESTION_GENERATION', 'CONTENT_VALIDATION', 'QUALITY_ASSESSMENT', 'FACT_CHECK').required().description('Type of validation'),
  context: Joi.object({
    topic: Joi.string().optional(),
    difficulty: Joi.number().integer().min(1).max(5).optional(),
    existingContent: Joi.array().items(Joi.string()).optional()
  }).optional().description('Validation context')
});

const budgetUpdateSchema = Joi.object({
  monthlyBudget: Joi.number().positive().optional().description('Monthly budget limit'),
  dailyLimit: Joi.number().integer().positive().optional().description('Daily usage limit'),
  allowPaidModels: Joi.boolean().optional().description('Allow paid AI models'),
  autoOptimizeCost: Joi.boolean().optional().description('Auto-optimize for cost'),
  qualityPreference: Joi.number().min(0).max(1).optional().description('Quality vs cost preference')
});

const modelSelectionSchema = Joi.object({
  requestType: Joi.string().valid('QUESTION_GENERATION', 'BATCH_GENERATION', 'CONTENT_VALIDATION').required(),
  prompt: Joi.string().required().min(5).max(5000),
  parameters: Joi.object({
    temperature: Joi.number().min(0).max(2).optional(),
    maxTokens: Joi.number().integer().positive().optional(),
    topP: Joi.number().min(0).max(1).optional()
  }).optional(),
  constraints: Joi.object({
    dailyLimit: Joi.number().positive().optional(),
    monthlyLimit: Joi.number().positive().optional(),
    perRequestLimit: Joi.number().positive().optional(),
    allowPaidModels: Joi.boolean().optional(),
    preferFreeModels: Joi.boolean().optional()
  }).optional(),
  qualityRequirements: Joi.object({
    minScore: Joi.number().min(0).max(1).required()
  }).optional()
});

/**
 * @swagger
 * components:
 *   schemas:
 *     QuestionGenerationRequest:
 *       type: object
 *       required:
 *         - topic
 *         - difficulty
 *         - questionType
 *       properties:
 *         topic:
 *           type: string
 *           description: Topic for question generation
 *           example: "JavaScript Programming"
 *         difficulty:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           description: Difficulty level
 *           example: 3
 *         questionType:
 *           type: string
 *           enum: [MULTIPLE_CHOICE, TRUE_FALSE, TEXT_INPUT]
 *           description: Type of questions
 *           example: "MULTIPLE_CHOICE"
 *         count:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *           description: Number of questions
 *         subject:
 *           type: string
 *           description: Subject area
 *           example: "Computer Science"
 *         preferredModel:
 *           type: string
 *           description: Preferred AI model
 *           example: "gpt-3.5-turbo"
 *     
 *     GeneratedQuestion:
 *       type: object
 *       properties:
 *         questionText:
 *           type: string
 *           description: The question text
 *         questionType:
 *           type: string
 *           enum: [MULTIPLE_CHOICE, TRUE_FALSE, TEXT_INPUT]
 *         options:
 *           type: array
 *           items:
 *             type: string
 *           description: Answer options for multiple choice
 *         correctAnswer:
 *           description: The correct answer
 *         explanation:
 *           type: string
 *           description: Explanation of the answer
 *         difficulty:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         qualityScore:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *           description: AI-assessed quality score
 */

/**
 * @swagger
 * /api/ai/generate/questions:
 *   post:
 *     summary: Generate AI-powered quiz questions
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuestionGenerationRequest'
 *     responses:
 *       200:
 *         description: Questions generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     questions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/GeneratedQuestion'
 *                     totalGenerated:
 *                       type: integer
 *                     validQuestions:
 *                       type: integer
 *                     cost:
 *                       type: object
 *                       properties:
 *                         totalCost:
 *                           type: number
 *                         currency:
 *                           type: string
 *                     qualityMetrics:
 *                       type: object
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Budget limits exceeded
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: AI service error
 */
router.post(
  '/generate/questions',
  authenticate,
  validate(questionGenerationSchema),
  aiController.generateQuestions.bind(aiController)
);

/**
 * @swagger
 * /api/ai/validate/content:
 *   post:
 *     summary: Validate AI-generated or user content
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContentValidationRequest'
 *     responses:
 *       200:
 *         description: Content validated successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/validate/content',
  authenticate,
  validate(contentValidationSchema),
  aiController.validateContent.bind(aiController)
);

/**
 * @swagger
 * /api/ai/models:
 *   get:
 *     summary: Get available AI models
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available models retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                           isFree:
 *                             type: boolean
 *                           models:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 name:
 *                                   type: string
 *                                 displayName:
 *                                   type: string
 *                                 qualityScore:
 *                                   type: number
 *                                 speedScore:
 *                                   type: number
 *                                 costPerToken:
 *                                   type: number
 */
router.get(
  '/models',
  authenticate,
  aiController.getAvailableModels.bind(aiController)
);

/**
 * @swagger
 * /api/ai/models/select:
 *   post:
 *     summary: Get optimal model recommendation for a request
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ModelSelectionRequest'
 *     responses:
 *       200:
 *         description: Model recommendation provided
 */
router.post(
  '/models/select',
  authenticate,
  validate(modelSelectionSchema),
  aiController.selectOptimalModel.bind(aiController)
);

/**
 * @swagger
 * /api/ai/usage:
 *   get:
 *     summary: Get AI usage statistics for current user
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, monthly, total]
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Usage statistics retrieved
 */
router.get(
  '/usage',
  authenticate,
  aiController.getUsageStatistics.bind(aiController)
);

/**
 * @swagger
 * /api/ai/budget:
 *   get:
 *     summary: Get current budget status
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Budget status retrieved
 *   put:
 *     summary: Update budget settings
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BudgetUpdateRequest'
 *     responses:
 *       200:
 *         description: Budget updated successfully
 */
router.get(
  '/budget',
  authenticate,
  aiController.getBudgetStatus.bind(aiController)
);

router.put(
  '/budget',
  authenticate,
  validate(budgetUpdateSchema),
  aiController.updateBudget.bind(aiController)
);

/**
 * @swagger
 * /api/ai/health:
 *   get:
 *     summary: Check AI service health
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI service health status
 */
router.get(
  '/health',
  authenticate,
  aiController.getHealthStatus.bind(aiController)
);

/**
 * @swagger
 * /api/ai/history:
 *   get:
 *     summary: Get AI generation history
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: Generation history retrieved
 */
router.get(
  '/history',
  authenticate,
  aiController.getGenerationHistory.bind(aiController)
);

// Admin-only routes
/**
 * @swagger
 * /api/ai/admin/analytics:
 *   get:
 *     summary: Get system-wide AI analytics (Admin only)
 *     tags: [AI, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System analytics retrieved
 *       403:
 *         description: Admin access required
 */
router.get(
  '/admin/analytics',
  authenticate,
  adminAuth,
  aiController.getSystemAnalytics.bind(aiController)
);

/**
 * @swagger
 * /api/ai/admin/providers:
 *   get:
 *     summary: Get AI provider management (Admin only)
 *     tags: [AI, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provider status retrieved
 *   put:
 *     summary: Update provider configuration (Admin only)
 *     tags: [AI, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provider configuration updated
 */
router.get(
  '/admin/providers',
  authenticate,
  adminAuth,
  aiController.getProviderStatus.bind(aiController)
);

router.put(
  '/admin/providers',
  authenticate,
  adminAuth,
  aiController.updateProviderConfig.bind(aiController)
);

/**
 * @swagger
 * /api/ai/admin/costs:
 *   get:
 *     summary: Get system-wide cost analytics (Admin only)
 *     tags: [AI, Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cost analytics retrieved
 */
router.get(
  '/admin/costs',
  authenticate,
  adminAuth,
  aiController.getCostAnalytics.bind(aiController)
);

export { router as aiRoutes };
export default router;
