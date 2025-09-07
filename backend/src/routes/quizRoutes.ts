import { Router } from 'express';
import { quizController } from '@/controllers/quizController';
import { authenticate } from '@/middleware/auth';
import { adminAuth } from '@/middleware/adminAuth';
import { rateLimiter } from '@/middleware/common';

const router = Router();

// Health check endpoint (public)
router.get('/health', quizController.healthCheck);

// All other endpoints require authentication
router.use(authenticate);

// Quiz Session Management Routes
router.post('/sessions', rateLimiter, quizController.createSession);
router.get('/sessions', quizController.getUserSessions);
router.get('/sessions/:sessionId', quizController.getSession);
router.post('/sessions/:sessionId/start', quizController.startSession);
router.post('/sessions/:sessionId/pause', quizController.pauseSession);
router.post('/sessions/:sessionId/resume', quizController.resumeSession);

// Quiz Gameplay Routes
router.get('/sessions/:sessionId/current-question', quizController.getCurrentQuestion);
router.post('/sessions/:sessionId/submit-answer', rateLimiter, quizController.submitAnswer);

// Quiz Results Routes
router.get('/sessions/:sessionId/results', quizController.getQuizResults);
router.post('/sessions/:sessionId/generate-results', quizController.generateQuizResults);

// User Statistics and History Routes
router.get('/history', quizController.getQuizHistory);
router.get('/statistics', quizController.getUserStatistics);

// Admin Routes
router.post('/admin/cleanup-sessions', adminAuth, quizController.cleanupExpiredSessions);

export { router as quizRoutes };
