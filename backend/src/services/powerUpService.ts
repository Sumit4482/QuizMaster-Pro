/**
 * Phase 2.3: Power-up Service
 * Core service for managing power-ups, effects, and player inventories
 */

import { EventEmitter } from 'events';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { 
  PowerUp, 
  PowerUpType, 
  PowerUpRarity,
  UserPowerUp, 
  ActivePowerUp, 
  PowerUpActivationPayload,
  PowerUpEffectResult,
  GamePowerUpState,
  PowerUpServiceConfig,
  PowerUpError,
  PowerUpErrorCode,
  PowerUpUsage
} from '@/types/powerups';

export class PowerUpService extends EventEmitter {
  private static instance: PowerUpService | null = null;
  private config: PowerUpServiceConfig;
  private gamePowerUpStates: Map<string, GamePowerUpState> = new Map();
  private activePowerUps: Map<string, ActivePowerUp[]> = new Map(); // gameId -> power-ups
  private cooldowns: Map<string, Map<string, Date>> = new Map(); // userId -> powerUpId -> cooldownEnd

  private constructor(config: PowerUpServiceConfig) {
    super();
    this.config = config;
    this.initializeService();
  }

  public static getInstance(config?: PowerUpServiceConfig): PowerUpService {
    if (!PowerUpService.instance) {
      if (!config) {
        throw new Error('PowerUpService must be initialized with config');
      }
      PowerUpService.instance = new PowerUpService(config);
    }
    return PowerUpService.instance;
  }

  /**
   * Initialize the power-up service
   */
  private async initializeService(): Promise<void> {
    try {
      // Load default power-ups into database if they don't exist
      await this.seedDefaultPowerUps();
      
      // Start cleanup routines
      this.startCleanupRoutines();
      
      logger.info('PowerUpService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PowerUpService', { error });
      throw error;
    }
  }

  /**
   * Seed default power-ups into the database
   */
  private async seedDefaultPowerUps(): Promise<void> {
    const defaultPowerUps = this.getDefaultPowerUps();
    
    for (const powerUp of defaultPowerUps) {
      const existing = await prisma.powerUp.findUnique({
        where: { name: powerUp.name }
      });
      
      if (!existing) {
        await prisma.powerUp.create({
          data: powerUp
        });
        logger.info(`Seeded power-up: ${powerUp.name}`);
      }
    }
  }

  /**
   * Get default power-up definitions
   */
  private getDefaultPowerUps(): Omit<PowerUp, 'id' | 'createdAt' | 'updatedAt'>[] {
    return [
      {
        name: 'fifty_fifty',
        displayName: '50-50',
        description: 'Remove two incorrect answers from multiple choice questions',
        type: PowerUpType.ELIMINATION,
        rarity: PowerUpRarity.COMMON,
        effects: [
          {
            type: 'immediate',
            intensity: 0.5,
            parameters: {
              eliminationCount: 2,
              revealDuration: 3000,
              preventRandom: false
            }
          }
        ],
        cooldownSeconds: 60,
        maxUsesPerGame: 3,
        cost: 100,
        iconUrl: '/icons/fifty-fifty.svg',
        isActive: true,
        sortOrder: 1,
        animationData: {
          type: 'elimination',
          duration: 2000,
          sound: 'elimination.mp3'
        }
      },
      {
        name: 'extra_time',
        displayName: 'Extra Time',
        description: 'Add 15 seconds to the current question timer',
        type: PowerUpType.TIME_EXTENSION,
        rarity: PowerUpRarity.COMMON,
        effects: [
          {
            type: 'immediate',
            intensity: 1.0,
            parameters: {
              additionalSeconds: 15,
              maxTotalExtension: 60,
              visualCountdown: true
            }
          }
        ],
        cooldownSeconds: 90,
        maxUsesPerGame: 2,
        cost: 150,
        iconUrl: '/icons/extra-time.svg',
        isActive: true,
        sortOrder: 2,
        animationData: {
          type: 'time_extension',
          duration: 1500,
          sound: 'time-add.mp3'
        }
      },
      {
        name: 'double_points',
        displayName: 'Double Points',
        description: 'Double your points for the next 3 questions',
        type: PowerUpType.POINT_MULTIPLIER,
        rarity: PowerUpRarity.RARE,
        effects: [
          {
            type: 'timed',
            duration: 180, // 3 minutes
            intensity: 2.0,
            parameters: {
              multiplier: 2,
              duration: 180,
              affectsBonuses: true
            }
          }
        ],
        cooldownSeconds: 120,
        maxUsesPerGame: 2,
        cost: 250,
        iconUrl: '/icons/double-points.svg',
        isActive: true,
        sortOrder: 3,
        animationData: {
          type: 'point_multiplier',
          duration: 2500,
          sound: 'double-points.mp3'
        }
      },
      {
        name: 'freeze_opponents',
        displayName: 'Freeze',
        description: 'Freeze all other players for 10 seconds',
        type: PowerUpType.FREEZE_OPPONENTS,
        rarity: PowerUpRarity.EPIC,
        effects: [
          {
            type: 'timed',
            duration: 10,
            intensity: 1.0,
            parameters: {
              freezeDurationSeconds: 10,
              targetMode: 'all',
              showFreezeEffect: true
            }
          }
        ],
        cooldownSeconds: 180,
        maxUsesPerGame: 1,
        cost: 400,
        iconUrl: '/icons/freeze.svg',
        isActive: true,
        sortOrder: 4,
        animationData: {
          type: 'freeze',
          duration: 3000,
          sound: 'freeze.mp3'
        }
      },
      {
        name: 'hint_reveal',
        displayName: 'Hint',
        description: 'Reveal a helpful hint for the current question',
        type: PowerUpType.HINT_REVEAL,
        rarity: PowerUpRarity.COMMON,
        effects: [
          {
            type: 'timed',
            duration: 10,
            intensity: 1.0,
            parameters: {
              hintType: 'category',
              revealDuration: 10
            }
          }
        ],
        cooldownSeconds: 45,
        maxUsesPerGame: 4,
        cost: 75,
        iconUrl: '/icons/hint.svg',
        isActive: true,
        sortOrder: 5,
        animationData: {
          type: 'hint_reveal',
          duration: 1000,
          sound: 'hint.mp3'
        }
      },
      {
        name: 'answer_peek',
        displayName: 'Peek',
        description: 'Briefly highlight the correct answer',
        type: PowerUpType.ANSWER_PEEK,
        rarity: PowerUpRarity.LEGENDARY,
        effects: [
          {
            type: 'timed',
            duration: 2,
            intensity: 1.0,
            parameters: {
              peekDurationMs: 2000,
              highlightCorrect: true,
              blurIncorrect: true
            }
          }
        ],
        cooldownSeconds: 300,
        maxUsesPerGame: 1,
        cost: 750,
        iconUrl: '/icons/peek.svg',
        isActive: true,
        sortOrder: 6,
        animationData: {
          type: 'answer_peek',
          duration: 2500,
          sound: 'peek.mp3'
        }
      },
      {
        name: 'score_shield',
        displayName: 'Shield',
        description: 'Protect yourself from score penalties for 60 seconds',
        type: PowerUpType.SCORE_SHIELD,
        rarity: PowerUpRarity.RARE,
        effects: [
          {
            type: 'timed',
            duration: 60,
            intensity: 1.0,
            parameters: {
              protectionDuration: 60,
              protectFromTypes: ['wrong_answer', 'time_penalty'],
              maxProtectedPoints: 500
            }
          }
        ],
        cooldownSeconds: 240,
        maxUsesPerGame: 1,
        cost: 300,
        iconUrl: '/icons/shield.svg',
        isActive: true,
        sortOrder: 7,
        animationData: {
          type: 'shield',
          duration: 2000,
          sound: 'shield.mp3'
        }
      },
      {
        name: 'lightning_round',
        displayName: 'Lightning',
        description: 'Get massive speed bonuses for quick answers',
        type: PowerUpType.LIGHTNING_ROUND,
        rarity: PowerUpRarity.EPIC,
        effects: [
          {
            type: 'timed',
            duration: 120,
            intensity: 1.5,
            parameters: {
              speedBonusMultiplier: 3,
              bonusDurationSeconds: 120,
              visualEffects: true
            }
          }
        ],
        cooldownSeconds: 180,
        maxUsesPerGame: 1,
        cost: 500,
        iconUrl: '/icons/lightning.svg',
        isActive: true,
        sortOrder: 8,
        animationData: {
          type: 'lightning',
          duration: 3000,
          sound: 'lightning.mp3'
        }
      }
    ];
  }

  /**
   * Get all available power-ups
   */
  public async getAllPowerUps(): Promise<PowerUp[]> {
    return await prisma.powerUp.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
  }

  /**
   * Get user's power-up inventory
   */
  public async getUserPowerUps(userId: string): Promise<UserPowerUp[]> {
    return await prisma.userPowerUp.findMany({
      where: { userId },
      include: { powerUp: true },
      orderBy: { earnedAt: 'desc' }
    });
  }

  /**
   * Grant power-up to user
   */
  public async grantPowerUp(userId: string, powerUpId: string, quantity: number = 1): Promise<UserPowerUp> {
    try {
      // Check if power-up exists
      const powerUp = await prisma.powerUp.findUnique({
        where: { id: powerUpId }
      });

      if (!powerUp) {
        throw new PowerUpError(PowerUpErrorCode.POWER_UP_NOT_FOUND, 'Power-up not found');
      }

      // Try to update existing inventory entry
      const existingEntry = await prisma.userPowerUp.findUnique({
        where: {
          userId_powerUpId: {
            userId,
            powerUpId
          }
        }
      });

      if (existingEntry) {
        return await prisma.userPowerUp.update({
          where: { id: existingEntry.id },
          data: { quantity: existingEntry.quantity + quantity },
          include: { powerUp: true }
        });
      } else {
        return await prisma.userPowerUp.create({
          data: {
            userId,
            powerUpId,
            quantity
          },
          include: { powerUp: true }
        });
      }
    } catch (error) {
      logger.error('Failed to grant power-up', { userId, powerUpId, quantity, error });
      throw error;
    }
  }

  /**
   * Initialize game power-up state
   */
  public initializeGamePowerUps(gameId: string, roomId: string): void {
    if (!this.config.enablePowerUps) {
      return;
    }

    const gameState: GamePowerUpState = {
      gameId,
      roomId,
      activePowerUps: new Map(),
      playerCooldowns: new Map(),
      playerUsageCounts: new Map(),
      globalEffects: []
    };

    this.gamePowerUpStates.set(gameId, gameState);
    logger.info('Initialized game power-up state', { gameId, roomId });
  }

  /**
   * Activate a power-up
   */
  public async activatePowerUp(payload: PowerUpActivationPayload, userId: string): Promise<PowerUpEffectResult> {
    try {
      const { powerUpId, roomId, gameId, targetUserId, metadata } = payload;

      // Validate power-up exists and is active
      const powerUp = await prisma.powerUp.findUnique({
        where: { id: powerUpId, isActive: true }
      });

      if (!powerUp) {
        throw new PowerUpError(PowerUpErrorCode.POWER_UP_NOT_FOUND, 'Power-up not found or inactive');
      }

      // Check if user has this power-up in inventory
      const userPowerUp = await prisma.userPowerUp.findUnique({
        where: {
          userId_powerUpId: {
            userId,
            powerUpId
          }
        }
      });

      if (!userPowerUp || userPowerUp.quantity <= 0) {
        throw new PowerUpError(PowerUpErrorCode.INSUFFICIENT_QUANTITY, 'Insufficient power-up quantity');
      }

      // Check cooldown
      if (this.isOnCooldown(userId, powerUpId)) {
        throw new PowerUpError(PowerUpErrorCode.COOLDOWN_ACTIVE, 'Power-up is on cooldown');
      }

      // Check usage limits
      if (this.hasExceededUsageLimit(gameId, userId, powerUpId, powerUp.maxUsesPerGame)) {
        throw new PowerUpError(PowerUpErrorCode.USAGE_LIMIT_REACHED, 'Usage limit reached for this game');
      }

      // Apply power-up effects
      const effectResult = await this.applyPowerUpEffects(powerUp, userId, gameId, roomId, targetUserId, metadata);

      // Consume power-up from inventory
      await this.consumePowerUp(userId, powerUpId);

      // Set cooldown
      this.setCooldown(userId, powerUpId, powerUp.cooldownSeconds);

      // Update usage count
      this.incrementUsageCount(gameId, userId, powerUpId);

      // Log usage
      await this.logPowerUpUsage(userId, powerUpId, gameId, roomId, effectResult.metadata);

      // Emit events
      this.emit('powerup:activated', effectResult);

      logger.info('Power-up activated successfully', {
        userId,
        powerUpId,
        gameId,
        type: powerUp.type,
        effects: effectResult.effects
      });

      return effectResult;

    } catch (error) {
      logger.error('Failed to activate power-up', { payload, userId, error });
      throw error;
    }
  }

  /**
   * Apply power-up effects
   */
  private async applyPowerUpEffects(
    powerUp: PowerUp,
    userId: string,
    gameId: string,
    roomId: string,
    targetUserId?: string,
    metadata?: Record<string, any>
  ): Promise<PowerUpEffectResult> {
    const effects: PowerUpEffectResult['effects'] = [];

    for (const effect of powerUp.effects) {
      try {
        let applied = false;
        let value: any = null;

        switch (powerUp.type) {
          case PowerUpType.ELIMINATION:
            ({ applied, value } = await this.applyEliminationEffect(effect, gameId, userId));
            break;
          
          case PowerUpType.TIME_EXTENSION:
            ({ applied, value } = await this.applyTimeExtensionEffect(effect, gameId, userId));
            break;
          
          case PowerUpType.POINT_MULTIPLIER:
            ({ applied, value } = await this.applyPointMultiplierEffect(effect, gameId, userId));
            break;
          
          case PowerUpType.FREEZE_OPPONENTS:
            ({ applied, value } = await this.applyFreezeOpponentsEffect(effect, gameId, userId));
            break;
          
          case PowerUpType.HINT_REVEAL:
            ({ applied, value } = await this.applyHintRevealEffect(effect, gameId, userId));
            break;
          
          case PowerUpType.ANSWER_PEEK:
            ({ applied, value } = await this.applyAnswerPeekEffect(effect, gameId, userId));
            break;
          
          case PowerUpType.SCORE_SHIELD:
            ({ applied, value } = await this.applyScoreShieldEffect(effect, gameId, userId));
            break;
          
          case PowerUpType.LIGHTNING_ROUND:
            ({ applied, value } = await this.applyLightningRoundEffect(effect, gameId, userId));
            break;
        }

        effects.push({
          type: effect.type,
          applied,
          value,
          error: applied ? undefined : 'Effect application failed'
        });

      } catch (effectError) {
        effects.push({
          type: effect.type,
          applied: false,
          error: effectError instanceof Error ? effectError.message : 'Unknown error'
        });
      }
    }

    return {
      success: effects.some(e => e.applied),
      powerUpId: powerUp.id,
      userId,
      type: powerUp.type,
      effects,
      metadata
    };
  }

  /**
   * Apply elimination effect (50-50)
   */
  private async applyEliminationEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    // This would integrate with the game manager to eliminate incorrect answers
    // For now, we'll simulate the effect
    const eliminationCount = effect.parameters.eliminationCount || 2;
    
    // Store active effect
    const activePowerUp: ActivePowerUp = {
      powerUpId: `elimination_${Date.now()}`,
      userId,
      type: PowerUpType.ELIMINATION,
      effects: [effect],
      activatedAt: new Date(),
      isActive: true,
      metadata: { eliminationCount }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { eliminatedOptions: eliminationCount }
    };
  }

  /**
   * Apply time extension effect
   */
  private async applyTimeExtensionEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    const additionalSeconds = effect.parameters.additionalSeconds || 15;
    
    const activePowerUp: ActivePowerUp = {
      powerUpId: `time_extension_${Date.now()}`,
      userId,
      type: PowerUpType.TIME_EXTENSION,
      effects: [effect],
      activatedAt: new Date(),
      isActive: true,
      metadata: { additionalSeconds }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { additionalSeconds }
    };
  }

  /**
   * Apply point multiplier effect
   */
  private async applyPointMultiplierEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    const multiplier = effect.parameters.multiplier || 2;
    const duration = effect.parameters.duration || 180;
    
    const activePowerUp: ActivePowerUp = {
      powerUpId: `point_multiplier_${Date.now()}`,
      userId,
      type: PowerUpType.POINT_MULTIPLIER,
      effects: [effect],
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 1000),
      isActive: true,
      metadata: { multiplier, duration }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { multiplier, duration }
    };
  }

  /**
   * Apply freeze opponents effect
   */
  private async applyFreezeOpponentsEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    const freezeDuration = effect.parameters.freezeDurationSeconds || 10;
    
    const activePowerUp: ActivePowerUp = {
      powerUpId: `freeze_${Date.now()}`,
      userId,
      type: PowerUpType.FREEZE_OPPONENTS,
      effects: [effect],
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + freezeDuration * 1000),
      isActive: true,
      metadata: { freezeDuration, affectedPlayers: 'all' }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { freezeDuration, targetMode: 'all' }
    };
  }

  /**
   * Apply hint reveal effect
   */
  private async applyHintRevealEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    const hintType = effect.parameters.hintType || 'category';
    const duration = effect.parameters.revealDuration || 10;
    
    const activePowerUp: ActivePowerUp = {
      powerUpId: `hint_${Date.now()}`,
      userId,
      type: PowerUpType.HINT_REVEAL,
      effects: [effect],
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 1000),
      isActive: true,
      metadata: { hintType, duration }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { hintType, duration }
    };
  }

  /**
   * Apply answer peek effect
   */
  private async applyAnswerPeekEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    const duration = effect.parameters.peekDurationMs || 2000;
    
    const activePowerUp: ActivePowerUp = {
      powerUpId: `peek_${Date.now()}`,
      userId,
      type: PowerUpType.ANSWER_PEEK,
      effects: [effect],
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + duration),
      isActive: true,
      metadata: { duration }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { peekDuration: duration }
    };
  }

  /**
   * Apply score shield effect
   */
  private async applyScoreShieldEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    const duration = effect.parameters.protectionDuration || 60;
    const protectFromTypes = effect.parameters.protectFromTypes || ['wrong_answer', 'time_penalty'];
    
    const activePowerUp: ActivePowerUp = {
      powerUpId: `shield_${Date.now()}`,
      userId,
      type: PowerUpType.SCORE_SHIELD,
      effects: [effect],
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 1000),
      isActive: true,
      metadata: { duration, protectFromTypes }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { duration, protectFromTypes }
    };
  }

  /**
   * Apply lightning round effect
   */
  private async applyLightningRoundEffect(
    effect: any,
    gameId: string,
    userId: string
  ): Promise<{ applied: boolean; value: any }> {
    const multiplier = effect.parameters.speedBonusMultiplier || 3;
    const duration = effect.parameters.bonusDurationSeconds || 120;
    
    const activePowerUp: ActivePowerUp = {
      powerUpId: `lightning_${Date.now()}`,
      userId,
      type: PowerUpType.LIGHTNING_ROUND,
      effects: [effect],
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 1000),
      isActive: true,
      metadata: { multiplier, duration }
    };

    this.addActivePowerUp(gameId, activePowerUp);

    return {
      applied: true,
      value: { speedBonusMultiplier: multiplier, duration }
    };
  }

  /**
   * Add active power-up to game state
   */
  private addActivePowerUp(gameId: string, powerUp: ActivePowerUp): void {
    const gameState = this.gamePowerUpStates.get(gameId);
    if (!gameState) {
      logger.warn('Game power-up state not found', { gameId });
      return;
    }

    if (!gameState.activePowerUps.has(powerUp.userId)) {
      gameState.activePowerUps.set(powerUp.userId, []);
    }

    gameState.activePowerUps.get(powerUp.userId)!.push(powerUp);

    // Emit event for real-time updates
    this.emit('powerup:effect_applied', gameId, powerUp);
  }

  /**
   * Check if power-up is on cooldown
   */
  private isOnCooldown(userId: string, powerUpId: string): boolean {
    const userCooldowns = this.cooldowns.get(userId);
    if (!userCooldowns) return false;

    const cooldownEnd = userCooldowns.get(powerUpId);
    if (!cooldownEnd) return false;

    return new Date() < cooldownEnd;
  }

  /**
   * Set cooldown for power-up
   */
  private setCooldown(userId: string, powerUpId: string, cooldownSeconds: number): void {
    if (!this.cooldowns.has(userId)) {
      this.cooldowns.set(userId, new Map());
    }

    const cooldownEnd = new Date(Date.now() + cooldownSeconds * 1000);
    this.cooldowns.get(userId)!.set(powerUpId, cooldownEnd);

    // Schedule cooldown end event
    setTimeout(() => {
      this.emit('powerup:cooldown_ended', powerUpId, userId);
    }, cooldownSeconds * 1000);
  }

  /**
   * Check if usage limit exceeded
   */
  private hasExceededUsageLimit(gameId: string, userId: string, powerUpId: string, maxUses?: number): boolean {
    if (!maxUses) return false;

    const gameState = this.gamePowerUpStates.get(gameId);
    if (!gameState) return false;

    const userUsage = gameState.playerUsageCounts.get(userId);
    if (!userUsage) return false;

    const currentUsage = userUsage.get(powerUpId) || 0;
    return currentUsage >= maxUses;
  }

  /**
   * Increment usage count
   */
  private incrementUsageCount(gameId: string, userId: string, powerUpId: string): void {
    const gameState = this.gamePowerUpStates.get(gameId);
    if (!gameState) return;

    if (!gameState.playerUsageCounts.has(userId)) {
      gameState.playerUsageCounts.set(userId, new Map());
    }

    const userUsage = gameState.playerUsageCounts.get(userId)!;
    const currentUsage = userUsage.get(powerUpId) || 0;
    userUsage.set(powerUpId, currentUsage + 1);
  }

  /**
   * Consume power-up from inventory
   */
  private async consumePowerUp(userId: string, powerUpId: string): Promise<void> {
    await prisma.userPowerUp.updateMany({
      where: {
        userId,
        powerUpId,
        quantity: { gt: 0 }
      },
      data: {
        quantity: { decrement: 1 },
        lastUsedAt: new Date()
      }
    });
  }

  /**
   * Log power-up usage
   */
  private async logPowerUpUsage(
    userId: string,
    powerUpId: string,
    gameId: string,
    roomId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.powerUpUsage.create({
        data: {
          userId,
          powerUpId,
          gameId,
          roomId,
          effectData: metadata
        }
      });
    } catch (error) {
      logger.error('Failed to log power-up usage', { userId, powerUpId, gameId, error });
    }
  }

  /**
   * Get active power-ups for a game
   */
  public getActivePowerUps(gameId: string, userId?: string): ActivePowerUp[] {
    const gameState = this.gamePowerUpStates.get(gameId);
    if (!gameState) return [];

    if (userId) {
      return gameState.activePowerUps.get(userId) || [];
    }

    // Return all active power-ups
    const allPowerUps: ActivePowerUp[] = [];
    for (const userPowerUps of gameState.activePowerUps.values()) {
      allPowerUps.push(...userPowerUps);
    }
    return allPowerUps;
  }

  /**
   * Clean up expired power-ups
   */
  private startCleanupRoutines(): void {
    // Clean up expired power-ups every 30 seconds
    setInterval(() => {
      this.cleanupExpiredPowerUps();
    }, 30000);

    // Clean up old cooldowns every 5 minutes
    setInterval(() => {
      this.cleanupOldCooldowns();
    }, 300000);
  }

  /**
   * Clean up expired power-ups
   */
  private cleanupExpiredPowerUps(): void {
    const now = new Date();

    for (const [gameId, gameState] of this.gamePowerUpStates) {
      for (const [userId, powerUps] of gameState.activePowerUps) {
        const activePowerUps = powerUps.filter(powerUp => {
          if (powerUp.expiresAt && now > powerUp.expiresAt) {
            this.emit('powerup:expired', powerUp.powerUpId, userId);
            return false;
          }
          return true;
        });

        gameState.activePowerUps.set(userId, activePowerUps);
      }
    }
  }

  /**
   * Clean up old cooldowns
   */
  private cleanupOldCooldowns(): void {
    const now = new Date();

    for (const [userId, userCooldowns] of this.cooldowns) {
      for (const [powerUpId, cooldownEnd] of userCooldowns) {
        if (now > cooldownEnd) {
          userCooldowns.delete(powerUpId);
        }
      }

      if (userCooldowns.size === 0) {
        this.cooldowns.delete(userId);
      }
    }
  }

  /**
   * Clean up game power-up state
   */
  public cleanupGamePowerUps(gameId: string): void {
    this.gamePowerUpStates.delete(gameId);
    logger.info('Cleaned up game power-up state', { gameId });
  }

  /**
   * Get power-up statistics
   */
  public async getPowerUpStatistics(powerUpId?: string): Promise<any> {
    const whereClause = powerUpId ? { powerUpId } : {};

    const usage = await prisma.powerUpUsage.groupBy({
      by: ['powerUpId'],
      where: whereClause,
      _count: {
        id: true
      },
      _avg: {
        effectiveness: true
      }
    });

    return usage;
  }

  /**
   * Update power-up configuration
   */
  public updateConfig(newConfig: Partial<PowerUpServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('PowerUpService configuration updated', { newConfig });
  }
}
