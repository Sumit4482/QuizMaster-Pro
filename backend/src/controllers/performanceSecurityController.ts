import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/responseUtils';
import { PerformanceSecurityIntegration } from '../performance/performanceSecurityIntegration';

export class PerformanceSecurityController {
  constructor(private integration: PerformanceSecurityIntegration) {}

  /**
   * Get system health report
   */
  getSystemHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      const healthReport = await this.integration.generateSystemHealthReport();
      
      successResponse(res, {
        healthReport,
        timestamp: new Date().toISOString()
      }, 'System health report generated successfully');
    } catch (error) {
      errorResponse(res, 'Failed to generate system health report', 500, error);
    }
  };

  /**
   * Get integration status
   */
  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = this.integration.getStatus();
      
      successResponse(res, {
        status,
        timestamp: new Date().toISOString()
      }, 'Integration status retrieved successfully');
    } catch (error) {
      errorResponse(res, 'Failed to retrieve integration status', 500, error);
    }
  };

  /**
   * Check user permissions
   */
  checkPermission = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, resource, action } = req.query;

      if (!userId || !resource || !action) {
        errorResponse(res, 'Missing required parameters: userId, resource, action', 400);
        return;
      }

      const hasPermission = this.integration.hasPermission(
        userId as string,
        resource as string,
        action as string
      );

      successResponse(res, {
        userId,
        resource,
        action,
        hasPermission
      }, 'Permission check completed');
    } catch (error) {
      errorResponse(res, 'Permission check failed', 500, error);
    }
  };

  /**
   * Assign role to user
   */
  assignRole = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, roleId } = req.body;

      if (!userId || !roleId) {
        errorResponse(res, 'Missing required fields: userId, roleId', 400);
        return;
      }

      const success = await this.integration.assignRole(userId, roleId);

      if (success) {
        successResponse(res, {
          userId,
          roleId,
          assigned: true
        }, 'Role assigned successfully');
      } else {
        errorResponse(res, 'Failed to assign role', 400);
      }
    } catch (error) {
      errorResponse(res, 'Role assignment failed', 500, error);
    }
  };

  /**
   * Run load test
   */
  runLoadTest = async (req: Request, res: Response): Promise<void> => {
    try {
      const testResult = await this.integration.runLoadTest();

      if (testResult.success) {
        successResponse(res, {
          results: testResult.results,
          timestamp: new Date().toISOString()
        }, 'Load test completed successfully');
      } else {
        errorResponse(res, testResult.error || 'Load test failed', 500);
      }
    } catch (error) {
      errorResponse(res, 'Load test execution failed', 500, error);
    }
  };

  /**
   * Get database optimization report
   */
  getDatabaseReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const databaseOptimizer = components.databaseOptimizer;

      if (!databaseOptimizer) {
        errorResponse(res, 'Database optimizer not enabled', 404);
        return;
      }

      const report = await databaseOptimizer.generateOptimizationReport();
      
      successResponse(res, {
        report,
        timestamp: new Date().toISOString()
      }, 'Database optimization report generated');
    } catch (error) {
      errorResponse(res, 'Failed to generate database report', 500, error);
    }
  };

  /**
   * Get cache statistics
   */
  getCacheStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const cachingStrategy = components.cachingStrategy;

      if (!cachingStrategy) {
        errorResponse(res, 'Caching strategy not enabled', 404);
        return;
      }

      const stats = cachingStrategy.getCacheStats();
      
      successResponse(res, {
        stats,
        timestamp: new Date().toISOString()
      }, 'Cache statistics retrieved');
    } catch (error) {
      errorResponse(res, 'Failed to retrieve cache statistics', 500, error);
    }
  };

  /**
   * Get performance alerts
   */
  getPerformanceAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const performanceMonitor = components.performanceMonitor;

      if (!performanceMonitor) {
        errorResponse(res, 'Performance monitor not enabled', 404);
        return;
      }

      const { severity, type, resolved, limit } = req.query;
      
      const filters = {
        severity: severity as string,
        type: type as string,
        resolved: resolved === 'true',
        limit: limit ? parseInt(limit as string) : 50
      };

      const alerts = performanceMonitor.getAlerts(filters);
      
      successResponse(res, {
        alerts,
        count: alerts.length,
        timestamp: new Date().toISOString()
      }, 'Performance alerts retrieved');
    } catch (error) {
      errorResponse(res, 'Failed to retrieve performance alerts', 500, error);
    }
  };

  /**
   * Get security alerts
   */
  getSecurityAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const rateLimiting = components.rateLimiting;

      if (!rateLimiting) {
        errorResponse(res, 'Rate limiting not enabled', 404);
        return;
      }

      const events = rateLimiting.getSecurityEvents(50);
      
      successResponse(res, {
        events,
        count: events.length,
        timestamp: new Date().toISOString()
      }, 'Security alerts retrieved');
    } catch (error) {
      errorResponse(res, 'Failed to retrieve security alerts', 500, error);
    }
  };

  /**
   * Get audit logs
   */
  getAuditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const auditLogging = components.auditLogging;

      if (!auditLogging) {
        errorResponse(res, 'Audit logging not enabled', 404);
        return;
      }

      const { userId, action, resource, startDate, endDate, limit, offset } = req.query;

      const criteria = {
        userId: userId as string,
        action: action as string,
        resource: resource as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 100,
        offset: offset ? parseInt(offset as string) : 0
      };

      const events = await auditLogging.searchEvents(criteria);
      
      successResponse(res, {
        events,
        count: events.length,
        criteria,
        timestamp: new Date().toISOString()
      }, 'Audit logs retrieved');
    } catch (error) {
      errorResponse(res, 'Failed to retrieve audit logs', 500, error);
    }
  };

  /**
   * Get GDPR compliance report
   */
  getGDPRReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const gdprCompliance = components.gdprCompliance;

      if (!gdprCompliance) {
        errorResponse(res, 'GDPR compliance not enabled', 404);
        return;
      }

      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const report = await gdprCompliance.generateComplianceReport(start, end);
      
      successResponse(res, {
        report,
        period: { start, end },
        timestamp: new Date().toISOString()
      }, 'GDPR compliance report generated');
    } catch (error) {
      errorResponse(res, 'Failed to generate GDPR report', 500, error);
    }
  };

  /**
   * Get WebSocket statistics
   */
  getWebSocketStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const webSocketOptimization = components.webSocketOptimization;

      if (!webSocketOptimization) {
        errorResponse(res, 'WebSocket optimization not enabled', 404);
        return;
      }

      const stats = webSocketOptimization.getOverallStats();
      
      successResponse(res, {
        stats,
        timestamp: new Date().toISOString()
      }, 'WebSocket statistics retrieved');
    } catch (error) {
      errorResponse(res, 'Failed to retrieve WebSocket statistics', 500, error);
    }
  };

  /**
   * Get asset optimization report
   */
  getAssetReport = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const assetOptimization = components.assetOptimization;

      if (!assetOptimization) {
        errorResponse(res, 'Asset optimization not enabled', 404);
        return;
      }

      const report = assetOptimization.getOptimizationReport();
      const manifest = assetOptimization.getManifest();
      
      successResponse(res, {
        report,
        manifest,
        timestamp: new Date().toISOString()
      }, 'Asset optimization report generated');
    } catch (error) {
      errorResponse(res, 'Failed to generate asset report', 500, error);
    }
  };

  /**
   * Optimize assets
   */
  optimizeAssets = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const assetOptimization = components.assetOptimization;

      if (!assetOptimization) {
        errorResponse(res, 'Asset optimization not enabled', 404);
        return;
      }

      const manifest = await assetOptimization.optimizeAll();
      
      successResponse(res, {
        manifest,
        message: 'Asset optimization completed',
        timestamp: new Date().toISOString()
      }, 'Assets optimized successfully');
    } catch (error) {
      errorResponse(res, 'Asset optimization failed', 500, error);
    }
  };

  /**
   * Clear performance caches
   */
  clearCaches = async (req: Request, res: Response): Promise<void> => {
    try {
      const components = this.integration.getComponents();
      const promises = [];

      if (components.cachingStrategy) {
        promises.push(components.cachingStrategy.clearAll());
      }

      if (components.assetOptimization) {
        promises.push(components.assetOptimization.clearCache());
      }

      await Promise.all(promises);
      
      successResponse(res, {
        cleared: promises.length,
        timestamp: new Date().toISOString()
      }, 'Caches cleared successfully');
    } catch (error) {
      errorResponse(res, 'Failed to clear caches', 500, error);
    }
  };
}

export default PerformanceSecurityController;

