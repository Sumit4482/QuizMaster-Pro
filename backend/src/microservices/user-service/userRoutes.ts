import { Router } from 'express';
import { UserController } from './userController';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';
import { rateLimitMiddleware } from '../../middleware/rateLimit';
import { body, param } from 'express-validator';

const router = Router();
const userController = new UserController();

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, hyphens, and underscores'),
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
];

const userIdValidation = [
  param('userId')
    .isUUID()
    .withMessage('Valid user ID is required')
];

const changePasswordValidation = [
  ...userIdValidation,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

const updateProfileValidation = [
  ...userIdValidation,
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('username')
    .optional()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, hyphens, and underscores'),
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object')
];

// Public routes (no authentication required)
router.post('/register', 
  rateLimitMiddleware('strict'), // Strict rate limiting for registration
  registerValidation,
  validationMiddleware,
  userController.register
);

router.post('/login',
  rateLimitMiddleware('strict'), // Strict rate limiting for login
  loginValidation,
  validationMiddleware,
  userController.login
);

router.post('/refresh-token',
  rateLimitMiddleware('moderate'),
  refreshTokenValidation,
  validationMiddleware,
  userController.refreshToken
);

router.post('/logout',
  rateLimitMiddleware('lenient'),
  userController.logout
);

// Health check endpoint
router.get('/health',
  userController.healthCheck
);

// Protected routes (authentication required)
router.get('/profile/:userId',
  rateLimitMiddleware('lenient'),
  userIdValidation,
  validationMiddleware,
  authenticateToken,
  userController.getProfile
);

router.put('/profile/:userId',
  rateLimitMiddleware('moderate'),
  updateProfileValidation,
  validationMiddleware,
  authenticateToken,
  userController.updateProfile
);

router.post('/change-password/:userId',
  rateLimitMiddleware('moderate'),
  changePasswordValidation,
  validationMiddleware,
  authenticateToken,
  userController.changePassword
);

router.get('/stats/:userId',
  rateLimitMiddleware('lenient'),
  userIdValidation,
  validationMiddleware,
  authenticateToken,
  userController.getUserStats
);

// Admin only routes
router.delete('/account/:userId',
  rateLimitMiddleware('strict'),
  userIdValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  userController.deleteAccount
);

export default router;

