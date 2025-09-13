import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface ServiceInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  metadata: {
    version: string;
    environment: string;
    capabilities: string[];
    tags: string[];
  };
  health: {
    lastCheck: Date;
    consecutiveFailures: number;
    averageResponseTime: number;
  };
  registeredAt: Date;
  lastHeartbeat: Date;
}

export interface ServiceRegistration {
  name: string;
  host: string;
  port: number;
  protocol?: 'http' | 'https';
  metadata?: {
    version?: string;
    environment?: string;
    capabilities?: string[];
    tags?: string[];
  };
  healthCheckPath?: string;
  healthCheckInterval?: number;
}

/**
 * Phase 4.2: Service Discovery System
 * 
 * Central registry for service discovery with:
 * - Service registration and deregistration
 * - Health monitoring and status tracking
 * - Service instance load balancing
 * - Automatic service cleanup
 */
export class ServiceDiscovery extends EventEmitter {
  private static instance: ServiceDiscovery | null = null;
  
  private services: Map<string, ServiceInstance[]> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  private readonly DEFAULT_HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly SERVICE_TIMEOUT = 90000; // 90 seconds
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  private constructor() {
    super();
    this.startCleanupProcess();
  }

  public static getInstance(): ServiceDiscovery {
    if (!ServiceDiscovery.instance) {
      ServiceDiscovery.instance = new ServiceDiscovery();
    }
    return ServiceDiscovery.instance;
  }

  /**
   * Register a service instance
   */
  public async registerService(registration: ServiceRegistration): Promise<ServiceInstance> {
    const serviceId = `${registration.name}-${registration.host}-${registration.port}`;
    
    const instance: ServiceInstance = {
      id: serviceId,
      name: registration.name,
      host: registration.host,
      port: registration.port,
      protocol: registration.protocol || 'http',
      status: 'starting',
      metadata: {
        version: registration.metadata?.version || '1.0.0',
        environment: registration.metadata?.environment || 'development',
        capabilities: registration.metadata?.capabilities || [],
        tags: registration.metadata?.tags || []
      },
      health: {
        lastCheck: new Date(),
        consecutiveFailures: 0,
        averageResponseTime: 0
      },
      registeredAt: new Date(),
      lastHeartbeat: new Date()
    };

    // Add to services map
    if (!this.services.has(registration.name)) {
      this.services.set(registration.name, []);
    }
    
    const serviceInstances = this.services.get(registration.name)!;
    
    // Check if instance already exists (update it)
    const existingIndex = serviceInstances.findIndex(s => s.id === serviceId);
    if (existingIndex >= 0) {
      serviceInstances[existingIndex] = instance;
      logger.info('🔄 Service instance updated', {
        component: 'ServiceDiscovery',
        serviceId,
        name: registration.name,
        endpoint: `${instance.protocol}://${instance.host}:${instance.port}`
      });
    } else {
      serviceInstances.push(instance);
      logger.info('➕ Service instance registered', {
        component: 'ServiceDiscovery',
        serviceId,
        name: registration.name,
        endpoint: `${instance.protocol}://${instance.host}:${instance.port}`
      });
    }

    // Start health checking
    if (registration.healthCheckPath) {
      this.startHealthChecking(
        instance,
        registration.healthCheckPath,
        registration.healthCheckInterval || this.DEFAULT_HEALTH_CHECK_INTERVAL
      );
    } else {
      // Mark as healthy if no health check specified
      instance.status = 'healthy';
    }

    this.emit('serviceRegistered', { instance, registration });
    return instance;
  }

  /**
   * Deregister a service instance
   */
  public async deregisterService(serviceName: string, host: string, port: number): Promise<boolean> {
    const serviceId = `${serviceName}-${host}-${port}`;
    
    if (!this.services.has(serviceName)) {
      return false;
    }

    const serviceInstances = this.services.get(serviceName)!;
    const instanceIndex = serviceInstances.findIndex(s => s.id === serviceId);
    
    if (instanceIndex === -1) {
      return false;
    }

    const instance = serviceInstances[instanceIndex];
    instance.status = 'stopping';
    
    // Remove from instances
    serviceInstances.splice(instanceIndex, 1);
    
    // Clean up empty service entries
    if (serviceInstances.length === 0) {
      this.services.delete(serviceName);
    }

    // Stop health checking
    const healthCheckInterval = this.healthCheckIntervals.get(serviceId);
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      this.healthCheckIntervals.delete(serviceId);
    }

    logger.info('➖ Service instance deregistered', {
      component: 'ServiceDiscovery',
      serviceId,
      serviceName,
      endpoint: `${instance.protocol}://${instance.host}:${instance.port}`
    });

    this.emit('serviceDeregistered', { instance });
    return true;
  }

  /**
   * Get service instance (load balanced)
   */
  public async getService(serviceName: string): Promise<ServiceInstance | null> {
    const instances = this.getHealthyInstances(serviceName);
    
    if (instances.length === 0) {
      logger.warn('No healthy instances found', {
        component: 'ServiceDiscovery',
        serviceName,
        totalInstances: this.services.get(serviceName)?.length || 0
      });
      return null;
    }

    // Simple round-robin load balancing
    const selectedInstance = this.selectInstance(instances);
    
    logger.debug('Service instance selected', {
      component: 'ServiceDiscovery',
      serviceName,
      instanceId: selectedInstance.id,
      endpoint: `${selectedInstance.protocol}://${selectedInstance.host}:${selectedInstance.port}`
    });

    return selectedInstance;
  }

  /**
   * Get all instances for a service
   */
  public getServiceInstances(serviceName: string): ServiceInstance[] {
    return this.services.get(serviceName) || [];
  }

  /**
   * Get healthy instances only
   */
  public getHealthyInstances(serviceName: string): ServiceInstance[] {
    const instances = this.services.get(serviceName) || [];
    return instances.filter(instance => instance.status === 'healthy');
  }

  /**
   * Get all registered services
   */
  public getAllServices(): { [serviceName: string]: ServiceInstance[] } {
    const result: { [serviceName: string]: ServiceInstance[] } = {};
    
    this.services.forEach((instances, serviceName) => {
      result[serviceName] = [...instances];
    });
    
    return result;
  }

  /**
   * Update service heartbeat
   */
  public updateHeartbeat(serviceName: string, host: string, port: number): boolean {
    const serviceId = `${serviceName}-${host}-${port}`;
    const instances = this.services.get(serviceName) || [];
    
    const instance = instances.find(s => s.id === serviceId);
    if (instance) {
      instance.lastHeartbeat = new Date();
      return true;
    }
    
    return false;
  }

  /**
   * Get service discovery statistics
   */
  public getStatistics(): {
    totalServices: number;
    totalInstances: number;
    healthyInstances: number;
    unhealthyInstances: number;
    serviceBreakdown: { [serviceName: string]: { total: number; healthy: number } };
  } {
    let totalInstances = 0;
    let healthyInstances = 0;
    let unhealthyInstances = 0;
    const serviceBreakdown: { [serviceName: string]: { total: number; healthy: number } } = {};

    this.services.forEach((instances, serviceName) => {
      const healthyCount = instances.filter(i => i.status === 'healthy').length;
      
      totalInstances += instances.length;
      healthyInstances += healthyCount;
      unhealthyInstances += instances.length - healthyCount;
      
      serviceBreakdown[serviceName] = {
        total: instances.length,
        healthy: healthyCount
      };
    });

    return {
      totalServices: this.services.size,
      totalInstances,
      healthyInstances,
      unhealthyInstances,
      serviceBreakdown
    };
  }

  /**
   * Start health checking for a service instance
   */
  private startHealthChecking(
    instance: ServiceInstance,
    healthCheckPath: string,
    interval: number
  ): void {
    const checkHealth = async () => {
      try {
        const startTime = Date.now();
        
        // Make HTTP request to health check endpoint
        const healthCheckUrl = `${instance.protocol}://${instance.host}:${instance.port}${healthCheckPath}`;
        
        // Mock health check - in real implementation, would use fetch or axios
        const isHealthy = await this.performHealthCheck(healthCheckUrl);
        const responseTime = Date.now() - startTime;
        
        // Update instance health
        instance.health.lastCheck = new Date();
        instance.health.averageResponseTime = 
          (instance.health.averageResponseTime * 0.8) + (responseTime * 0.2);

        if (isHealthy) {
          instance.health.consecutiveFailures = 0;
          
          if (instance.status !== 'healthy') {
            instance.status = 'healthy';
            logger.info('✅ Service instance became healthy', {
              component: 'ServiceDiscovery',
              instanceId: instance.id,
              serviceName: instance.name
            });
            
            this.emit('serviceHealthy', { instance });
          }
        } else {
          instance.health.consecutiveFailures++;
          
          if (instance.health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
            if (instance.status === 'healthy') {
              instance.status = 'unhealthy';
              logger.warn('❌ Service instance became unhealthy', {
                component: 'ServiceDiscovery',
                instanceId: instance.id,
                serviceName: instance.name,
                consecutiveFailures: instance.health.consecutiveFailures
              });
              
              this.emit('serviceUnhealthy', { instance });
            }
          }
        }

      } catch (error) {
        instance.health.consecutiveFailures++;
        instance.health.lastCheck = new Date();
        
        if (instance.health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          if (instance.status === 'healthy') {
            instance.status = 'unhealthy';
            logger.warn('❌ Service instance health check failed', {
              component: 'ServiceDiscovery',
              instanceId: instance.id,
              serviceName: instance.name,
              error: error instanceof Error ? error.message : String(error)
            });
            
            this.emit('serviceUnhealthy', { instance });
          }
        }
      }
    };

    // Start health checking
    const intervalId = setInterval(checkHealth, interval);
    this.healthCheckIntervals.set(instance.id, intervalId);
    
    // Perform initial health check
    checkHealth();
  }

  /**
   * Perform actual health check
   */
  private async performHealthCheck(url: string): Promise<boolean> {
    // Mock implementation - would use actual HTTP client
    try {
      // Simulate health check delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      
      // Mock success rate (95% healthy)
      return Math.random() > 0.05;
    } catch (error) {
      return false;
    }
  }

  /**
   * Select instance using load balancing algorithm
   */
  private selectInstance(instances: ServiceInstance[]): ServiceInstance {
    if (instances.length === 1) {
      return instances[0];
    }

    // Weighted round-robin based on response time (lower is better)
    const weights = instances.map(instance => {
      const responseTime = instance.health.averageResponseTime || 1000;
      return 1000 / Math.max(responseTime, 1); // Inverse weight
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const random = Math.random() * totalWeight;
    
    let weightSum = 0;
    for (let i = 0; i < instances.length; i++) {
      weightSum += weights[i];
      if (random <= weightSum) {
        return instances[i];
      }
    }

    // Fallback to first instance
    return instances[0];
  }

  /**
   * Start cleanup process for dead services
   */
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadServices();
    }, 60000); // Every minute

    logger.info('🧹 Service discovery cleanup process started', {
      component: 'ServiceDiscovery'
    });
  }

  /**
   * Clean up services that haven't sent heartbeat
   */
  private cleanupDeadServices(): void {
    const now = Date.now();
    let cleanedCount = 0;

    this.services.forEach((instances, serviceName) => {
      const activeInstances = instances.filter(instance => {
        const timeSinceHeartbeat = now - instance.lastHeartbeat.getTime();
        
        if (timeSinceHeartbeat > this.SERVICE_TIMEOUT) {
          logger.warn('🧹 Cleaning up dead service instance', {
            component: 'ServiceDiscovery',
            instanceId: instance.id,
            serviceName,
            timeSinceHeartbeat
          });
          
          // Stop health checking
          const healthCheckInterval = this.healthCheckIntervals.get(instance.id);
          if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            this.healthCheckIntervals.delete(instance.id);
          }
          
          cleanedCount++;
          this.emit('serviceCleanedUp', { instance });
          return false;
        }
        
        return true;
      });

      if (activeInstances.length !== instances.length) {
        this.services.set(serviceName, activeInstances);
        
        // Remove empty service entries
        if (activeInstances.length === 0) {
          this.services.delete(serviceName);
        }
      }
    });

    if (cleanedCount > 0) {
      logger.info('🧹 Service cleanup completed', {
        component: 'ServiceDiscovery',
        cleanedInstances: cleanedCount,
        remainingServices: this.services.size
      });
    }
  }

  /**
   * Shutdown service discovery
   */
  public shutdown(): void {
    // Clear all health check intervals
    this.healthCheckIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.healthCheckIntervals.clear();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all services
    this.services.clear();

    logger.info('🛑 Service discovery shutdown complete', {
      component: 'ServiceDiscovery'
    });

    this.emit('shutdown');
  }
}

export default ServiceDiscovery;

