import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface CircuitBreakerConfig {
  timeout: number;
  errorThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  volumeThreshold: number;
}

export interface CircuitBreakerState {
  serviceName: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  requests: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  nextAttempt: Date | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  averageResponseTime: number;
  errorRate: number;
  circuitBreakerTrips: number;
}

/**
 * Phase 4.2: Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures in microservices with:
 * - Automatic failure detection
 * - Circuit state management (Closed, Open, Half-Open)
 * - Configurable thresholds and timeouts
 * - Recovery mechanism
 * - Metrics and monitoring
 */
export class CircuitBreaker extends EventEmitter {
  private static instance: CircuitBreaker | null = null;
  
  private circuits: Map<string, CircuitBreakerState> = new Map();
  private configs: Map<string, CircuitBreakerConfig> = new Map();
  private metrics: Map<string, CircuitBreakerMetrics> = new Map();
  private responseTimes: Map<string, number[]> = new Map();
  
  private readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    timeout: 5000,        // 5 seconds
    errorThreshold: 50,   // 50% error rate
    resetTimeout: 60000,  // 1 minute
    monitoringPeriod: 10000, // 10 seconds
    volumeThreshold: 10   // minimum 10 requests before evaluation
  };

  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.startMonitoring();
  }

  public static getInstance(): CircuitBreaker {
    if (!CircuitBreaker.instance) {
      CircuitBreaker.instance = new CircuitBreaker();
    }
    return CircuitBreaker.instance;
  }

  /**
   * Register a service with circuit breaker
   */
  public registerService(serviceName: string, config?: Partial<CircuitBreakerConfig>): void {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    
    this.configs.set(serviceName, finalConfig);
    
    if (!this.circuits.has(serviceName)) {
      this.circuits.set(serviceName, {
        serviceName,
        state: 'CLOSED',
        failures: 0,
        successes: 0,
        requests: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        nextAttempt: null,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0
      });
    }

    if (!this.metrics.has(serviceName)) {
      this.metrics.set(serviceName, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rejectedRequests: 0,
        averageResponseTime: 0,
        errorRate: 0,
        circuitBreakerTrips: 0
      });
    }

    if (!this.responseTimes.has(serviceName)) {
      this.responseTimes.set(serviceName, []);
    }

    logger.info('⚡ Circuit breaker registered for service', {
      component: 'CircuitBreaker',
      serviceName,
      config: finalConfig
    });
  }

  /**
   * Check if request should be allowed through
   */
  public shouldBreak(serviceName: string): boolean {
    if (!this.circuits.has(serviceName)) {
      this.registerService(serviceName);
    }

    const circuit = this.circuits.get(serviceName)!;
    const config = this.configs.get(serviceName)!;
    const now = new Date();

    switch (circuit.state) {
      case 'CLOSED':
        return false; // Allow all requests

      case 'OPEN':
        if (circuit.nextAttempt && now >= circuit.nextAttempt) {
          // Time to try again - move to half-open
          this.transitionToHalfOpen(serviceName);
          return false;
        }
        return true; // Block all requests

      case 'HALF_OPEN':
        return false; // Allow limited requests to test service

      default:
        return false;
    }
  }

  /**
   * Record successful request
   */
  public recordSuccess(serviceName: string, responseTime: number): void {
    if (!this.circuits.has(serviceName)) {
      this.registerService(serviceName);
    }

    const circuit = this.circuits.get(serviceName)!;
    const metrics = this.metrics.get(serviceName)!;

    // Update circuit state
    circuit.requests++;
    circuit.successes++;
    circuit.consecutiveSuccesses++;
    circuit.consecutiveFailures = 0;
    circuit.lastSuccessTime = new Date();

    // Update metrics
    metrics.totalRequests++;
    metrics.successfulRequests++;
    this.updateAverageResponseTime(serviceName, responseTime);

    // State transitions
    if (circuit.state === 'HALF_OPEN') {
      // If we get enough consecutive successes in half-open, close the circuit
      const config = this.configs.get(serviceName)!;
      if (circuit.consecutiveSuccesses >= Math.ceil(config.volumeThreshold / 2)) {
        this.transitionToClosed(serviceName);
      }
    }

    logger.debug('✅ Circuit breaker recorded success', {
      component: 'CircuitBreaker',
      serviceName,
      state: circuit.state,
      responseTime,
      consecutiveSuccesses: circuit.consecutiveSuccesses
    });
  }

  /**
   * Record failed request
   */
  public recordFailure(serviceName: string, error?: Error): void {
    if (!this.circuits.has(serviceName)) {
      this.registerService(serviceName);
    }

    const circuit = this.circuits.get(serviceName)!;
    const metrics = this.metrics.get(serviceName)!;
    const config = this.configs.get(serviceName)!;

    // Update circuit state
    circuit.requests++;
    circuit.failures++;
    circuit.consecutiveFailures++;
    circuit.consecutiveSuccesses = 0;
    circuit.lastFailureTime = new Date();

    // Update metrics
    metrics.totalRequests++;
    metrics.failedRequests++;

    // Check if we should trip the circuit
    if (circuit.state === 'CLOSED' || circuit.state === 'HALF_OPEN') {
      const errorRate = (circuit.failures / circuit.requests) * 100;
      
      if (circuit.requests >= config.volumeThreshold && errorRate >= config.errorThreshold) {
        this.transitionToOpen(serviceName);
      } else if (circuit.state === 'HALF_OPEN') {
        // Any failure in half-open should immediately open the circuit
        this.transitionToOpen(serviceName);
      }
    }

    logger.warn('❌ Circuit breaker recorded failure', {
      component: 'CircuitBreaker',
      serviceName,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      errorRate: (circuit.failures / circuit.requests) * 100,
      error: error?.message
    });
  }

  /**
   * Record rejected request (circuit open)
   */
  public recordRejection(serviceName: string): void {
    if (!this.metrics.has(serviceName)) {
      this.registerService(serviceName);
    }

    const metrics = this.metrics.get(serviceName)!;
    metrics.rejectedRequests++;

    logger.debug('🚫 Circuit breaker rejected request', {
      component: 'CircuitBreaker',
      serviceName,
      totalRejections: metrics.rejectedRequests
    });
  }

  /**
   * Get circuit state for a service
   */
  public getCircuitState(serviceName: string): CircuitBreakerState | null {
    return this.circuits.get(serviceName) || null;
  }

  /**
   * Get metrics for a service
   */
  public getMetrics(serviceName: string): CircuitBreakerMetrics | null {
    const metrics = this.metrics.get(serviceName);
    if (!metrics) return null;

    // Calculate current error rate
    metrics.errorRate = metrics.totalRequests > 0 ? 
      (metrics.failedRequests / metrics.totalRequests) * 100 : 0;

    return { ...metrics };
  }

  /**
   * Get all circuit states
   */
  public getAllCircuitStates(): { [serviceName: string]: CircuitBreakerState } {
    const result: { [serviceName: string]: CircuitBreakerState } = {};
    
    this.circuits.forEach((state, serviceName) => {
      result[serviceName] = { ...state };
    });
    
    return result;
  }

  /**
   * Get comprehensive metrics for all services
   */
  public getAllMetrics(): { [serviceName: string]: CircuitBreakerMetrics } {
    const result: { [serviceName: string]: CircuitBreakerMetrics } = {};
    
    this.metrics.forEach((metrics, serviceName) => {
      metrics.errorRate = metrics.totalRequests > 0 ? 
        (metrics.failedRequests / metrics.totalRequests) * 100 : 0;
      result[serviceName] = { ...metrics };
    });
    
    return result;
  }

  /**
   * Reset circuit breaker for a service
   */
  public resetCircuit(serviceName: string): boolean {
    if (!this.circuits.has(serviceName)) {
      return false;
    }

    const circuit = this.circuits.get(serviceName)!;
    
    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.successes = 0;
    circuit.requests = 0;
    circuit.consecutiveFailures = 0;
    circuit.consecutiveSuccesses = 0;
    circuit.nextAttempt = null;

    logger.info('🔄 Circuit breaker reset', {
      component: 'CircuitBreaker',
      serviceName
    });

    this.emit('circuitReset', { serviceName, circuit });
    return true;
  }

  /**
   * Manually open circuit for a service
   */
  public openCircuit(serviceName: string): boolean {
    if (!this.circuits.has(serviceName)) {
      return false;
    }

    this.transitionToOpen(serviceName);
    return true;
  }

  /**
   * Manually close circuit for a service
   */
  public closeCircuit(serviceName: string): boolean {
    if (!this.circuits.has(serviceName)) {
      return false;
    }

    this.transitionToClosed(serviceName);
    return true;
  }

  /**
   * Transition circuit to OPEN state
   */
  private transitionToOpen(serviceName: string): void {
    const circuit = this.circuits.get(serviceName)!;
    const config = this.configs.get(serviceName)!;
    const metrics = this.metrics.get(serviceName)!;

    circuit.state = 'OPEN';
    circuit.nextAttempt = new Date(Date.now() + config.resetTimeout);
    
    metrics.circuitBreakerTrips++;

    logger.warn('🔴 Circuit breaker OPENED', {
      component: 'CircuitBreaker',
      serviceName,
      failures: circuit.failures,
      requests: circuit.requests,
      errorRate: (circuit.failures / circuit.requests) * 100,
      nextAttempt: circuit.nextAttempt
    });

    this.emit('circuitOpened', { serviceName, circuit });
  }

  /**
   * Transition circuit to HALF_OPEN state
   */
  private transitionToHalfOpen(serviceName: string): void {
    const circuit = this.circuits.get(serviceName)!;

    circuit.state = 'HALF_OPEN';
    circuit.consecutiveSuccesses = 0;
    circuit.consecutiveFailures = 0;
    circuit.nextAttempt = null;

    logger.info('🟡 Circuit breaker HALF-OPEN', {
      component: 'CircuitBreaker',
      serviceName
    });

    this.emit('circuitHalfOpened', { serviceName, circuit });
  }

  /**
   * Transition circuit to CLOSED state
   */
  private transitionToClosed(serviceName: string): void {
    const circuit = this.circuits.get(serviceName)!;

    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.requests = 0;
    circuit.consecutiveFailures = 0;
    circuit.nextAttempt = null;

    logger.info('🟢 Circuit breaker CLOSED', {
      component: 'CircuitBreaker',
      serviceName,
      consecutiveSuccesses: circuit.consecutiveSuccesses
    });

    this.emit('circuitClosed', { serviceName, circuit });
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(serviceName: string, responseTime: number): void {
    const responseTimes = this.responseTimes.get(serviceName)!;
    const metrics = this.metrics.get(serviceName)!;

    responseTimes.push(responseTime);
    
    // Keep only last 100 response times
    if (responseTimes.length > 100) {
      responseTimes.shift();
    }

    // Calculate average
    metrics.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }

  /**
   * Start monitoring and cleanup
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.performMonitoring();
    }, 30000); // Every 30 seconds

    logger.info('📊 Circuit breaker monitoring started', {
      component: 'CircuitBreaker'
    });
  }

  /**
   * Perform periodic monitoring and cleanup
   */
  private performMonitoring(): void {
    const now = Date.now();
    
    this.circuits.forEach((circuit, serviceName) => {
      const config = this.configs.get(serviceName)!;
      
      // Reset counters periodically to prevent stale data
      const timeSinceLastActivity = Math.min(
        circuit.lastFailureTime ? now - circuit.lastFailureTime.getTime() : Infinity,
        circuit.lastSuccessTime ? now - circuit.lastSuccessTime.getTime() : Infinity
      );

      if (timeSinceLastActivity > config.monitoringPeriod * 3) {
        // Reset counters if no activity for 3 monitoring periods
        circuit.failures = 0;
        circuit.successes = 0;
        circuit.requests = 0;
        
        logger.debug('🧹 Circuit breaker counters reset due to inactivity', {
          component: 'CircuitBreaker',
          serviceName,
          timeSinceLastActivity
        });
      }
    });

    // Emit monitoring event
    this.emit('monitoring', {
      timestamp: new Date(),
      circuits: this.getAllCircuitStates(),
      metrics: this.getAllMetrics()
    });
  }

  /**
   * Shutdown circuit breaker
   */
  public shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.circuits.clear();
    this.configs.clear();
    this.metrics.clear();
    this.responseTimes.clear();

    logger.info('🛑 Circuit breaker shutdown complete', {
      component: 'CircuitBreaker'
    });

    this.emit('shutdown');
  }
}

export default CircuitBreaker;

