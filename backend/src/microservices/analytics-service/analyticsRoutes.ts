import { Router } from 'express';
import { AnalyticsController } from './analyticsController';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { validationMiddleware } from '../../middleware/validation';
import { rateLimitMiddleware } from '../../middleware/rateLimit';
import { body, param, query } from 'express-validator';

const router = Router();
const analyticsController = new AnalyticsController();

// Validation rules
const trackEventValidation = [
  body('eventType')
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .withMessage('Event type must be between 1 and 50 characters'),
  body('eventCategory')
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .withMessage('Event category must be between 1 and 50 characters'),
  body('eventAction')
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .withMessage('Event action must be between 1 and 50 characters'),
  body('eventLabel')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Event label must not exceed 100 characters'),
  body('eventValue')
    .optional()
    .isNumeric()
    .withMessage('Event value must be a number'),
  body('properties')
    .optional()
    .isObject()
    .withMessage('Properties must be an object')
];

const recordMetricValidation = [
  body('name')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Metric name must be between 1 and 100 characters'),
  body('value')
    .isNumeric()
    .withMessage('Metric value must be a number'),
  body('unit')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Unit must not exceed 20 characters'),
  body('tags')
    .optional()
    .isObject()
    .withMessage('Tags must be an object')
];

const userIdValidation = [
  param('userId')
    .notEmpty()
    .isUUID()
    .withMessage('Valid user ID is required')
];

const timeRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

const generateReportValidation = [
  body('type')
    .isIn(['user', 'system', 'content', 'engagement', 'performance'])
    .withMessage('Invalid report type'),
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object'),
  body('groupBy')
    .optional()
    .isArray()
    .withMessage('GroupBy must be an array'),
  body('aggregations')
    .optional()
    .isArray()
    .withMessage('Aggregations must be an array'),
  body('format')
    .optional()
    .isIn(['json', 'csv', 'excel'])
    .withMessage('Invalid format'),
  body('timeRange')
    .optional()
    .isObject()
    .withMessage('Time range must be an object'),
  body('timeRange.start')
    .optional()
    .isISO8601()
    .withMessage('Time range start must be a valid ISO 8601 date'),
  body('timeRange.end')
    .optional()
    .isISO8601()
    .withMessage('Time range end must be a valid ISO 8601 date'),
  body('timeRange.granularity')
    .optional()
    .isIn(['hour', 'day', 'week', 'month'])
    .withMessage('Invalid granularity')
];

// Public routes
router.get('/health',
  analyticsController.healthCheck
);

// Event tracking (available to all authenticated users)
router.post('/events/track',
  rateLimitMiddleware('lenient'),
  trackEventValidation,
  validationMiddleware,
  analyticsController.trackEvent
);

router.post('/metrics/record',
  rateLimitMiddleware('moderate'),
  recordMetricValidation,
  validationMiddleware,
  analyticsController.recordMetric
);

// Analytics data retrieval (authenticated users)
router.get('/users/:userId',
  rateLimitMiddleware('lenient'),
  userIdValidation,
  timeRangeValidation,
  validationMiddleware,
  authenticateToken,
  analyticsController.getUserAnalytics
);

router.get('/system/metrics',
  rateLimitMiddleware('lenient'),
  timeRangeValidation,
  validationMiddleware,
  authenticateToken,
  analyticsController.getSystemMetrics
);

// Report generation (admin and analytics users only)
router.post('/reports/generate',
  rateLimitMiddleware('strict'),
  generateReportValidation,
  validationMiddleware,
  authenticateToken,
  requireRole(['admin', 'superadmin', 'analytics_user']),
  analyticsController.generateReport
);

export default router;

