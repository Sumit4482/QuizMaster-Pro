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
