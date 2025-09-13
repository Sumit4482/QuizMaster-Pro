import express from 'express';
import { MonitoringController } from '../controllers/monitoringController';
import { authenticate, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { rateLimit } from 'express-rate-limit';
import { body, query, param } from 'express-validator';

const router = express.Router();
const monitoringController = new MonitoringController();

/**
 * Phase 4.1: Monitoring and Analytics API Routes
 */

// Rate limiting for monitoring endpoints
const monitoringLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Higher limit for monitoring endpoints
  message: {
    success: false,
    error: 'Too many monitoring requests. Please try again later.',
    code: 'MONITORING_RATE_LIMIT_EXCEEDED'
  }
});

// Rate limiting for analytics tracking
const trackingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // High limit for event tracking
  message: {
    success: false,
    error: 'Too many tracking requests. Please try again later.',
    code: 'TRACKING_RATE_LIMIT_EXCEEDED'
  }
});

// Validation schemas
const trackEventValidation = [
  body('sessionId')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Session ID must be a string between 1 and 100 characters'),
  
  body('eventType')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Event type must be a string between 1 and 50 characters'),
  
  body('eventCategory')
    .isIn(['user', 'quiz', 'question', 'system'])
    .withMessage('Event category must be one of: user, quiz, question, system'),
  
  body('properties')
    .optional()
    .isObject()
    .withMessage('Properties must be an object'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

const createDashboardValidation = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be a string between 1 and 100 characters'),
  
  body('description')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Description must be a string between 1 and 500 characters'),
  
  body('widgets')
    .isArray({ min: 1, max: 20 })
    .withMessage('Widgets must be an array with 1-20 items'),
  
  body('widgets.*.type')
    .isIn(['chart', 'metric', 'alert', 'table', 'gauge'])
    .withMessage('Widget type must be one of: chart, metric, alert, table, gauge'),
  
  body('widgets.*.title')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Widget title must be a string between 1 and 100 characters'),
  
  body('widgets.*.dataSource')
    .isIn(['monitoring', 'analytics', 'business'])
    .withMessage('Data source must be one of: monitoring, analytics, business')
];

const generateReportValidation = [
  body('type')
    .optional()
    .isIn(['user', 'quiz', 'business', 'performance'])
    .withMessage('Type must be one of: user, quiz, business, performance'),
  
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

const queryLogsValidation = [
  query('level')
    .optional()
    .isString()
    .withMessage('Level must be a string'),
  
  query('component')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Component must be a string between 1 and 50 characters'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be an integer between 1 and 1000')
];

/**
 * @route GET /api/monitoring/health
 * @desc Get comprehensive system health overview
 * @access Private
 */
router.get(
  '/health',
  authenticate,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getSystemHealth(req, res);
  }
);

/**
 * @route GET /api/monitoring/metrics/current
 * @desc Get current system and application metrics
 * @access Private (Admin/Monitor only)
 */
router.get(
  '/metrics/current',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getCurrentSystemMetrics(req, res);
  }
);

/**
 * @route GET /api/monitoring/metrics/history
 * @desc Get historical metrics data
 * @access Private (Admin/Monitor only)
 */
router.get(
  '/metrics/history',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  [
    query('hours')
      .optional()
      .isInt({ min: 1, max: 168 })
      .withMessage('Hours must be an integer between 1 and 168')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getMetricsHistory(req, res);
  }
);

/**
 * @route GET /api/monitoring/alerts
 * @desc Get active alerts
 * @access Private (Admin/Monitor only)
 */
router.get(
  '/alerts',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getActiveAlerts(req, res);
  }
);

/**
 * @route POST /api/monitoring/alerts/:alertId/acknowledge
 * @desc Acknowledge an alert
 * @access Private (Admin/Monitor only)
 */
router.post(
  '/alerts/:alertId/acknowledge',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  [
    param('alertId')
      .isString()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Alert ID is required')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.acknowledgeAlert(req, res);
  }
);

/**
 * @route POST /api/monitoring/reports/generate
 * @desc Generate monitoring report
 * @access Private (Admin only)
 */
router.post(
  '/reports/generate',
  authenticate,
  requireRole(['ADMIN']),
  [
    body('hours')
      .optional()
      .isInt({ min: 1, max: 168 })
      .withMessage('Hours must be an integer between 1 and 168')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.generateMonitoringReport(req, res);
  }
);

/**
 * @route POST /api/monitoring/analytics/track
 * @desc Track analytics event
 * @access Private
 */
router.post(
  '/analytics/track',
  authenticate,
  trackingLimiter,
  trackEventValidation,
  validateRequest,
  async (req, res) => {
    await monitoringController.trackEvent(req, res);
  }
);

/**
 * @route GET /api/monitoring/analytics/quiz/:quizId
 * @desc Get quiz analytics
 * @access Private
 */
router.get(
  '/analytics/quiz/:quizId',
  authenticate,
  [
    param('quizId')
      .isUUID()
      .withMessage('Quiz ID must be a valid UUID'),
    
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getQuizAnalytics(req, res);
  }
);

/**
 * @route GET /api/monitoring/analytics/user/:userId/patterns
 * @desc Get user behavior patterns
 * @access Private (Self or Admin)
 */
router.get(
  '/analytics/user/:userId/patterns',
  authenticate,
  [
    param('userId')
      .isUUID()
      .withMessage('User ID must be a valid UUID')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getUserBehaviorPatterns(req, res);
  }
);

/**
 * @route GET /api/monitoring/analytics/business/metrics
 * @desc Get business metrics
 * @access Private (Admin only)
 */
router.get(
  '/analytics/business/metrics',
  authenticate,
  requireRole(['ADMIN']),
  [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getBusinessMetrics(req, res);
  }
);

/**
 * @route POST /api/monitoring/analytics/insights/generate
 * @desc Generate insights report
 * @access Private (Admin only)
 */
router.post(
  '/analytics/insights/generate',
  authenticate,
  requireRole(['ADMIN']),
  generateReportValidation,
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.generateInsightsReport(req, res);
  }
);

/**
 * @route POST /api/monitoring/dashboards
 * @desc Create observability dashboard
 * @access Private (Admin/Monitor only)
 */
router.post(
  '/dashboards',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  createDashboardValidation,
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.createDashboard(req, res);
  }
);

/**
 * @route GET /api/monitoring/dashboards/:dashboardId
 * @desc Get dashboard data
 * @access Private (Admin/Monitor only)
 */
router.get(
  '/dashboards/:dashboardId',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  [
    param('dashboardId')
      .isString()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Dashboard ID is required')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getDashboardData(req, res);
  }
);

/**
 * @route GET /api/monitoring/logs
 * @desc Query system logs
 * @access Private (Admin/Monitor only)
 */
router.get(
  '/logs',
  authenticate,
  requireRole(['ADMIN', 'MODERATOR']),
  queryLogsValidation,
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.queryLogs(req, res);
  }
);

/**
 * @route POST /api/monitoring/tracing/start
 * @desc Start distributed trace
 * @access Private
 */
router.post(
  '/tracing/start',
  authenticate,
  [
    body('operationName')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Operation name must be a string between 1 and 100 characters'),
    
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.startTrace(req, res);
  }
);

/**
 * @route POST /api/monitoring/tracing/:traceId/end
 * @desc End distributed trace
 * @access Private
 */
router.post(
  '/tracing/:traceId/end',
  authenticate,
  [
    param('traceId')
      .isString()
      .trim()
      .isLength({ min: 1 })
      .withMessage('Trace ID is required'),
    
    body('status')
      .optional()
      .isIn(['success', 'error'])
      .withMessage('Status must be success or error')
  ],
  validateRequest,
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.endTrace(req, res);
  }
);

/**
 * @route GET /api/monitoring/observability/metrics
 * @desc Get comprehensive observability metrics
 * @access Private (Admin only)
 */
router.get(
  '/observability/metrics',
  authenticate,
  requireRole(['ADMIN']),
  monitoringLimiter,
  async (req, res) => {
    await monitoringController.getObservabilityMetrics(req, res);
  }
);

/**
 * @route GET /api/monitoring/status
 * @desc Get monitoring system status (health check for monitoring itself)
 * @access Private
 */
router.get(
  '/status',
  authenticate,
  async (req, res) => {
    try {
      const status = {
        monitoring: 'healthy',
        analytics: 'healthy',
        observability: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      };

      res.status(200).json({
        success: true,
        data: status
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Monitoring system status check failed',
        code: 'STATUS_CHECK_FAILED'
      });
    }
  }
);

export default router;

