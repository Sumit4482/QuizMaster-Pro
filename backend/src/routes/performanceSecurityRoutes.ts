import { Router } from 'express';
import { PerformanceSecurityController } from '../controllers/performanceSecurityController';
import { authenticateToken } from '../middleware/auth';
import { PerformanceSecurityIntegration } from '../performance/performanceSecurityIntegration';

export function createPerformanceSecurityRoutes(integration: PerformanceSecurityIntegration): Router {
  const router = Router();
  const controller = new PerformanceSecurityController(integration);

  // Public health check endpoint
  router.get('/health', controller.getSystemHealth);
  router.get('/status', controller.getStatus);

  // Authentication required for all other endpoints
  router.use(authenticateToken);

  // Permission and role management
  router.get('/permission/check', controller.checkPermission);
  router.post('/role/assign', controller.assignRole);

  // Performance monitoring
  router.get('/performance/alerts', controller.getPerformanceAlerts);
  router.get('/database/report', controller.getDatabaseReport);
  router.get('/cache/stats', controller.getCacheStats);
  router.get('/websocket/stats', controller.getWebSocketStats);

  // Asset optimization
  router.get('/assets/report', controller.getAssetReport);
  router.post('/assets/optimize', controller.optimizeAssets);

  // Security monitoring
  router.get('/security/alerts', controller.getSecurityAlerts);
  router.get('/audit/logs', controller.getAuditLogs);
  router.get('/gdpr/report', controller.getGDPRReport);

  // Load testing
  router.post('/load-test/run', controller.runLoadTest);

  // Cache management
  router.delete('/cache/clear', controller.clearCaches);

  return router;
}

export default createPerformanceSecurityRoutes;

