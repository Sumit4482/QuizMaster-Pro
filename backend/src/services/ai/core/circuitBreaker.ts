/**
 * AI Circuit Breaker
 * Prevents cascade failures when AI services are down or unreliable
 */

import { logger } from '@/config/logger';
import { IAiCircuitBreaker } from '@/types/ai';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  resetTimeout: number; // Time to wait before attempting reset (ms)
  monitoringWindow: number; // Time window for failure counting (ms)
  volumeThreshold: number; // Minimum requests needed before circuit can open
  errorThreshold: number; // Error rate threshold (0-1)
  halfOpenMaxRequests: number; // Max requests to allow in half-open state
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  requestCount: number;
  errorRate: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  lastStateChange: Date;
  totalRequests: number;
  totalFailures: number;
}

/**
 * Circuit Breaker for AI Services
 * Implements the circuit breaker pattern to prevent cascade failures
 */
export class AiCircuitBreaker implements IAiCircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private requestCount = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private lastStateChange = new Date();
  private halfOpenRequests = 0;
  
  // Sliding window for tracking recent requests
  private requestHistory: Array<{ timestamp: Date; success: boolean }> = [];
  
  // Total lifetime stats
  private totalRequests = 0;
  private totalFailures = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      resetTimeout: config.resetTimeout || 60000, // 1 minute
      monitoringWindow: config.monitoringWindow || 300000, // 5 minutes
      volumeThreshold: config.volumeThreshold || 10,
      errorThreshold: config.errorThreshold || 0.5, // 50%
      halfOpenMaxRequests: config.halfOpenMaxRequests || 3,
      ...config
    };

    logger.debug('Circuit breaker initialized', {
      component: 'AiCircuitBreaker',
      config: this.config
    });
  }

  /**
   * Check if circuit breaker is open
   */
  public isOpen(): boolean {
    this.updateState();
    return this.state === 'open';
  }

  /**
   * Execute function with circuit breaker protection
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error(`Circuit breaker is OPEN - service unavailable`);
    }

    if (this.state === 'half-open' && this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
      throw new Error(`Circuit breaker half-open limit reached`);
    }

    if (this.state === 'half-open') {
      this.halfOpenRequests++;
    }

    this.requestCount++;
    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Record successful operation
   */
  public onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = new Date();
    
    this.addToHistory(true);

    if (this.state === 'half-open') {
      // If we're half-open and getting successes, consider closing
      if (this.halfOpenRequests >= this.config.halfOpenMaxRequests || 
          this.successCount >= Math.ceil(this.config.halfOpenMaxRequests / 2)) {
        this.closeCircuit();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }

    logger.debug('Circuit breaker recorded success', {
      component: 'AiCircuitBreaker',
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount
    });
  }

  /**
   * Record failed operation
   */
  public onFailure(error: Error): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = new Date();
    
    this.addToHistory(false);

    logger.debug('Circuit breaker recorded failure', {
      component: 'AiCircuitBreaker',
      state: this.state,
      failureCount: this.failureCount,
      error: error.message
    });

    // Check if we should open the circuit
    if (this.shouldOpenCircuit()) {
      this.openCircuit();
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  public reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.halfOpenRequests = 0;
    this.lastStateChange = new Date();
    this.requestHistory = [];

    logger.info('Circuit breaker reset to CLOSED state', {
      component: 'AiCircuitBreaker'
    });
  }

  /**
   * Get current circuit breaker state
   */
  public getState(): CircuitBreakerState {
    this.updateState();
    return this.state;
  }

  /**
   * Get detailed circuit breaker statistics
   */
  public getStats(): CircuitBreakerStats {
    this.updateState();
    const errorRate = this.requestCount > 0 ? this.failureCount / this.requestCount : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      errorRate,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures
    };
  }

  /**
   * Update circuit breaker state based on current conditions
   */
  private updateState(): void {
    const now = new Date();

    // Clean old entries from history
    this.cleanHistory();

    if (this.state === 'open') {
      // Check if we should transition to half-open
      const timeSinceStateChange = now.getTime() - this.lastStateChange.getTime();
      if (timeSinceStateChange >= this.config.resetTimeout) {
        this.halfOpenCircuit();
      }
    }
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpenCircuit(): boolean {
    // Need minimum volume of requests
    if (this.requestCount < this.config.volumeThreshold) {
      return false;
    }

    // Check failure threshold
    if (this.failureCount >= this.config.failureThreshold) {
      return true;
    }

    // Check error rate threshold
    const errorRate = this.failureCount / this.requestCount;
    if (errorRate >= this.config.errorThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    if (this.state !== 'open') {
      this.state = 'open';
      this.lastStateChange = new Date();
      this.halfOpenRequests = 0;

      logger.warn('Circuit breaker OPENED - service calls will be blocked', {
        component: 'AiCircuitBreaker',
        failureCount: this.failureCount,
        requestCount: this.requestCount,
        errorRate: this.failureCount / this.requestCount
      });
    }
  }

  /**
   * Transition to half-open state
   */
  private halfOpenCircuit(): void {
    this.state = 'half-open';
    this.lastStateChange = new Date();
    this.halfOpenRequests = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.requestCount = 0;

    logger.info('Circuit breaker transitioned to HALF-OPEN - allowing test requests', {
      component: 'AiCircuitBreaker'
    });
  }

  /**
   * Close the circuit breaker
   */
  private closeCircuit(): void {
    this.state = 'closed';
    this.lastStateChange = new Date();
    this.halfOpenRequests = 0;
    this.failureCount = 0;

    logger.info('Circuit breaker CLOSED - service calls resumed', {
      component: 'AiCircuitBreaker',
      successCount: this.successCount
    });
  }

  /**
   * Add request to history for sliding window tracking
   */
  private addToHistory(success: boolean): void {
    const now = new Date();
    this.requestHistory.push({ timestamp: now, success });

    // Keep history manageable
    if (this.requestHistory.length > 1000) {
      this.requestHistory = this.requestHistory.slice(-500);
    }
  }

  /**
   * Clean old entries from request history
   */
  private cleanHistory(): void {
    const cutoff = new Date(Date.now() - this.config.monitoringWindow);
    this.requestHistory = this.requestHistory.filter(
      entry => entry.timestamp > cutoff
    );

    // Recalculate counts based on recent history
    const recentRequests = this.requestHistory;
    this.requestCount = recentRequests.length;
    this.successCount = recentRequests.filter(r => r.success).length;
    this.failureCount = recentRequests.filter(r => !r.success).length;
  }

  /**
   * Force state change (for testing or manual intervention)
   */
  public forceState(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === 'closed') {
      this.failureCount = 0;
      this.halfOpenRequests = 0;
    } else if (newState === 'half-open') {
      this.halfOpenRequests = 0;
      this.successCount = 0;
    }

    logger.warn(`Circuit breaker state forced from ${oldState} to ${newState}`, {
      component: 'AiCircuitBreaker'
    });
  }

  /**
   * Get health status based on circuit breaker state
   */
  public getHealthStatus(): {
    healthy: boolean;
    state: CircuitBreakerState;
    errorRate: number;
    availability: number;
  } {
    this.updateState();
    
    const errorRate = this.requestCount > 0 ? this.failureCount / this.requestCount : 0;
    const availability = this.totalRequests > 0 
      ? (this.totalRequests - this.totalFailures) / this.totalRequests 
      : 1;

    return {
      healthy: this.state === 'closed',
      state: this.state,
      errorRate,
      availability
    };
  }
}

export default AiCircuitBreaker;
