import { Router } from 'express';
import { oneVsOneController } from '../controllers/oneVsOneController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All 1vs1 routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/1vs1/create:
 *   post:
 *     summary: Create a 1vs1 battle request
 *     tags: [1vs1]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *             properties:
 *               topic:
 *                 type: string
 *                 description: Topic for the battle
 *                 example: "JavaScript Programming"
 *               difficulty:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 default: 2
 *                 description: Difficulty level
 *               questionCount:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 20
 *                 default: 10
 *                 description: Number of questions
 *               useAI:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to use AI-generated questions
 *               aiTopic:
 *                 type: string
 *                 description: Specific AI topic (defaults to topic)
 *               categoryIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Category IDs for questions
 *     responses:
 *       201:
 *         description: Battle request created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 */
router.post('/create', oneVsOneController.createBattle);

/**
 * @swagger
 * /api/1vs1/queue:
 *   post:
 *     summary: Join the 1vs1 matchmaking queue
 *     tags: [1vs1]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic:
 *                 type: string
 *                 default: "General Knowledge"
 *               difficulty:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 default: 2
 *               questionCount:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 20
 *                 default: 10
 *               useAI:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Successfully joined queue
 *       401:
 *         description: Authentication required
 */
router.post('/queue', oneVsOneController.joinQueue);

/**
 * @swagger
 * /api/1vs1/active:
 *   get:
 *     summary: Get active 1vs1 battles
 *     tags: [1vs1]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active battles retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/active', oneVsOneController.getActiveBattles);

/**
 * @swagger
 * /api/1vs1/stats:
 *   get:
 *     summary: Get 1vs1 battle statistics
 *     tags: [1vs1]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/stats', oneVsOneController.getStats);

export default router;


