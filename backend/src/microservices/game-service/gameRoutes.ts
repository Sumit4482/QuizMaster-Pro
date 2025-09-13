import { Router } from 'express';
import { GameController } from './gameController';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';
import { rateLimitMiddleware } from '../../middleware/rateLimit';
import { body, param, query } from 'express-validator';

const router = Router();
const gameController = new GameController();

// Validation rules
const createGameValidation = [
  body('title')
    .notEmpty()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('maxPlayers')
    .isInt({ min: 1, max: 100 })
    .withMessage('Max players must be between 1 and 100'),
  body('questionCount')
    .isInt({ min: 1, max: 50 })
    .withMessage('Question count must be between 1 and 50'),
  body('timeLimit')
    .isInt({ min: 10, max: 300 })
    .withMessage('Time limit must be between 10 and 300 seconds'),
  body('difficulty')
    .isArray({ min: 1 })
    .withMessage('At least one difficulty level is required'),
  body('difficulty.*')
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Invalid difficulty level'),
  body('categories')
    .isArray({ min: 1 })
    .withMessage('At least one category is required'),
  body('categories.*')
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each category must be between 1 and 50 characters'),
  body('subjects')
    .isArray({ min: 1 })
    .withMessage('At least one subject is required'),
  body('subjects.*')
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each subject must be between 1 and 50 characters'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  body('password')
    .optional()
    .isLength({ min: 4, max: 20 })
    .withMessage('Password must be between 4 and 20 characters'),
  body('allowReconnect')
    .optional()
    .isBoolean()
    .withMessage('allowReconnect must be a boolean'),
  body('showLeaderboard')
    .optional()
    .isBoolean()
    .withMessage('showLeaderboard must be a boolean')
];

const gameIdValidation = [
  param('gameId')
    .notEmpty()
    .isLength({ min: 3 })
    .withMessage('Valid game ID is required')
];

const joinGameValidation = [
  ...gameIdValidation,
  body('username')
    .notEmpty()
    .isLength({ min: 2, max: 30 })
    .withMessage('Username must be between 2 and 30 characters'),
  body('password')
    .optional()
    .isLength({ min: 4, max: 20 })
    .withMessage('Password must be between 4 and 20 characters')
];

const submitAnswerValidation = [
  ...gameIdValidation,
  param('questionId')
    .notEmpty()
    .withMessage('Question ID is required'),
  body('playerId')
    .notEmpty()
    .withMessage('Player ID is required'),
  body('selectedAnswers')
    .isArray({ min: 1, max: 10 })
    .withMessage('Selected answers must be an array with 1-10 items'),
  body('selectedAnswers.*')
    .isInt({ min: 0, max: 20 })
    .withMessage('Each selected answer must be a valid option index'),
  body('responseTime')
    .isInt({ min: 0, max: 600000 })
    .withMessage('Response time must be between 0 and 600000 milliseconds')
];

const searchGamesValidation = [
  query('category')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category must be between 1 and 50 characters'),
  query('difficulty')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Invalid difficulty level'),
  query('status')
    .optional()
    .isIn(['WAITING', 'IN_PROGRESS', 'COMPLETED'])
    .withMessage('Invalid game status'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer')
];

// Public routes (minimal authentication required)
router.get('/health',
  gameController.healthCheck
);

router.get('/search/public',
  rateLimitMiddleware('lenient'),
  searchGamesValidation,
  validationMiddleware,
  gameController.searchPublicGames
);

// Protected routes (authentication required)
router.get('/statistics',
  rateLimitMiddleware('lenient'),
  authenticateToken,
  gameController.getStatistics
);

router.get('/:gameId',
  rateLimitMiddleware('lenient'),
  gameIdValidation,
  validationMiddleware,
  authenticateToken,
  gameController.getGame
);

router.get('/:gameId/leaderboard',
  rateLimitMiddleware('lenient'),
  gameIdValidation,
  validationMiddleware,
  authenticateToken,
  gameController.getLeaderboard
);

// Game management routes
router.post('/create',
  rateLimitMiddleware('moderate'),
  createGameValidation,
  validationMiddleware,
  authenticateToken,
  gameController.createGame
);

router.post('/:gameId/join',
  rateLimitMiddleware('moderate'),
  joinGameValidation,
  validationMiddleware,
  authenticateToken,
  gameController.joinGame
);

router.post('/:gameId/leave',
  rateLimitMiddleware('moderate'),
  gameIdValidation,
  validationMiddleware,
  authenticateToken,
  gameController.leaveGame
);

router.post('/:gameId/start',
  rateLimitMiddleware('moderate'),
  gameIdValidation,
  validationMiddleware,
  authenticateToken,
  gameController.startGame
);

router.post('/:gameId/end',
  rateLimitMiddleware('moderate'),
  gameIdValidation,
  validationMiddleware,
  authenticateToken,
  gameController.endGame
);

// Gameplay routes
router.post('/:gameId/questions/:questionId/answer',
  rateLimitMiddleware('strict'), // Strict rate limiting for answer submissions
  submitAnswerValidation,
  validationMiddleware,
  authenticateToken,
  gameController.submitAnswer
);

export default router;

