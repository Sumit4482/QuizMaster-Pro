/**
 * Phase 2.3: Achievement Service
 * Comprehensive achievement system with dynamic tracking and rewards
 */

import { EventEmitter } from 'events';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';

// Achievement-related enums from Prisma
export enum AchievementType {
  SCORE_BASED = 'SCORE_BASED',
  STREAK_BASED = 'STREAK_BASED',
  PARTICIPATION = 'PARTICIPATION',
  SOCIAL = 'SOCIAL',
  POWER_UP = 'POWER_UP',
  SPECIAL_EVENT = 'SPECIAL_EVENT'
}

export enum AchievementRarity {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
  DIAMOND = 'DIAMOND'
}

// Achievement interfaces
export interface Achievement {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  type: AchievementType;
  criteria: AchievementCriteria;
  rewards?: AchievementRewards;
  iconUrl?: string;
  rarity: AchievementRarity;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AchievementCriteria {
  type: 'single' | 'cumulative' | 'streak' | 'time_based' | 'complex';
  conditions: AchievementCondition[];
  requiresAll: boolean; // AND vs OR logic
}

export interface AchievementCondition {
  metric: string;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=' | 'contains' | 'in';
  value: number | string | string[];
  timeframe?: 'session' | 'daily' | 'weekly' | 'monthly' | 'all_time';
}

export interface AchievementRewards {
  experiencePoints?: number;
  powerUps?: { powerUpId: string; quantity: number }[];
  badges?: string[];
  titles?: string[];
  customRewards?: Record<string, any>;
}

export interface UserAchievement {
  id: string;
  userId: string;
  achievementId: string;
  earnedAt: Date;
  progress?: AchievementProgress;
  gameId?: string;
  achievement?: Achievement;
}

export interface AchievementProgress {
  current: number;
  target: number;
  percentage: number;
  milestones?: AchievementMilestone[];
  lastUpdated: Date;
}

export interface AchievementMilestone {
  value: number;
  reachedAt?: Date;
  reward?: AchievementRewards;
}

export interface AchievementTrackingData {
  userId: string;
  gameId?: string;
  sessionId?: string;
  metrics: Record<string, number | string | boolean>;
  timestamp: Date;
}

export interface AchievementEarnedEvent {
  userId: string;
  achievement: Achievement;
  gameId?: string;
  sessionId?: string;
  progress?: AchievementProgress;
  rewards: AchievementRewards;
}

// Achievement Service
export class AchievementService extends EventEmitter {
  private static instance: AchievementService | null = null;
  
  // Achievement tracking data
  private userProgress: Map<string, Map<string, AchievementProgress>> = new Map(); // userId -> achievementId -> progress
  private activeTracking: Map<string, AchievementTrackingData> = new Map(); // sessionId -> tracking data
  
  // Achievement definitions cache
  private achievementCache: Map<string, Achievement> = new Map();
  private achievementsByCategory: Map<string, Achievement[]> = new Map();
  private achievementsByType: Map<AchievementType, Achievement[]> = new Map();

  private constructor() {
    super();
    this.initializeService();
  }

  public static getInstance(): AchievementService {
    if (!AchievementService.instance) {
      AchievementService.instance = new AchievementService();
    }
    return AchievementService.instance;
  }

  /**
   * Initialize the achievement service
   */
  private async initializeService(): Promise<void> {
    try {
      // Load achievements from database
      await this.loadAchievements();
      
      // Initialize default achievements
      await this.initializeDefaultAchievements();
      
      // Start progress tracking
      this.startProgressTracking();
      
      logger.info('AchievementService initialized successfully', {
        totalAchievements: this.achievementCache.size
      });
    } catch (error) {
      logger.error('Failed to initialize AchievementService', { error });
      throw error;
    }
  }

  // ==========================================
  // ACHIEVEMENT MANAGEMENT
  // ==========================================

  /**
   * Load achievements from database
   */
  private async loadAchievements(): Promise<void> {
    try {
      const achievements = await prisma.achievement.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      });

      // Clear caches
      this.achievementCache.clear();
      this.achievementsByCategory.clear();
      this.achievementsByType.clear();

      // Populate caches
      for (const achievement of achievements) {
        const achievementData: Achievement = {
          ...achievement,
          criteria: achievement.criteria as AchievementCriteria,
          rewards: achievement.rewards as AchievementRewards || undefined
        };

        this.achievementCache.set(achievement.id, achievementData);

        // Group by category
        if (!this.achievementsByCategory.has(achievement.category)) {
          this.achievementsByCategory.set(achievement.category, []);
        }
        this.achievementsByCategory.get(achievement.category)!.push(achievementData);

        // Group by type
        if (!this.achievementsByType.has(achievement.type as AchievementType)) {
          this.achievementsByType.set(achievement.type as AchievementType, []);
        }
        this.achievementsByType.get(achievement.type as AchievementType)!.push(achievementData);
      }

      logger.info('Achievements loaded from database', {
        count: achievements.length,
        categories: this.achievementsByCategory.size,
        types: this.achievementsByType.size
      });

    } catch (error) {
      logger.error('Failed to load achievements', { error });
      throw error;
    }
  }

  /**
   * Initialize default achievements
   */
  private async initializeDefaultAchievements(): Promise<void> {
    const defaultAchievements = this.getDefaultAchievements();

    for (const achievement of defaultAchievements) {
      const existing = await prisma.achievement.findUnique({
        where: { name: achievement.name }
      });

      if (!existing) {
        const created = await prisma.achievement.create({
          data: achievement
        });

        const achievementData: Achievement = {
          ...created,
          criteria: created.criteria as AchievementCriteria,
          rewards: created.rewards as AchievementRewards || undefined
        };

        this.achievementCache.set(created.id, achievementData);
        
        logger.info(`Initialized achievement: ${achievement.displayName}`);
      }
    }
  }

  /**
   * Get default achievement definitions
   */
  private getDefaultAchievements(): Omit<Achievement, 'id' | 'createdAt' | 'updatedAt'>[] {
    return [
      {
        name: 'first_game',
        displayName: 'First Steps',
        description: 'Complete your first quiz game',
        category: 'getting_started',
        type: AchievementType.PARTICIPATION,
        criteria: {
          type: 'single',
          conditions: [
            { metric: 'games_completed', operator: '>=', value: 1, timeframe: 'all_time' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 100,
          powerUps: [{ powerUpId: 'hint_reveal', quantity: 3 }]
        },
        rarity: AchievementRarity.BRONZE,
        isActive: true,
        sortOrder: 1,
        iconUrl: '/achievements/first-steps.svg'
      },
      {
        name: 'perfect_game',
        displayName: 'Perfectionist',
        description: 'Answer all questions correctly in a game',
        category: 'performance',
        type: AchievementType.SCORE_BASED,
        criteria: {
          type: 'single',
          conditions: [
            { metric: 'accuracy_rate', operator: '=', value: 100, timeframe: 'session' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 500,
          powerUps: [{ powerUpId: 'double_points', quantity: 1 }],
          badges: ['perfectionist']
        },
        rarity: AchievementRarity.GOLD,
        isActive: true,
        sortOrder: 10,
        iconUrl: '/achievements/perfectionist.svg'
      },
      {
        name: 'speed_demon',
        displayName: 'Speed Demon',
        description: 'Answer 10 questions in under 5 seconds each',
        category: 'speed',
        type: AchievementType.SCORE_BASED,
        criteria: {
          type: 'cumulative',
          conditions: [
            { metric: 'fast_answers', operator: '>=', value: 10, timeframe: 'session' },
            { metric: 'average_response_time', operator: '<', value: 5, timeframe: 'session' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 300,
          powerUps: [{ powerUpId: 'lightning_round', quantity: 2 }]
        },
        rarity: AchievementRarity.SILVER,
        isActive: true,
        sortOrder: 15,
        iconUrl: '/achievements/speed-demon.svg'
      },
      {
        name: 'streak_master',
        displayName: 'Streak Master',
        description: 'Get 15 correct answers in a row',
        category: 'consistency',
        type: AchievementType.STREAK_BASED,
        criteria: {
          type: 'streak',
          conditions: [
            { metric: 'correct_streak', operator: '>=', value: 15, timeframe: 'session' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 750,
          powerUps: [{ powerUpId: 'score_shield', quantity: 1 }],
          titles: ['Streak Master']
        },
        rarity: AchievementRarity.PLATINUM,
        isActive: true,
        sortOrder: 20,
        iconUrl: '/achievements/streak-master.svg'
      },
      {
        name: 'social_butterfly',
        displayName: 'Social Butterfly',
        description: 'Add 10 friends and play games with them',
        category: 'social',
        type: AchievementType.SOCIAL,
        criteria: {
          type: 'complex',
          conditions: [
            { metric: 'friends_count', operator: '>=', value: 10, timeframe: 'all_time' },
            { metric: 'games_with_friends', operator: '>=', value: 5, timeframe: 'all_time' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 400,
          customRewards: { friend_invitation_bonus: 50 }
        },
        rarity: AchievementRarity.SILVER,
        isActive: true,
        sortOrder: 25,
        iconUrl: '/achievements/social-butterfly.svg'
      },
      {
        name: 'power_user',
        displayName: 'Power User',
        description: 'Use 50 power-ups in games',
        category: 'power_ups',
        type: AchievementType.POWER_UP,
        criteria: {
          type: 'cumulative',
          conditions: [
            { metric: 'power_ups_used', operator: '>=', value: 50, timeframe: 'all_time' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 600,
          powerUps: [
            { powerUpId: 'fifty_fifty', quantity: 5 },
            { powerUpId: 'extra_time', quantity: 5 }
          ]
        },
        rarity: AchievementRarity.GOLD,
        isActive: true,
        sortOrder: 30,
        iconUrl: '/achievements/power-user.svg'
      },
      {
        name: 'marathon_player',
        displayName: 'Marathon Player',
        description: 'Play for 2 hours straight',
        category: 'endurance',
        type: AchievementType.PARTICIPATION,
        criteria: {
          type: 'time_based',
          conditions: [
            { metric: 'continuous_play_time', operator: '>=', value: 7200, timeframe: 'session' } // 2 hours in seconds
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 1000,
          badges: ['marathon_runner'],
          titles: ['The Unstoppable']
        },
        rarity: AchievementRarity.PLATINUM,
        isActive: true,
        sortOrder: 35,
        iconUrl: '/achievements/marathon-player.svg'
      },
      {
        name: 'comeback_king',
        displayName: 'Comeback King',
        description: 'Win a game after being in last place',
        category: 'heroic',
        type: AchievementType.SPECIAL_EVENT,
        criteria: {
          type: 'complex',
          conditions: [
            { metric: 'was_last_place', operator: '=', value: true, timeframe: 'session' },
            { metric: 'final_rank', operator: '=', value: 1, timeframe: 'session' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 1500,
          powerUps: [{ powerUpId: 'answer_peek', quantity: 1 }],
          badges: ['comeback_king'],
          titles: ['The Phoenix']
        },
        rarity: AchievementRarity.DIAMOND,
        isActive: true,
        sortOrder: 40,
        iconUrl: '/achievements/comeback-king.svg'
      },
      {
        name: 'category_master_science',
        displayName: 'Science Master',
        description: 'Answer 100 science questions correctly',
        category: 'knowledge',
        type: AchievementType.SCORE_BASED,
        criteria: {
          type: 'cumulative',
          conditions: [
            { metric: 'correct_answers_science', operator: '>=', value: 100, timeframe: 'all_time' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 800,
          badges: ['science_master'],
          titles: ['Professor']
        },
        rarity: AchievementRarity.GOLD,
        isActive: true,
        sortOrder: 45,
        iconUrl: '/achievements/science-master.svg'
      },
      {
        name: 'spectator_favorite',
        displayName: 'Crowd Pleaser',
        description: 'Have 50+ spectators watch your game',
        category: 'popularity',
        type: AchievementType.SOCIAL,
        criteria: {
          type: 'single',
          conditions: [
            { metric: 'max_spectators', operator: '>=', value: 50, timeframe: 'session' }
          ],
          requiresAll: true
        },
        rewards: {
          experiencePoints: 1200,
          customRewards: { spectator_bonus_multiplier: 1.5 }
        },
        rarity: AchievementRarity.PLATINUM,
        isActive: true,
        sortOrder: 50,
        iconUrl: '/achievements/crowd-pleaser.svg'
      }
    ];
  }

  // ==========================================
  // ACHIEVEMENT TRACKING
  // ==========================================

  /**
   * Track user metrics for achievement progress
   */
  public trackUserMetrics(
    userId: string,
    metrics: Record<string, number | string | boolean>,
    gameId?: string,
    sessionId?: string
  ): void {
    try {
      const trackingData: AchievementTrackingData = {
        userId,
        gameId,
        sessionId,
        metrics,
        timestamp: new Date()
      };

      // Store tracking data if session-based
      if (sessionId) {
        this.activeTracking.set(sessionId, trackingData);
      }

      // Check achievements for this user
      this.checkAchievements(userId, metrics, gameId, sessionId);

      logger.debug('User metrics tracked', {
        userId,
        gameId,
        sessionId,
        metricsCount: Object.keys(metrics).length
      });

    } catch (error) {
      logger.error('Failed to track user metrics', { userId, metrics, error });
    }
  }

  /**
   * Check achievements for user
   */
  private async checkAchievements(
    userId: string,
    metrics: Record<string, number | string | boolean>,
    gameId?: string,
    sessionId?: string
  ): Promise<void> {
    try {
      // Get user's current achievements to avoid duplicates
      const userAchievements = await prisma.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true }
      });

      const earnedAchievementIds = new Set(userAchievements.map(ua => ua.achievementId));

      // Check each achievement
      for (const achievement of this.achievementCache.values()) {
        // Skip if already earned (for non-repeatable achievements)
        if (earnedAchievementIds.has(achievement.id)) {
          continue;
        }

        // Check if criteria are met
        const progressResult = await this.evaluateAchievementCriteria(
          userId,
          achievement,
          metrics,
          gameId,
          sessionId
        );

        if (progressResult.isComplete) {
          await this.awardAchievement(
            userId,
            achievement,
            gameId,
            sessionId,
            progressResult.progress
          );
        } else if (progressResult.progress) {
          // Update progress tracking
          await this.updateAchievementProgress(
            userId,
            achievement.id,
            progressResult.progress
          );
        }
      }

    } catch (error) {
      logger.error('Failed to check achievements', { userId, error });
    }
  }

  /**
   * Evaluate achievement criteria
   */
  private async evaluateAchievementCriteria(
    userId: string,
    achievement: Achievement,
    currentMetrics: Record<string, number | string | boolean>,
    gameId?: string,
    sessionId?: string
  ): Promise<{ isComplete: boolean; progress?: AchievementProgress }> {
    try {
      const { criteria } = achievement;
      const conditionResults: boolean[] = [];
      let progress: AchievementProgress | undefined;

      // Get historical metrics if needed
      const historicalMetrics = await this.getUserHistoricalMetrics(
        userId,
        criteria.conditions,
        gameId
      );

      // Combine current and historical metrics
      const allMetrics = { ...historicalMetrics, ...currentMetrics };

      // Evaluate each condition
      for (const condition of criteria.conditions) {
        const result = this.evaluateCondition(condition, allMetrics);
        conditionResults.push(result.met);

        // Track progress for cumulative achievements
        if (criteria.type === 'cumulative' && result.progress) {
          progress = result.progress;
        }
      }

      // Determine if achievement is complete
      const isComplete = criteria.requiresAll 
        ? conditionResults.every(result => result)
        : conditionResults.some(result => result);

      return { isComplete, progress };

    } catch (error) {
      logger.error('Failed to evaluate achievement criteria', { 
        userId, 
        achievementId: achievement.id, 
        error 
      });
      return { isComplete: false };
    }
  }

  /**
   * Evaluate individual condition
   */
  private evaluateCondition(
    condition: AchievementCondition,
    metrics: Record<string, number | string | boolean>
  ): { met: boolean; progress?: AchievementProgress } {
    const metricValue = metrics[condition.metric];
    
    if (metricValue === undefined) {
      return { met: false };
    }

    let met = false;
    let progress: AchievementProgress | undefined;

    // Evaluate condition based on operator
    switch (condition.operator) {
      case '=':
        met = metricValue === condition.value;
        break;
      case '!=':
        met = metricValue !== condition.value;
        break;
      case '<':
        met = Number(metricValue) < Number(condition.value);
        break;
      case '>':
        met = Number(metricValue) > Number(condition.value);
        break;
      case '<=':
        met = Number(metricValue) <= Number(condition.value);
        break;
      case '>=':
        met = Number(metricValue) >= Number(condition.value);
        if (typeof metricValue === 'number' && typeof condition.value === 'number') {
          progress = {
            current: metricValue,
            target: condition.value,
            percentage: Math.min(100, (metricValue / condition.value) * 100),
            lastUpdated: new Date()
          };
        }
        break;
      case 'contains':
        met = String(metricValue).includes(String(condition.value));
        break;
      case 'in':
        const arrayValue = Array.isArray(condition.value) ? condition.value : [condition.value];
        met = arrayValue.includes(metricValue);
        break;
    }

    return { met, progress };
  }

  /**
   * Award achievement to user
   */
  private async awardAchievement(
    userId: string,
    achievement: Achievement,
    gameId?: string,
    sessionId?: string,
    progress?: AchievementProgress
  ): Promise<void> {
    try {
      // Create user achievement record
      const userAchievement = await prisma.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id,
          gameId,
          progress: progress || null
        },
        include: {
          achievement: true
        }
      });

      // Apply rewards
      if (achievement.rewards) {
        await this.applyAchievementRewards(userId, achievement.rewards);
      }

      // Create achievement event
      const earnedEvent: AchievementEarnedEvent = {
        userId,
        achievement,
        gameId,
        sessionId,
        progress,
        rewards: achievement.rewards || {}
      };

      // Emit achievement earned event
      this.emit('achievement:earned', earnedEvent);

      // Send notification (would integrate with notification system)
      await this.sendAchievementNotification(userId, achievement);

      logger.info('Achievement awarded', {
        userId,
        achievementId: achievement.id,
        achievementName: achievement.displayName,
        gameId,
        rarity: achievement.rarity
      });

    } catch (error) {
      logger.error('Failed to award achievement', { 
        userId, 
        achievementId: achievement.id, 
        error 
      });
    }
  }

  /**
   * Apply achievement rewards
   */
  private async applyAchievementRewards(
    userId: string,
    rewards: AchievementRewards
  ): Promise<void> {
    try {
      // Award experience points
      if (rewards.experiencePoints) {
        await this.addExperiencePoints(userId, rewards.experiencePoints);
      }

      // Grant power-ups
      if (rewards.powerUps) {
        for (const powerUpReward of rewards.powerUps) {
          await this.grantPowerUp(userId, powerUpReward.powerUpId, powerUpReward.quantity);
        }
      }

      // Grant badges and titles would be handled by profile service
      // This is a simplified implementation

      logger.debug('Achievement rewards applied', {
        userId,
        experiencePoints: rewards.experiencePoints,
        powerUpsCount: rewards.powerUps?.length || 0
      });

    } catch (error) {
      logger.error('Failed to apply achievement rewards', { userId, rewards, error });
    }
  }

  // ==========================================
  // USER ACHIEVEMENT QUERIES
  // ==========================================

  /**
   * Get user achievements
   */
  public async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    try {
      const userAchievements = await prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: { earnedAt: 'desc' }
      });

      return userAchievements.map(ua => ({
        ...ua,
        progress: ua.progress as AchievementProgress || undefined
      })) as UserAchievement[];

    } catch (error) {
      logger.error('Failed to get user achievements', { userId, error });
      return [];
    }
  }

  /**
   * Get user achievement progress
   */
  public async getUserAchievementProgress(
    userId: string,
    achievementId?: string
  ): Promise<Map<string, AchievementProgress>> {
    try {
      const progressMap = new Map<string, AchievementProgress>();

      if (achievementId) {
        // Get progress for specific achievement
        const progress = await this.calculateAchievementProgress(userId, achievementId);
        if (progress) {
          progressMap.set(achievementId, progress);
        }
      } else {
        // Get progress for all achievements
        for (const achievement of this.achievementCache.values()) {
          const progress = await this.calculateAchievementProgress(userId, achievement.id);
          if (progress) {
            progressMap.set(achievement.id, progress);
          }
        }
      }

      return progressMap;

    } catch (error) {
      logger.error('Failed to get user achievement progress', { userId, achievementId, error });
      return new Map();
    }
  }

  /**
   * Calculate achievement progress for user
   */
  private async calculateAchievementProgress(
    userId: string,
    achievementId: string
  ): Promise<AchievementProgress | null> {
    try {
      const achievement = this.achievementCache.get(achievementId);
      if (!achievement) return null;

      // Check if already earned
      const existingAchievement = await prisma.userAchievement.findUnique({
        where: {
          userId_achievementId: {
            userId,
            achievementId
          }
        }
      });

      if (existingAchievement) {
        return {
          current: 1,
          target: 1,
          percentage: 100,
          lastUpdated: existingAchievement.earnedAt
        };
      }

      // Calculate current progress
      const historicalMetrics = await this.getUserHistoricalMetrics(
        userId,
        achievement.criteria.conditions
      );

      // For cumulative achievements, calculate progress
      if (achievement.criteria.type === 'cumulative') {
        const condition = achievement.criteria.conditions[0]; // Simplified for first condition
        const currentValue = Number(historicalMetrics[condition.metric] || 0);
        const targetValue = Number(condition.value);

        if (targetValue > 0) {
          return {
            current: currentValue,
            target: targetValue,
            percentage: Math.min(100, (currentValue / targetValue) * 100),
            lastUpdated: new Date()
          };
        }
      }

      return null;

    } catch (error) {
      logger.error('Failed to calculate achievement progress', { userId, achievementId, error });
      return null;
    }
  }

  /**
   * Get user historical metrics
   */
  private async getUserHistoricalMetrics(
    userId: string,
    conditions: AchievementCondition[],
    gameId?: string
  ): Promise<Record<string, number | string | boolean>> {
    try {
      // This would query various data sources based on the metrics needed
      // For now, we'll use user statistics as the primary source
      
      const userStats = await prisma.userStatistics.findUnique({
        where: { userId }
      });

      if (!userStats) {
        return {};
      }

      // Map statistics to achievement metrics
      const metrics: Record<string, number | string | boolean> = {
        games_completed: userStats.totalQuizzesCompleted,
        games_started: userStats.totalQuizzesStarted,
        total_score: userStats.averageScore * userStats.totalQuizzesCompleted,
        accuracy_rate: userStats.overallAccuracy,
        total_time_played: userStats.totalTimeSpent,
        best_score: userStats.bestScore,
        longest_streak: userStats.longestStreak,
        perfect_games: userStats.perfectQuizzes,
        level: userStats.level,
        experience_points: userStats.experiencePoints
      };

      // Add power-up usage data
      const powerUpUsage = await prisma.powerUpUsage.groupBy({
        by: ['userId'],
        where: { userId },
        _count: { id: true }
      });

      metrics.power_ups_used = powerUpUsage[0]?._count.id || 0;

      // Add social metrics
      const friendsCount = await prisma.userFriend.count({
        where: {
          userId,
          status: 'ACCEPTED'
        }
      });

      metrics.friends_count = friendsCount;

      // Add other metrics as needed based on conditions
      for (const condition of conditions) {
        if (condition.metric.includes('category_')) {
          // Handle category-specific metrics
          const category = condition.metric.replace('correct_answers_', '').replace('games_', '');
          // This would need more complex querying based on quiz results
        }
      }

      return metrics;

    } catch (error) {
      logger.error('Failed to get user historical metrics', { userId, error });
      return {};
    }
  }

  // ==========================================
  // ACHIEVEMENT QUERIES
  // ==========================================

  /**
   * Get all achievements
   */
  public getAllAchievements(): Achievement[] {
    return Array.from(this.achievementCache.values());
  }

  /**
   * Get achievements by category
   */
  public getAchievementsByCategory(category: string): Achievement[] {
    return this.achievementsByCategory.get(category) || [];
  }

  /**
   * Get achievements by type
   */
  public getAchievementsByType(type: AchievementType): Achievement[] {
    return this.achievementsByType.get(type) || [];
  }

  /**
   * Get achievements by rarity
   */
  public getAchievementsByRarity(rarity: AchievementRarity): Achievement[] {
    return Array.from(this.achievementCache.values())
      .filter(achievement => achievement.rarity === rarity);
  }

  /**
   * Get achievement by ID
   */
  public getAchievement(achievementId: string): Achievement | null {
    return this.achievementCache.get(achievementId) || null;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Update achievement progress
   */
  private async updateAchievementProgress(
    userId: string,
    achievementId: string,
    progress: AchievementProgress
  ): Promise<void> {
    try {
      // Store progress in memory for now
      // In production, this might be persisted to database for partial progress
      
      if (!this.userProgress.has(userId)) {
        this.userProgress.set(userId, new Map());
      }

      this.userProgress.get(userId)!.set(achievementId, progress);

      // Emit progress update event
      this.emit('achievement:progress_updated', {
        userId,
        achievementId,
        progress
      });

    } catch (error) {
      logger.error('Failed to update achievement progress', { userId, achievementId, error });
    }
  }

  /**
   * Add experience points to user
   */
  private async addExperiencePoints(userId: string, points: number): Promise<void> {
    try {
      await prisma.userStatistics.upsert({
        where: { userId },
        create: {
          userId,
          experiencePoints: points,
          level: this.calculateLevel(points)
        },
        update: {
          experiencePoints: {
            increment: points
          },
          level: {
            set: prisma.$queryRaw`
              CASE WHEN (experience_points + ${points}) >= 1000 
              THEN FLOOR((experience_points + ${points}) / 1000) + 1 
              ELSE level END
            `
          }
        }
      });

      logger.debug('Experience points added', { userId, points });

    } catch (error) {
      logger.error('Failed to add experience points', { userId, points, error });
    }
  }

  /**
   * Grant power-up to user
   */
  private async grantPowerUp(userId: string, powerUpId: string, quantity: number): Promise<void> {
    try {
      await prisma.userPowerUp.upsert({
        where: {
          userId_powerUpId: {
            userId,
            powerUpId
          }
        },
        create: {
          userId,
          powerUpId,
          quantity
        },
        update: {
          quantity: {
            increment: quantity
          }
        }
      });

      logger.debug('Power-up granted', { userId, powerUpId, quantity });

    } catch (error) {
      logger.error('Failed to grant power-up', { userId, powerUpId, quantity, error });
    }
  }

  /**
   * Calculate level from experience points
   */
  private calculateLevel(experiencePoints: number): number {
    // Simple leveling: 1000 XP per level
    return Math.floor(experiencePoints / 1000) + 1;
  }

  /**
   * Send achievement notification
   */
  private async sendAchievementNotification(
    userId: string,
    achievement: Achievement
  ): Promise<void> {
    try {
      // This would integrate with the notification system
      // For now, just emit an event
      
      this.emit('achievement:notification', {
        userId,
        achievementId: achievement.id,
        title: 'Achievement Unlocked!',
        message: `You've earned "${achievement.displayName}"`,
        iconUrl: achievement.iconUrl,
        rarity: achievement.rarity
      });

      logger.debug('Achievement notification sent', {
        userId,
        achievementId: achievement.id,
        achievementName: achievement.displayName
      });

    } catch (error) {
      logger.error('Failed to send achievement notification', { userId, achievement, error });
    }
  }

  /**
   * Start progress tracking
   */
  private startProgressTracking(): void {
    // Clean up old tracking data every 30 minutes
    setInterval(() => {
      this.cleanupTrackingData();
    }, 1800000);
  }

  /**
   * Clean up old tracking data
   */
  private cleanupTrackingData(): void {
    const cutoffTime = Date.now() - 3600000; // 1 hour ago

    for (const [sessionId, trackingData] of this.activeTracking) {
      if (trackingData.timestamp.getTime() < cutoffTime) {
        this.activeTracking.delete(sessionId);
      }
    }
  }

  /**
   * Get achievement statistics
   */
  public async getAchievementStatistics(): Promise<{
    totalAchievements: number;
    totalEarned: number;
    completionRate: number;
    popularAchievements: { achievement: Achievement; earnedCount: number }[];
    rareAchievements: Achievement[];
  }> {
    try {
      const totalAchievements = this.achievementCache.size;

      // Get total earned achievements
      const totalEarned = await prisma.userAchievement.count();

      // Calculate completion rate
      const totalUsers = await prisma.user.count();
      const completionRate = totalUsers > 0 ? (totalEarned / (totalUsers * totalAchievements)) * 100 : 0;

      // Get popular achievements
      const popularAchievementsData = await prisma.userAchievement.groupBy({
        by: ['achievementId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      });

      const popularAchievements = popularAchievementsData
        .map(data => {
          const achievement = this.achievementCache.get(data.achievementId);
          return achievement ? {
            achievement,
            earnedCount: data._count.id
          } : null;
        })
        .filter(Boolean) as { achievement: Achievement; earnedCount: number }[];

      // Get rare achievements (Diamond rarity with low earn rate)
      const rareAchievements = Array.from(this.achievementCache.values())
        .filter(achievement => achievement.rarity === AchievementRarity.DIAMOND);

      return {
        totalAchievements,
        totalEarned,
        completionRate,
        popularAchievements,
        rareAchievements
      };

    } catch (error) {
      logger.error('Failed to get achievement statistics', { error });
      throw error;
    }
  }

  /**
   * Get user achievement summary
   */
  public async getUserAchievementSummary(userId: string): Promise<{
    totalEarned: number;
    totalAvailable: number;
    completionRate: number;
    experiencePoints: number;
    level: number;
    recentAchievements: UserAchievement[];
    nextAchievements: { achievement: Achievement; progress: AchievementProgress }[];
  }> {
    try {
      const userAchievements = await this.getUserAchievements(userId);
      const totalEarned = userAchievements.length;
      const totalAvailable = this.achievementCache.size;
      const completionRate = totalAvailable > 0 ? (totalEarned / totalAvailable) * 100 : 0;

      // Get user stats
      const userStats = await prisma.userStatistics.findUnique({
        where: { userId }
      });

      const experiencePoints = userStats?.experiencePoints || 0;
      const level = userStats?.level || 1;

      // Get recent achievements (last 5)
      const recentAchievements = userAchievements.slice(0, 5);

      // Get next achievements to unlock (achievements with highest progress)
      const progressMap = await this.getUserAchievementProgress(userId);
      const nextAchievements = Array.from(progressMap.entries())
        .filter(([achievementId]) => !userAchievements.some(ua => ua.achievementId === achievementId))
        .map(([achievementId, progress]) => {
          const achievement = this.achievementCache.get(achievementId);
          return achievement ? { achievement, progress } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b!.progress.percentage - a!.progress.percentage)
        .slice(0, 5) as { achievement: Achievement; progress: AchievementProgress }[];

      return {
        totalEarned,
        totalAvailable,
        completionRate,
        experiencePoints,
        level,
        recentAchievements,
        nextAchievements
      };

    } catch (error) {
      logger.error('Failed to get user achievement summary', { userId, error });
      throw error;
    }
  }
}
