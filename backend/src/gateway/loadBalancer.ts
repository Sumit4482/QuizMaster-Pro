import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { ServiceInstance } from './serviceDiscovery';

export type LoadBalancingStrategy = 
  | 'round_robin' 
  | 'weighted_round_robin'
  | 'least_connections' 
  | 'least_response_time'
  | 'random'
  | 'hash'
  | 'health_aware';

export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  healthCheckWeight: number;
  responseTimeWeight: number;
  connectionWeight: number;
  failureThreshold: number;
  recoveryThreshold: number;
}

export interface LoadBalancerStats {
  serviceName: string;
  strategy: LoadBalancingStrategy;
  totalRequests: number;
  instanceStats: { [instanceId: string]: InstanceStats };
  lastUpdated: Date;
}

export interface InstanceStats {
  instanceId: string;
  requests: number;
  activeConnections: number;
  averageResponseTime: number;
  successRate: number;
  lastUsed: Date;
  weight: number;
  isHealthy: boolean;
}

/**
 * Phase 4.2: Load Balancer Implementation
 * 
 * Intelligent traffic distribution across service instances with:
 * - Multiple load balancing algorithms
 * - Health-aware routing
 * - Performance-based weighting
 * - Connection tracking
 * - Automatic failover
 */
export class LoadBalancer extends EventEmitter {
  private static instance: LoadBalancer | null = null;
  
  private configs: Map<string, LoadBalancerConfig> = new Map();
  private stats: Map<string, LoadBalancerStats> = new Map();
  private instanceStats: Map<string, InstanceStats> = new Map();
  private roundRobinCounters: Map<string, number> = new Map();
  
  private readonly DEFAULT_CONFIG: LoadBalancerConfig = {
    strategy: 'health_aware',
    healthCheckWeight: 0.4,
    responseTimeWeight: 0.3,
    connectionWeight: 0.2,
    failureThreshold: 0.1,
    recoveryThreshold: 0.9
  };

  private constructor() {
    super();
  }

  public static getInstance(): LoadBalancer {
    if (!LoadBalancer.instance) {
      LoadBalancer.instance = new LoadBalancer();
    }
    return LoadBalancer.instance;
  }

  /**
   * Configure load balancing for a service
   */
  public configureService(
    serviceName: string, 
    config?: Partial<LoadBalancerConfig>
  ): void {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    this.configs.set(serviceName, finalConfig);
    
    if (!this.stats.has(serviceName)) {
      this.stats.set(serviceName, {
        serviceName,
        strategy: finalConfig.strategy,
        totalRequests: 0,
        instanceStats: {},
        lastUpdated: new Date()
      });
    }

    if (!this.roundRobinCounters.has(serviceName)) {
      this.roundRobinCounters.set(serviceName, 0);
    }

    logger.info('⚖️ Load balancer configured for service', {
      component: 'LoadBalancer',
      serviceName,
      strategy: finalConfig.strategy
    });
  }

  /**
   * Select best instance for a request
   */
  public selectInstance(
    serviceName: string, 
    instances: ServiceInstance[],
    requestContext?: any
  ): ServiceInstance {
    if (instances.length === 0) {
      throw new Error(`No instances available for service: ${serviceName}`);
    }

    if (instances.length === 1) {
      const selectedInstance = instances[0];
      this.recordInstanceSelection(serviceName, selectedInstance);
      return selectedInstance;
    }

    // Ensure service is configured
    if (!this.configs.has(serviceName)) {
      this.configureService(serviceName);
    }

    const config = this.configs.get(serviceName)!;
    
    // Filter healthy instances if using health-aware strategies
    const healthyInstances = this.getHealthyInstances(instances);
    const workingInstances = healthyInstances.length > 0 ? healthyInstances : instances;

    let selectedInstance: ServiceInstance;

    switch (config.strategy) {
      case 'round_robin':
        selectedInstance = this.selectRoundRobin(serviceName, workingInstances);
        break;
        
      case 'weighted_round_robin':
        selectedInstance = this.selectWeightedRoundRobin(serviceName, workingInstances);
        break;
        
      case 'least_connections':
        selectedInstance = this.selectLeastConnections(serviceName, workingInstances);
        break;
        
      case 'least_response_time':
        selectedInstance = this.selectLeastResponseTime(serviceName, workingInstances);
        break;
        
      case 'random':
        selectedInstance = this.selectRandom(workingInstances);
        break;
        
      case 'hash':
        selectedInstance = this.selectHash(workingInstances, requestContext);
        break;
        
      case 'health_aware':
        selectedInstance = this.selectHealthAware(serviceName, workingInstances);
        break;
        
      default:
        selectedInstance = this.selectRoundRobin(serviceName, workingInstances);
    }

    this.recordInstanceSelection(serviceName, selectedInstance);
    
    logger.debug('⚖️ Instance selected by load balancer', {
      component: 'LoadBalancer',
      serviceName,
      instanceId: selectedInstance.id,
      strategy: config.strategy,
      totalInstances: instances.length,
      healthyInstances: healthyInstances.length
    });

    return selectedInstance;
  }

  /**
   * Record request completion for load balancing metrics
   */
  public recordRequest(
    serviceName: string,
    instanceId: string,
    responseTime: number,
    success: boolean
  ): void {
    // Update service stats
    const serviceStats = this.stats.get(serviceName);
    if (serviceStats) {
      serviceStats.totalRequests++;
      serviceStats.lastUpdated = new Date();
    }

    // Update instance stats
    const instanceKey = `${serviceName}-${instanceId}`;
    let instanceStats = this.instanceStats.get(instanceKey);

    if (!instanceStats) {
      instanceStats = {
        instanceId,
        requests: 0,
        activeConnections: 0,
        averageResponseTime: 0,
        successRate: 1.0,
        lastUsed: new Date(),
        weight: 1.0,
        isHealthy: true
      };
      this.instanceStats.set(instanceKey, instanceStats);
    }

    // Update metrics
    instanceStats.requests++;
    instanceStats.lastUsed = new Date();
    
    // Update average response time (exponential moving average)
    instanceStats.averageResponseTime = 
      (instanceStats.averageResponseTime * 0.8) + (responseTime * 0.2);

    // Update success rate (exponential moving average)
    const successValue = success ? 1 : 0;
    instanceStats.successRate = (instanceStats.successRate * 0.9) + (successValue * 0.1);

    // Update health status based on success rate
    const config = this.configs.get(serviceName) || this.DEFAULT_CONFIG;
    if (instanceStats.successRate < config.failureThreshold) {
      instanceStats.isHealthy = false;
    } else if (instanceStats.successRate > config.recoveryThreshold) {
      instanceStats.isHealthy = true;
    }

    // Recalculate weight for weighted algorithms
    this.updateInstanceWeight(serviceName, instanceStats);

    logger.debug('📊 Load balancer recorded request', {
      component: 'LoadBalancer',
      serviceName,
      instanceId,
      responseTime,
      success,
      successRate: instanceStats.successRate.toFixed(3)
    });
  }

  /**
   * Record active connection change
   */
  public recordConnectionChange(
    serviceName: string,
    instanceId: string,
    delta: number
  ): void {
    const instanceKey = `${serviceName}-${instanceId}`;
    const instanceStats = this.instanceStats.get(instanceKey);

    if (instanceStats) {
      instanceStats.activeConnections = Math.max(0, instanceStats.activeConnections + delta);
      
      logger.debug('🔗 Connection count updated', {
        component: 'LoadBalancer',
        serviceName,
        instanceId,
        activeConnections: instanceStats.activeConnections,
        delta
      });
    }
  }

  /**
   * Get load balancer statistics
   */
  public getStats(serviceName?: string): LoadBalancerStats | { [serviceName: string]: LoadBalancerStats } {
    if (serviceName) {
      const stats = this.stats.get(serviceName);
      if (!stats) {
        throw new Error(`Service not found: ${serviceName}`);
      }

      // Update instance stats in service stats
      stats.instanceStats = {};
      this.instanceStats.forEach((instanceStats, key) => {
        if (key.startsWith(`${serviceName}-`)) {
          stats.instanceStats[instanceStats.instanceId] = { ...instanceStats };
        }
      });

      return { ...stats };
    }

    // Return all services
    const allStats: { [serviceName: string]: LoadBalancerStats } = {};
    this.stats.forEach((stats, name) => {
      // Update instance stats
      stats.instanceStats = {};
      this.instanceStats.forEach((instanceStats, key) => {
        if (key.startsWith(`${name}-`)) {
          stats.instanceStats[instanceStats.instanceId] = { ...instanceStats };
        }
      });
      allStats[name] = { ...stats };
    });

    return allStats;
  }

  /**
   * Update load balancing strategy for a service
   */
  public updateStrategy(serviceName: string, strategy: LoadBalancingStrategy): void {
    const config = this.configs.get(serviceName);
    if (!config) {
      throw new Error(`Service not configured: ${serviceName}`);
    }

    config.strategy = strategy;
    
    const stats = this.stats.get(serviceName);
    if (stats) {
      stats.strategy = strategy;
    }

    logger.info('⚖️ Load balancing strategy updated', {
      component: 'LoadBalancer',
      serviceName,
      newStrategy: strategy
    });

    this.emit('strategyUpdated', { serviceName, strategy });
  }

  /**
   * Get healthy instances only
   */
  private getHealthyInstances(instances: ServiceInstance[]): ServiceInstance[] {
    return instances.filter(instance => instance.status === 'healthy');
  }

  /**
   * Round robin selection
   */
  private selectRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selectedIndex = counter % instances.length;
    
    this.roundRobinCounters.set(serviceName, counter + 1);
    
    return instances[selectedIndex];
  }

  /**
   * Weighted round robin selection
   */
  private selectWeightedRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const weights: number[] = instances.map(instance => {
      const instanceKey = `${serviceName}-${instance.id}`;
      const stats = this.instanceStats.get(instanceKey);
      return stats?.weight || 1.0;
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

    // Fallback to last instance
    return instances[instances.length - 1];
  }

  /**
   * Least connections selection
   */
  private selectLeastConnections(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    let selectedInstance = instances[0];
    let minConnections = Infinity;

    instances.forEach(instance => {
      const instanceKey = `${serviceName}-${instance.id}`;
      const stats = this.instanceStats.get(instanceKey);
      const connections = stats?.activeConnections || 0;

      if (connections < minConnections) {
        minConnections = connections;
        selectedInstance = instance;
      }
    });

    return selectedInstance;
  }

  /**
   * Least response time selection
   */
  private selectLeastResponseTime(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    let selectedInstance = instances[0];
    let minResponseTime = Infinity;

    instances.forEach(instance => {
      const instanceKey = `${serviceName}-${instance.id}`;
      const stats = this.instanceStats.get(instanceKey);
      const responseTime = stats?.averageResponseTime || 1000;

      if (responseTime < minResponseTime) {
        minResponseTime = responseTime;
        selectedInstance = instance;
      }
    });

    return selectedInstance;
  }

  /**
   * Random selection
   */
  private selectRandom(instances: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  /**
   * Hash-based selection (for session affinity)
   */
  private selectHash(instances: ServiceInstance[], requestContext?: any): ServiceInstance {
    let hashInput = '';
    
    if (requestContext?.userId) {
      hashInput = requestContext.userId;
    } else if (requestContext?.sessionId) {
      hashInput = requestContext.sessionId;
    } else if (requestContext?.ip) {
      hashInput = requestContext.ip;
    } else {
      // Fallback to random if no hash input
      return this.selectRandom(instances);
    }

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    const index = Math.abs(hash) % instances.length;
    return instances[index];
  }

  /**
   * Health-aware selection (composite algorithm)
   */
  private selectHealthAware(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const config = this.configs.get(serviceName)!;
    
    // Calculate composite scores for each instance
    const scores = instances.map(instance => {
      const instanceKey = `${serviceName}-${instance.id}`;
      const stats = this.instanceStats.get(instanceKey);

      let score = 0;

      // Health component (higher is better)
      const healthScore = instance.status === 'healthy' ? 1.0 : 0.1;
      score += healthScore * config.healthCheckWeight;

      // Response time component (lower is better, so invert)
      const responseTime = stats?.averageResponseTime || 1000;
      const responseTimeScore = Math.max(0, 1 - (responseTime / 5000)); // 5s max
      score += responseTimeScore * config.responseTimeWeight;

      // Connection load component (lower is better, so invert)
      const connections = stats?.activeConnections || 0;
      const connectionScore = Math.max(0, 1 - (connections / 100)); // 100 max connections
      score += connectionScore * config.connectionWeight;

      // Success rate component
      const successRate = stats?.successRate || 1.0;
      const successWeight = 1 - config.healthCheckWeight - config.responseTimeWeight - config.connectionWeight;
      score += successRate * successWeight;

      return { instance, score };
    });

    // Sort by score (highest first) and select the best
    scores.sort((a, b) => b.score - a.score);
    return scores[0].instance;
  }

  /**
   * Record instance selection
   */
  private recordInstanceSelection(serviceName: string, instance: ServiceInstance): void {
    const instanceKey = `${serviceName}-${instance.id}`;
    
    // Initialize instance stats if not exists
    if (!this.instanceStats.has(instanceKey)) {
      this.instanceStats.set(instanceKey, {
        instanceId: instance.id,
        requests: 0,
        activeConnections: 0,
        averageResponseTime: 0,
        successRate: 1.0,
        lastUsed: new Date(),
        weight: 1.0,
        isHealthy: instance.status === 'healthy'
      });
    }

    // Update last used time
    const stats = this.instanceStats.get(instanceKey)!;
    stats.lastUsed = new Date();
  }

  /**
   * Update instance weight for weighted algorithms
   */
  private updateInstanceWeight(serviceName: string, instanceStats: InstanceStats): void {
    const config = this.configs.get(serviceName) || this.DEFAULT_CONFIG;
    
    // Calculate weight based on performance metrics
    let weight = 1.0;

    // Factor in success rate
    weight *= instanceStats.successRate;

    // Factor in response time (lower is better)
    const normalizedResponseTime = Math.min(1, instanceStats.averageResponseTime / 2000); // 2s baseline
    weight *= (1 - normalizedResponseTime * 0.5);

    // Factor in connection load (lower is better)
    const normalizedConnections = Math.min(1, instanceStats.activeConnections / 50); // 50 connections baseline
    weight *= (1 - normalizedConnections * 0.3);

    // Ensure minimum weight
    instanceStats.weight = Math.max(0.1, weight);
  }

  /**
   * Cleanup unused instance statistics
   */
  public cleanup(): void {
    const now = Date.now();
    const maxAge = 1000 * 60 * 60; // 1 hour
    
    let cleanedCount = 0;
    
    this.instanceStats.forEach((stats, key) => {
      const timeSinceLastUsed = now - stats.lastUsed.getTime();
      
      if (timeSinceLastUsed > maxAge) {
        this.instanceStats.delete(key);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      logger.info('🧹 Load balancer cleanup completed', {
        component: 'LoadBalancer',
        cleanedInstances: cleanedCount,
        remainingInstances: this.instanceStats.size
      });
    }
  }

  /**
   * Shutdown load balancer
   */
  public shutdown(): void {
    this.configs.clear();
    this.stats.clear();
    this.instanceStats.clear();
    this.roundRobinCounters.clear();

    logger.info('🛑 Load balancer shutdown complete', {
      component: 'LoadBalancer'
    });

    this.emit('shutdown');
  }
}

export default LoadBalancer;

