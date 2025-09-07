/**
 * Phase 2.3: Power-up System Types
 * Enhanced multiplayer power-up system definitions
 */

// Power-up basic types matching Prisma enums
export enum PowerUpType {
  ELIMINATION = 'ELIMINATION',         // Remove incorrect answers
  TIME_EXTENSION = 'TIME_EXTENSION',   // Add extra time
  POINT_MULTIPLIER = 'POINT_MULTIPLIER', // Double/triple points
  FREEZE_OPPONENTS = 'FREEZE_OPPONENTS', // Freeze other players
  HINT_REVEAL = 'HINT_REVEAL',         // Show hints
  ANSWER_PEEK = 'ANSWER_PEEK',         // Briefly show answer
  SCORE_SHIELD = 'SCORE_SHIELD',       // Protection from penalties
  LIGHTNING_ROUND = 'LIGHTNING_ROUND'  // Speed bonus
}

export enum PowerUpRarity {
  COMMON = 'COMMON',
  RARE = 'RARE',
  EPIC = 'EPIC',
  LEGENDARY = 'LEGENDARY'
}

// Power-up effect configuration
export interface PowerUpEffect {
  type: 'immediate' | 'timed' | 'conditional';
  duration?: number; // seconds
  intensity: number; // 0.0 to 1.0
  parameters: Record<string, any>;
}

// Power-up definition from database
export interface PowerUp {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: PowerUpType;
  rarity: PowerUpRarity;
  effects: PowerUpEffect[];
  cooldownSeconds: number;
  maxUsesPerGame?: number;
  cost: number;
  iconUrl?: string;
  animationData?: any;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// User's power-up inventory
export interface UserPowerUp {
  id: string;
  userId: string;
  powerUpId: string;
  quantity: number;
  earnedAt: Date;
  lastUsedAt?: Date;
  powerUp?: PowerUp;
}

// Power-up usage tracking
export interface PowerUpUsage {
  id: string;
  userId: string;
  powerUpId: string;
  gameId: string;
  roomId: string;
  questionIndex?: number;
  effectData?: any;
  usedAt: Date;
  effectiveness?: number;
}

// Runtime power-up state during gameplay
export interface ActivePowerUp {
  powerUpId: string;
  userId: string;
  type: PowerUpType;
  effects: PowerUpEffect[];
  activatedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

// Power-up activation payload
export interface PowerUpActivationPayload {
  powerUpId: string;
  roomId: string;
  gameId: string;
  targetUserId?: string; // For targeted power-ups
  metadata?: Record<string, any>;
}

// Power-up effect result
export interface PowerUpEffectResult {
  success: boolean;
  powerUpId: string;
  userId: string;
  type: PowerUpType;
  effects: Array<{
    type: string;
    applied: boolean;
    value?: any;
    error?: string;
  }>;
  metadata?: Record<string, any>;
}

// Game-specific power-up state
export interface GamePowerUpState {
  gameId: string;
  roomId: string;
  activePowerUps: Map<string, ActivePowerUp[]>; // userId -> power-ups
  playerCooldowns: Map<string, Map<string, Date>>; // userId -> powerUpId -> cooldownEndTime
  playerUsageCounts: Map<string, Map<string, number>>; // userId -> powerUpId -> usageCount
  globalEffects: ActivePowerUp[]; // Effects that apply to all players
}

// Power-up service configuration
export interface PowerUpServiceConfig {
  enablePowerUps: boolean;
  maxActivePowerUpsPerPlayer: number;
  globalCooldownSeconds: number;
  allowSimultaneousEffects: boolean;
  effectQueueSize: number;
  balancing: {
    rarityWeights: Record<PowerUpRarity, number>;
    typeBalancing: Record<PowerUpType, {
      effectiveness: number;
      cooldownMultiplier: number;
      usageLimiter: number;
    }>;
  };
}

// Specific power-up effect configurations
export interface EliminationEffectConfig {
  eliminationCount: number; // Number of incorrect options to remove
  revealDuration: number; // How long to show eliminated options
  preventRandom: boolean; // Prevent random elimination
}

export interface TimeExtensionEffectConfig {
  additionalSeconds: number;
  maxTotalExtension: number; // Prevent infinite extension
  visualCountdown: boolean;
}

export interface PointMultiplierEffectConfig {
  multiplier: number; // 2x, 3x, etc.
  duration: number; // How long the multiplier lasts
  affectsBonuses: boolean; // Whether it affects time/streak bonuses
}

export interface FreezeOpponentsEffectConfig {
  freezeDurationSeconds: number;
  targetMode: 'all' | 'random' | 'top_players' | 'specific';
  targetCount?: number;
  showFreezeEffect: boolean;
}

export interface HintRevealEffectConfig {
  hintType: 'category' | 'explanation' | 'custom';
  revealDuration: number;
  hintContent?: string;
}

export interface AnswerPeekEffectConfig {
  peekDurationMs: number;
  highlightCorrect: boolean;
  blurIncorrect: boolean;
}

export interface ScoreShieldEffectConfig {
  protectionDuration: number;
  protectFromTypes: Array<'wrong_answer' | 'time_penalty' | 'streak_break'>;
  maxProtectedPoints: number;
}

export interface LightningRoundEffectConfig {
  speedBonusMultiplier: number;
  bonusDurationSeconds: number;
  visualEffects: boolean;
}

// Power-up event types for Socket.io
export interface PowerUpSocketEvents {
  'powerup:activate': (payload: PowerUpActivationPayload) => void;
  'powerup:activated': (result: PowerUpEffectResult) => void;
  'powerup:expired': (powerUpId: string, userId: string) => void;
  'powerup:cooldown_ended': (powerUpId: string, userId: string) => void;
  'powerup:inventory_updated': (userId: string, inventory: UserPowerUp[]) => void;
  'powerup:effect_applied': (gameId: string, effect: ActivePowerUp) => void;
  'powerup:effect_ended': (gameId: string, powerUpId: string, userId: string) => void;
}

// Power-up error types
export class PowerUpError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'PowerUpError';
  }
}

export enum PowerUpErrorCode {
  POWER_UP_NOT_FOUND = 'POWER_UP_NOT_FOUND',
  INSUFFICIENT_QUANTITY = 'INSUFFICIENT_QUANTITY',
  COOLDOWN_ACTIVE = 'COOLDOWN_ACTIVE',
  USAGE_LIMIT_REACHED = 'USAGE_LIMIT_REACHED',
  INVALID_GAME_STATE = 'INVALID_GAME_STATE',
  POWER_UP_DISABLED = 'POWER_UP_DISABLED',
  EFFECT_FAILED = 'EFFECT_FAILED',
  INVALID_TARGET = 'INVALID_TARGET',
  ALREADY_ACTIVE = 'ALREADY_ACTIVE',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS'
}
