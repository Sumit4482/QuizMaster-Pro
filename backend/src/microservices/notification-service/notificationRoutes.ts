import { Router } from 'express';
import { NotificationController } from './notificationController';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';
import { rateLimitMiddleware } from '../../middleware/rateLimit';
import { body, param, query } from 'express-validator';

const router = Router();
const notificationController = new NotificationController();

// Validation rules
const sendNotificationValidation = [
  body('userId').isUUID().withMessage('Valid user ID required'),
  body('type').isIn(['email', 'push', 'in_app', 'sms']).withMessage('Invalid notification type'),
  body('title').isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('message').isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters'),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Invalid priority')
];

const sendBulkValidation = [
  body('userIds').isArray({ min: 1, max: 1000 }).withMessage('UserIds array required (max 1000)'),
  body('type').isIn(['email', 'push', 'in_app', 'sms']).withMessage('Invalid notification type'),
  body('title').isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('message').isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters')
];

const sendMessageValidation = [
  body('recipientId').isUUID().withMessage('Valid recipient ID required'),
  body('content').isLength({ min: 1, max: 2000 }).withMessage('Content must be 1-2000 characters'),
  body('type').optional().isIn(['text', 'image', 'file', 'system']).withMessage('Invalid message type')
];

// Public routes
router.get('/health', notificationController.healthCheck);

// User messaging routes
router.post('/messages/send', 
  rateLimitMiddleware('moderate'),
  sendMessageValidation,
  validationMiddleware,
  authenticateToken,
  notificationController.sendMessage
);

router.get('/messages/:conversationId?',
  rateLimitMiddleware('lenient'),
  authenticateToken,
  notificationController.getUserMessages
);

// Notification routes
router.get('/notifications',
  rateLimitMiddleware('lenient'),
  authenticateToken,
  notificationController.getUserNotifications
);

router.patch('/notifications/:notificationId/read',
  rateLimitMiddleware('moderate'),
  param('notificationId').notEmpty().withMessage('Notification ID required'),
  validationMiddleware,
  authenticateToken,
  notificationController.markAsRead
);

router.patch('/preferences',
  rateLimitMiddleware('moderate'),
  authenticateToken,
  notificationController.updatePreferences
);

// Admin routes
router.post('/send',
  rateLimitMiddleware('strict'),
  sendNotificationValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  notificationController.sendNotification
);

router.post('/send/bulk',
  rateLimitMiddleware('strict'),
  sendBulkValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  notificationController.sendBulkNotifications
);

export default router;

