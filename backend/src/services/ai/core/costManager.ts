/**
 * AI Cost Manager
 * Tracks AI usage costs, enforces budget limits, and provides spending analytics
 */

import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import {
  CostTracker,
  BudgetConstraints,
  AiCostBreakdown,
  AiUsageStats,
  AiError,
  AiErrorCode
} from '@/types/ai';

export interface CostManagerConfig {
  enableBudgetLimits: boolean;
  defaultMonthlyBudget: number;
  defaultDailyLimit: number;
  emergencyStopThreshold: number;
  alertThresholds: number[];
  currencyCode: string;
  trackingEnabled: boolean;
}

export interface SpendingSummary {
  userId: string;
  period: 'daily' | 'monthly' | 'total';
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
  averageCostPerRequest: number;
  budgetUsed: number;
  budgetRemaining: number;
  isOverBudget: boolean;
  topModels: Array<{
    provider: string;
    model: string;
    cost: number;
    requests: number;
  }>;
}

export interface CostAlert {
  userId: string;
  alertType: 'budget_warning' | 'budget_exceeded' | 'daily_limit' | 'emergency_stop';
  threshold: number;
  currentSpend: number;
  message: string;
  timestamp: Date;
}

/**
 * AI Cost Management System
 * Comprehensive cost tracking and budget enforcement for AI services
 */
export class CostManager {
  private config: CostManagerConfig;
  
  // In-memory cache for frequent budget checks
  private budgetCache: Map<string, {
    budget: BudgetConstraints;
    lastUpdated: Date;
    currentSpend: number;
  }> = new Map();
  
  private alertCallbacks: Array<(alert: CostAlert) => void> = [];

  constructor(config: Partial<CostManagerConfig> = {}) {
    this.config = {
      enableBudgetLimits: config.enableBudgetLimits ?? true,
      defaultMonthlyBudget: config.defaultMonthlyBudget ?? 100.0,
      defaultDailyLimit: config.defaultDailyLimit ?? 10.0,
      emergencyStopThreshold: config.emergencyStopThreshold ?? 200.0,
      alertThresholds: config.alertThresholds ?? [0.5, 0.8, 0.9, 1.0],
      currencyCode: config.currencyCode ?? 'USD',
      trackingEnabled: config.trackingEnabled ?? true,
      ...config
    };

    logger.info('Cost Manager initialized', {
      component: 'CostManager',
      config: this.config
    });
  }

  /**
   * Track AI usage and costs for a user
   */
  public async trackUsage(
    userId: string,
    cost: AiCostBreakdown,
    usage: AiUsageStats,
    metadata?: {
      provider: string;
      model: string;
      requestType: string;
      requestId: string;
    }
  ): Promise<void> {
    if (!this.config.trackingEnabled) {
      return;
    }

    try {
      // Update database tracking
      await this.updateUsageInDatabase(userId, cost, usage, metadata);
      
      // Update budget cache
      await this.updateBudgetCache(userId, cost.totalCost);
      
      // Check for budget alerts
      await this.checkBudgetAlerts(userId);

      logger.debug('Usage tracked successfully', {
        component: 'CostManager',
        userId,
        cost: cost.totalCost,
        tokens: usage.totalTokens,
        provider: metadata?.provider,
        model: metadata?.model
      });

    } catch (error) {
      logger.error('Failed to track AI usage', {
        component: 'CostManager',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get budget constraints for a user
   */
  public async getBudgetConstraints(userId: string): Promise<BudgetConstraints> {
    try {
      // Check cache first
      const cached = this.budgetCache.get(userId);
      if (cached && this.isCacheValid(cached.lastUpdated)) {
        return cached.budget;
      }

      // Get or create user budget from database
      let userBudget = await prisma.userAiBudget.findUnique({
        where: { userId }
      });

      if (!userBudget) {
        // Create default budget for new user
        userBudget = await prisma.userAiBudget.create({
          data: {
            userId,
            monthlyBudget: this.config.defaultMonthlyBudget,
            dailyUsageLimit: Math.ceil(this.config.defaultDailyLimit * 10), // Convert to request count
            allowPaidModels: false,
            autoOptimizeCost: true,
            qualityPreference: 0.7
          }
        });
      }

      // Check if we need to reset monthly counters
      const now = new Date();
      const lastReset = userBudget.lastResetDate;
      const shouldReset = this.shouldResetMonthlyCounters(lastReset, now);

      if (shouldReset) {
        userBudget = await prisma.userAiBudget.update({
          where: { userId },
          data: {
            currentSpend: 0,
            currentDailyUsage: 0,
            lastResetDate: now
          }
        });
      }

      // Check if we need to reset daily counters
      const shouldResetDaily = this.shouldResetDailyCounters(lastReset, now);
      if (shouldResetDaily && !shouldReset) {
        userBudget = await prisma.userAiBudget.update({
          where: { userId },
          data: {
            currentDailyUsage: 0
          }
        });
      }

      const constraints: BudgetConstraints = {
        dailyLimit: userBudget.dailyUsageLimit,
        monthlyLimit: userBudget.monthlyBudget,
        perRequestLimit: Math.min(userBudget.monthlyBudget * 0.1, 10.0), // Max 10% of monthly budget per request
        allowPaidModels: userBudget.allowPaidModels,
        preferFreeModels: userBudget.autoOptimizeCost,
        emergencyStopThreshold: this.config.emergencyStopThreshold
      };

      // Update cache
      this.budgetCache.set(userId, {
        budget: constraints,
        lastUpdated: now,
        currentSpend: userBudget.currentSpend
      });

      return constraints;

    } catch (error) {
      logger.error('Failed to get budget constraints', {
        component: 'CostManager',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return safe defaults on error
      return {
        dailyLimit: 10,
        monthlyLimit: this.config.defaultMonthlyBudget,
        perRequestLimit: 1.0,
        allowPaidModels: false,
        preferFreeModels: true,
        emergencyStopThreshold: this.config.emergencyStopThreshold
      };
    }
  }

  /**
   * Check if user has exceeded budget limits
   */
  public async checkBudgetLimits(
    userId: string,
    constraints: BudgetConstraints,
    estimatedCost?: number
  ): Promise<void> {
    if (!this.config.enableBudgetLimits) {
      return;
    }

    try {
      const cached = this.budgetCache.get(userId);
      const currentSpend = cached?.currentSpend || 0;
      const totalCost = currentSpend + (estimatedCost || 0);

      // Check emergency stop threshold
      if (totalCost >= constraints.emergencyStopThreshold) {
        const error: AiError = {
          code: AiErrorCode.BUDGET_EXCEEDED,
          message: `Emergency stop: Cost ${totalCost} exceeds threshold ${constraints.emergencyStopThreshold}`,
          provider: 'cost_manager',
          retryable: false,
          timestamp: new Date()
        };
        
        await this.triggerAlert({
          userId,
          alertType: 'emergency_stop',
          threshold: constraints.emergencyStopThreshold,
          currentSpend: totalCost,
          message: error.message,
          timestamp: new Date()
        });
        
        throw error;
      }

      // Check monthly budget limit
      if (totalCost >= constraints.monthlyLimit) {
        const error: AiError = {
          code: AiErrorCode.BUDGET_EXCEEDED,
          message: `Monthly budget exceeded: ${totalCost} >= ${constraints.monthlyLimit}`,
          provider: 'cost_manager',
          retryable: false,
          timestamp: new Date()
        };
        
        await this.triggerAlert({
          userId,
          alertType: 'budget_exceeded',
          threshold: constraints.monthlyLimit,
          currentSpend: totalCost,
          message: error.message,
          timestamp: new Date()
        });
        
        throw error;
      }

      // Check per-request limit
      if (estimatedCost && estimatedCost > constraints.perRequestLimit) {
        throw new Error(`Request cost ${estimatedCost} exceeds per-request limit ${constraints.perRequestLimit}`);
      }

    } catch (error) {
      if (error instanceof Error && (error.message.includes('budget') || error.message.includes('limit'))) {
        throw error; // Re-throw budget errors
      }
      
      logger.error('Budget limit check failed', {
        component: 'CostManager',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get spending summary for a user
   */
  public async getSpendingSummary(
    userId: string,
    period: 'daily' | 'monthly' | 'total' = 'monthly'
  ): Promise<SpendingSummary> {
    try {
      const budget = await this.getBudgetConstraints(userId);
      const userBudget = await prisma.userAiBudget.findUnique({
        where: { userId }
      });

      if (!userBudget) {
        throw new Error('User budget not found');
      }

      // Calculate date range for the period
      const { startDate, endDate } = this.getDateRange(period);

      // Get usage data from database
      const usage = await prisma.aiUsage.aggregate({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        _sum: {
          cost: true,
          tokensUsed: true
        },
        _count: {
          id: true
        }
      });

      // Get top models for the period
      const topModels = await prisma.aiUsage.groupBy({
        by: ['providerId', 'modelId'],
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        },
        _sum: {
          cost: true
        },
        _count: {
          id: true
        },
        orderBy: {
          _sum: {
            cost: 'desc'
          }
        },
        take: 5
      });

      const totalCost = usage._sum.cost || 0;
      const totalRequests = usage._count.id || 0;
      const totalTokens = usage._sum.tokensUsed || 0;
      
      const budgetLimit = period === 'daily' 
        ? budget.dailyLimit * 0.1 // Rough daily budget estimate
        : budget.monthlyLimit;
      
      const summary: SpendingSummary = {
        userId,
        period,
        totalCost,
        totalRequests,
        totalTokens,
        averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
        budgetUsed: budgetLimit > 0 ? (totalCost / budgetLimit) * 100 : 0,
        budgetRemaining: Math.max(0, budgetLimit - totalCost),
        isOverBudget: totalCost > budgetLimit,
        topModels: [] // Would be populated with actual model names from database
      };

      return summary;

    } catch (error) {
      logger.error('Failed to get spending summary', {
        component: 'CostManager',
        userId,
        period,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update budget for a user
   */
  public async updateBudget(
    userId: string,
    updates: Partial<{
      monthlyBudget: number;
      dailyLimit: number;
      allowPaidModels: boolean;
      autoOptimizeCost: boolean;
      qualityPreference: number;
    }>
  ): Promise<void> {
    try {
      await prisma.userAiBudget.upsert({
        where: { userId },
        create: {
          userId,
          monthlyBudget: updates.monthlyBudget || this.config.defaultMonthlyBudget,
          dailyUsageLimit: updates.dailyLimit || 100,
          allowPaidModels: updates.allowPaidModels || false,
          autoOptimizeCost: updates.autoOptimizeCost || true,
          qualityPreference: updates.qualityPreference || 0.7
        },
        update: updates
      });

      // Clear cache to force refresh
      this.budgetCache.delete(userId);

      logger.info('User budget updated', {
        component: 'CostManager',
        userId,
        updates
      });

    } catch (error) {
      logger.error('Failed to update user budget', {
        component: 'CostManager',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Register callback for budget alerts
   */
  public onAlert(callback: (alert: CostAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Update usage in database
   */
  private async updateUsageInDatabase(
    userId: string,
    cost: AiCostBreakdown,
    usage: AiUsageStats,
    metadata?: {
      provider: string;
      model: string;
      requestType: string;
      requestId: string;
    }
  ): Promise<void> {
    // This would update the AI usage tracking in the database
    // For now, we'll just update the user budget
    await prisma.userAiBudget.upsert({
      where: { userId },
      create: {
        userId,
        monthlyBudget: this.config.defaultMonthlyBudget,
        currentSpend: cost.totalCost,
        dailyUsageLimit: 100,
        currentDailyUsage: 1
      },
      update: {
        currentSpend: {
          increment: cost.totalCost
        },
        currentDailyUsage: {
          increment: 1
        }
      }
    });
  }

  /**
   * Update budget cache
   */
  private async updateBudgetCache(userId: string, cost: number): Promise<void> {
    const cached = this.budgetCache.get(userId);
    if (cached) {
      cached.currentSpend += cost;
      cached.lastUpdated = new Date();
    }
  }

  /**
   * Check for budget alerts and trigger them
   */
  private async checkBudgetAlerts(userId: string): Promise<void> {
    try {
      const cached = this.budgetCache.get(userId);
      if (!cached) return;

      const { budget, currentSpend } = cached;
      const spendRatio = currentSpend / budget.monthlyLimit;

      for (const threshold of this.config.alertThresholds) {
        if (spendRatio >= threshold && spendRatio < threshold + 0.1) {
          await this.triggerAlert({
            userId,
            alertType: threshold >= 1.0 ? 'budget_exceeded' : 'budget_warning',
            threshold: threshold * budget.monthlyLimit,
            currentSpend,
            message: `Budget ${(threshold * 100).toFixed(0)}% used: $${currentSpend.toFixed(2)} of $${budget.monthlyLimit.toFixed(2)}`,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      logger.error('Budget alert check failed', {
        component: 'CostManager',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Trigger budget alert
   */
  private async triggerAlert(alert: CostAlert): Promise<void> {
    logger.warn('Budget alert triggered', {
      component: 'CostManager',
      alert
    });

    // Notify registered callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Alert callback failed', {
          component: 'CostManager',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(lastUpdated: Date): boolean {
    const cacheAge = Date.now() - lastUpdated.getTime();
    return cacheAge < 300000; // 5 minutes
  }

  /**
   * Check if monthly counters should be reset
   */
  private shouldResetMonthlyCounters(lastReset: Date, now: Date): boolean {
    return lastReset.getMonth() !== now.getMonth() || 
           lastReset.getFullYear() !== now.getFullYear();
  }

  /**
   * Check if daily counters should be reset
   */
  private shouldResetDailyCounters(lastReset: Date, now: Date): boolean {
    return lastReset.getDate() !== now.getDate() ||
           lastReset.getMonth() !== now.getMonth() ||
           lastReset.getFullYear() !== now.getFullYear();
  }

  /**
   * Get date range for spending period
   */
  private getDateRange(period: 'daily' | 'monthly' | 'total'): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'total':
        startDate = new Date('2024-01-01'); // Start of AI tracking
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { startDate, endDate: now };
  }
}

export default CostManager;
