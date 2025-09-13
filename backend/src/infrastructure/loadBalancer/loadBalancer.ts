import { logger } from '../../utils/logger';
import { CircuitBreaker } from '../../gateway/circuitBreaker';

export interface ServiceInstance {
  id: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  weight: number;
  healthy: boolean;
  lastHealthCheck: Date;
  responseTime: number;
  activeConnections: number;
  totalRequests: number;
  failedRequests: number;
  metadata?: Record<string, any>;
}

export interface LoadBalancerConfig {
  algorithm: 'round-robin' | 'weighted-round-robin' | 'least-connections' | 'response-time' | 'random';
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxRetries: number;
  circuitBreakerEnabled: boolean;
  stickySession?: boolean;
  sessionAffinityKey?: string;
}

export interface LoadBalancerStats {
  totalRequests: number;
  totalFailures: number;
  averageResponseTime: number;
  healthyInstances: number;
  totalInstances: number;
  requestDistribution: Record<string, number>;
  lastHealthCheck: Date;
}

export class LoadBalancer {
  private instances: Map<string, ServiceInstance> = new Map();
  private currentIndex: number = 0;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private stats: LoadBalancerStats;
  private healthCheckTimer?: NodeJS.Timeout;
  private sessionAffinityMap: Map<string, string> = new Map();

  constructor(
    private serviceName: string,
    private config: LoadBalancerConfig
  ) {
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      averageResponseTime: 0,
      healthyInstances: 0,
      totalInstances: 0,
      requestDistribution: {},
      lastHealthCheck: new Date()
    };

    this.startHealthChecks();
    logger.info('Load balancer initialized', {
      component: 'LoadBalancer',
      serviceName,
      algorithm: config.algorithm
    });
  }

  /**
   * Add a service instance to the load balancer
   */
  addInstance(instance: ServiceInstance): void {
    this.instances.set(instance.id, instance);
    
    if (this.config.circuitBreakerEnabled) {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 30000,
        monitoringPeriod: 60000
      });
      this.circuitBreakers.set(instance.id, circuitBreaker);
    }

    this.stats.requestDistribution[instance.id] = 0;
    this.updateStats();

    logger.info('Service instance added to load balancer', {
      component: 'LoadBalancer',
      serviceName: this.serviceName,
      instanceId: instance.id,
      endpoint: `${instance.protocol}://${instance.host}:${instance.port}`
    });
  }

  /**
   * Remove a service instance from the load balancer
   */
  removeInstance(instanceId: string): void {
    this.instances.delete(instanceId);
    this.circuitBreakers.delete(instanceId);
    delete this.stats.requestDistribution[instanceId];
    this.updateStats();

    logger.info('Service instance removed from load balancer', {
      component: 'LoadBalancer',
      serviceName: this.serviceName,
      instanceId
    });
  }

  /**
   * Get the next available instance based on the load balancing algorithm
   */
  getNextInstance(sessionKey?: string): ServiceInstance | null {
    const healthyInstances = this.getHealthyInstances();
    
    if (healthyInstances.length === 0) {
      logger.warn('No healthy instances available', {
        component: 'LoadBalancer',
        serviceName: this.serviceName
      });
      return null;
    }

    // Session affinity
    if (this.config.stickySession && sessionKey) {
      const affinityInstanceId = this.sessionAffinityMap.get(sessionKey);
      if (affinityInstanceId) {
        const instance = this.instances.get(affinityInstanceId);
        if (instance && instance.healthy) {
          return instance;
        } else {
          // Remove stale affinity mapping
          this.sessionAffinityMap.delete(sessionKey);
        }
      }
    }

    let selectedInstance: ServiceInstance;

    switch (this.config.algorithm) {
      case 'round-robin':
        selectedInstance = this.roundRobinSelect(healthyInstances);
        break;
      
      case 'weighted-round-robin':
        selectedInstance = this.weightedRoundRobinSelect(healthyInstances);
        break;
      
      case 'least-connections':
        selectedInstance = this.leastConnectionsSelect(healthyInstances);
        break;
      
      case 'response-time':
        selectedInstance = this.responseTimeSelect(healthyInstances);
        break;
      
      case 'random':
        selectedInstance = this.randomSelect(healthyInstances);
        break;
      
      default:
        selectedInstance = this.roundRobinSelect(healthyInstances);
    }

    // Set session affinity if enabled
    if (this.config.stickySession && sessionKey) {
      this.sessionAffinityMap.set(sessionKey, selectedInstance.id);
    }

    return selectedInstance;
  }

  /**
   * Record request metrics for an instance
   */
  recordRequest(instanceId: string, responseTime: number, success: boolean): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.totalRequests++;
    instance.responseTime = (instance.responseTime + responseTime) / 2; // Simple moving average

    if (success) {
      instance.activeConnections = Math.max(0, instance.activeConnections - 1);
    } else {
      instance.failedRequests++;
      this.stats.totalFailures++;
    }

    this.stats.totalRequests++;
    this.stats.requestDistribution[instanceId]++;
    this.updateAverageResponseTime(responseTime);

    // Update circuit breaker
    const circuitBreaker = this.circuitBreakers.get(instanceId);
    if (circuitBreaker) {
      if (success) {
        circuitBreaker.recordSuccess();
      } else {
        circuitBreaker.recordFailure();
      }
    }
  }

  /**
   * Check if an instance is available (considering circuit breaker)
   */
  isInstanceAvailable(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.healthy) return false;

    if (this.config.circuitBreakerEnabled) {
      const circuitBreaker = this.circuitBreakers.get(instanceId);
      return circuitBreaker ? circuitBreaker.canExecute() : false;
    }

    return true;
  }

  /**
   * Get healthy instances that are available
   */
  private getHealthyInstances(): ServiceInstance[] {
    return Array.from(this.instances.values()).filter(instance => 
      instance.healthy && this.isInstanceAvailable(instance.id)
    );
  }

  /**
   * Round robin selection
   */
  private roundRobinSelect(instances: ServiceInstance[]): ServiceInstance {
    const instance = instances[this.currentIndex % instances.length];
    this.currentIndex = (this.currentIndex + 1) % instances.length;
    return instance;
  }

  /**
   * Weighted round robin selection
   */
  private weightedRoundRobinSelect(instances: ServiceInstance[]): ServiceInstance {
    const totalWeight = instances.reduce((sum, instance) => sum + instance.weight, 0);
    let randomWeight = Math.random() * totalWeight;
    
    for (const instance of instances) {
      randomWeight -= instance.weight;
      if (randomWeight <= 0) {
        return instance;
      }
    }
    
    return instances[0]; // Fallback
  }

  /**
   * Least connections selection
   */
  private leastConnectionsSelect(instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((prev, current) => 
      current.activeConnections < prev.activeConnections ? current : prev
    );
  }

  /**
   * Response time based selection
   */
  private responseTimeSelect(instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((prev, current) => 
      current.responseTime < prev.responseTime ? current : prev
    );
  }

  /**
   * Random selection
   */
  private randomSelect(instances: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  /**
   * Start health checks for all instances
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health checks on all instances
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.instances.values()).map(instance =>
      this.checkInstanceHealth(instance)
    );

    await Promise.allSettled(healthCheckPromises);
    this.stats.lastHealthCheck = new Date();
    this.updateStats();

    logger.debug('Health checks completed', {
      component: 'LoadBalancer',
      serviceName: this.serviceName,
      healthyInstances: this.stats.healthyInstances,
      totalInstances: this.stats.totalInstances
    });
  }

  /**
   * Check health of a single instance
   */
  private async checkInstanceHealth(instance: ServiceInstance): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Use Node.js built-in http module for health check
      const http = require(instance.protocol === 'https' ? 'https' : 'http');
      const url = `${instance.protocol}://${instance.host}:${instance.port}/health`;
      
      await new Promise<void>((resolve, reject) => {
        const request = http.get(url, {
          timeout: this.config.healthCheckTimeout
        }, (response: any) => {
          if (response.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Health check failed with status ${response.statusCode}`));
          }
        });

        request.on('error', reject);
        request.on('timeout', () => {
          request.destroy();
          reject(new Error('Health check timeout'));
        });
      });

      instance.healthy = true;
      instance.responseTime = Date.now() - startTime;
      instance.lastHealthCheck = new Date();

    } catch (error) {
      instance.healthy = false;
      instance.lastHealthCheck = new Date();
      
      logger.warn('Health check failed for instance', {
        component: 'LoadBalancer',
        serviceName: this.serviceName,
        instanceId: instance.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Update load balancer statistics
   */
  private updateStats(): void {
    const instances = Array.from(this.instances.values());
    this.stats.healthyInstances = instances.filter(i => i.healthy).length;
    this.stats.totalInstances = instances.length;
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(responseTime: number): void {
    if (this.stats.totalRequests === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime) / 
        this.stats.totalRequests;
    }
  }

  /**
   * Get load balancer statistics
   */
  getStats(): LoadBalancerStats {
    return { ...this.stats };
  }

  /**
   * Get all instances with their current status
   */
  getInstances(): ServiceInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Update instance configuration
   */
  updateInstance(instanceId: string, updates: Partial<ServiceInstance>): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    Object.assign(instance, updates);
    
    logger.info('Instance updated', {
      component: 'LoadBalancer',
      serviceName: this.serviceName,
      instanceId,
      updates
    });

    return true;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      averageResponseTime: 0,
      healthyInstances: this.stats.healthyInstances,
      totalInstances: this.stats.totalInstances,
      requestDistribution: {},
      lastHealthCheck: new Date()
    };

    // Reset instance stats
    this.instances.forEach((instance, id) => {
      instance.totalRequests = 0;
      instance.failedRequests = 0;
      instance.activeConnections = 0;
      this.stats.requestDistribution[id] = 0;
    });

    logger.info('Load balancer statistics reset', {
      component: 'LoadBalancer',
      serviceName: this.serviceName
    });
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    logger.info('Load balancer shutdown', {
      component: 'LoadBalancer',
      serviceName: this.serviceName
    });
  }
}

export default LoadBalancer;

