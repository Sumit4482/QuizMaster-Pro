import { Router } from 'express';
import { AuthController } from '@/controllers/authController';
import { authenticate } from '@/middleware/auth';
import { authRateLimit } from '@/middleware/common';
import { 
  validate, 
  validateQuery, 
  validateParams, 
  authValidation, 
  userValidation, 
  commonValidation 
} from '@/utils/validation';

const router = Router();
const authController = new AuthController();

// Public authentication routes (with rate limiting)
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: securePassword123!
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               rememberMe:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                         refreshToken:
 *                           type: string
 *                         expiresAt:
 *                           type: string
 *                           format: date-time
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/register',
  authRateLimit,
  validate(authValidation.register),
  authController.register
);

router.post(
  '/login',
  authRateLimit,
  validate(authValidation.login),
  authController.login
);

router.post(
  '/refresh',
  authRateLimit,
  validate(authValidation.refreshToken),
  authController.refreshToken
);

// Email availability check (public, with rate limiting)
router.get(
  '/check-email',
  authRateLimit,
  authController.checkEmailAvailability
);

// Password reset routes (UI preparation, with rate limiting)
router.post(
  '/forgot-password',
  authRateLimit,
  validate(authValidation.forgotPassword),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authRateLimit,
  validate(authValidation.resetPassword),
  authController.resetPassword
);

// Protected authentication routes (require authentication)
router.post(
  '/logout',
  authenticate,
  authController.logout
);

router.post(
  '/logout-all',
  authenticate,
  authController.logoutAll
);

// User profile routes (protected)
router.get(
  '/profile',
  authenticate,
  authController.getProfile
);

router.put(
  '/profile',
  authenticate,
  validate(userValidation.updateProfile),
  authController.updateProfile
);

router.put(
  '/change-password',
  authenticate,
  validate(userValidation.changePassword),
  authController.changePassword
);

// Session management routes (protected)
router.get(
  '/sessions',
  authenticate,
  authController.getSessions
);

router.delete(
  '/sessions/:sessionId',
  authenticate,
  validateParams(commonValidation.sessionParams),
  authController.revokeSession
);

export default router;
