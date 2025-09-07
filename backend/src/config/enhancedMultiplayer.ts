/**
 * Phase 2.3: Enhanced Multiplayer Configuration
 * Configuration for all Phase 2.3 enhanced multiplayer features
 */

import { GameMode } from '@/types/gameModes';
import { PowerUpRarity } from '@/types/powerups';
import { EnhancedMultiplayerConfig } from '@/services/enhancedMultiplayerService';

/**
 * Default configuration for Enhanced Multiplayer features
 */
export const enhancedMultiplayerConfig: EnhancedMultiplayerConfig = {
  // Power-up System Configuration
  powerUps: {
    enabled: true,
    maxActivePowerUpsPerPlayer: 3,
    globalCooldownSeconds: 30,
    balancing: {
      rarityWeights: {
        [PowerUpRarity.COMMON]: 1.0,
        [PowerUpRarity.RARE]: 0.7,
        [PowerUpRarity.EPIC]: 0.4,
        [PowerUpRarity.LEGENDARY]: 0.1
      },
      effectLimits: {
        elimination: 2, // Max options to eliminate
        timeExtension: 30, // Max seconds to add
        pointMultiplier: 3, // Max point multiplier
        freezeDuration: 15, // Max freeze duration in seconds
      }
    }
  },

  // Social Features Configuration
  social: {
    enableChat: true,
    enableReactions: true,
    enableFriendSystem: true,
    moderationLevel: 'basic',
    maxChatMessagesPerMinute: 10
  },

  // Enhanced Room Configuration
  rooms: {
    maxRoomsPerUser: 5,
    maxSpectators: 100,
    enableRoomDiscovery: true,
    enableAnalytics: true
  },

  // Game Modes Configuration
  gameModes: {
    enabledModes: [
      GameMode.CLASSIC,
      GameMode.SPEED_ROUND,
      GameMode.ELIMINATION,
      GameMode.TEAM_BATTLE,
      GameMode.TOURNAMENT,
      GameMode.SURVIVAL,
      GameMode.BLITZ
    ],
    allowCustomModes: true,
    enableModeVoting: true
  },

  // Spectator Features Configuration
  spectators: {
    enabled: true,
    maxSpectatorsPerRoom: 50,
    enablePredictions: true,
    enablePolls: true
  },

  // Achievement System Configuration
  achievements: {
    enabled: true,
    enableRealTimeTracking: true,
    enableNotifications: true
  },

  // Performance Configuration
  performance: {
    maxConcurrentGames: 100,
    maxPlayersPerGame: 50,
    enableLoadBalancing: true
  }
};

/**
 * Environment-specific configurations
 */
export const getEnhancedMultiplayerConfig = (environment: string = 'development'): EnhancedMultiplayerConfig => {
  const baseConfig = { ...enhancedMultiplayerConfig };

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        performance: {
          ...baseConfig.performance,
          maxConcurrentGames: 20,
          maxPlayersPerGame: 20
        },
        social: {
          ...baseConfig.social,
          moderationLevel: 'none' // Easier testing in development
        }
      };

    case 'testing':
      return {
        ...baseConfig,
        performance: {
          ...baseConfig.performance,
          maxConcurrentGames: 5,
          maxPlayersPerGame: 10
        },
        powerUps: {
          ...baseConfig.powerUps,
          globalCooldownSeconds: 5 // Faster testing
        }
      };

    case 'staging':
      return {
        ...baseConfig,
        performance: {
          ...baseConfig.performance,
          maxConcurrentGames: 50,
          maxPlayersPerGame: 30
        }
      };

    case 'production':
      return {
        ...baseConfig,
        social: {
          ...baseConfig.social,
          moderationLevel: 'strict' // Strict moderation in production
        },
        performance: {
          ...baseConfig.performance,
          enableLoadBalancing: true
        }
      };

    default:
      return baseConfig;
  }
};

/**
 * Feature flag configuration
 */
export interface FeatureFlags {
  enablePowerUps: boolean;
  enableSocialFeatures: boolean;
  enableSpectatorMode: boolean;
  enableAdvancedGameModes: boolean;
  enableAchievements: boolean;
  enableRoomDiscovery: boolean;
  enableMobileOptimizations: boolean;
  enableAnalytics: boolean;
  enableBetaFeatures: boolean;
}

export const defaultFeatureFlags: FeatureFlags = {
  enablePowerUps: true,
  enableSocialFeatures: true,
  enableSpectatorMode: true,
  enableAdvancedGameModes: true,
  enableAchievements: true,
  enableRoomDiscovery: true,
  enableMobileOptimizations: true,
  enableAnalytics: true,
  enableBetaFeatures: false
};

/**
 * Get feature flags from environment variables
 */
export const getFeatureFlags = (): FeatureFlags => {
  return {
    enablePowerUps: process.env.FEATURE_POWER_UPS !== 'false',
    enableSocialFeatures: process.env.FEATURE_SOCIAL !== 'false',
    enableSpectatorMode: process.env.FEATURE_SPECTATOR !== 'false',
    enableAdvancedGameModes: process.env.FEATURE_GAME_MODES !== 'false',
    enableAchievements: process.env.FEATURE_ACHIEVEMENTS !== 'false',
    enableRoomDiscovery: process.env.FEATURE_ROOM_DISCOVERY !== 'false',
    enableMobileOptimizations: process.env.FEATURE_MOBILE !== 'false',
    enableAnalytics: process.env.FEATURE_ANALYTICS !== 'false',
    enableBetaFeatures: process.env.FEATURE_BETA === 'true'
  };
};

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  powerUpActivation: {
    windowMs: number;
    max: number;
  };
  chatMessages: {
    windowMs: number;
    max: number;
  };
  friendRequests: {
    windowMs: number;
    max: number;
  };
  roomCreation: {
    windowMs: number;
    max: number;
  };
  spectatorActions: {
    windowMs: number;
    max: number;
  };
}

export const rateLimitConfig: RateLimitConfig = {
  powerUpActivation: {
    windowMs: 60 * 1000, // 1 minute
    max: 10 // Max 10 power-ups per minute per user
  },
  chatMessages: {
    windowMs: 60 * 1000, // 1 minute
    max: 15 // Max 15 messages per minute per user
  },
  friendRequests: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20 // Max 20 friend requests per hour per user
  },
  roomCreation: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5 // Max 5 room creations per 10 minutes per user
  },
  spectatorActions: {
    windowMs: 60 * 1000, // 1 minute
    max: 30 // Max 30 spectator actions per minute per user
  }
};

/**
 * Mobile optimization configuration
 */
export interface MobileConfig {
  enableTouchOptimizations: boolean;
  enableHapticFeedback: boolean;
  enablePushNotifications: boolean;
  enableOfflineMode: boolean;
  touchTargetSizeMin: number; // pixels
  gestureTimeout: number; // ms
  batteryOptimizations: boolean;
  compressionLevel: 'low' | 'medium' | 'high';
}

export const mobileConfig: MobileConfig = {
  enableTouchOptimizations: true,
  enableHapticFeedback: true,
  enablePushNotifications: true,
  enableOfflineMode: false, // Phase 2.3 focus is on real-time features
  touchTargetSizeMin: 44, // iOS recommendation
  gestureTimeout: 300,
  batteryOptimizations: true,
  compressionLevel: 'medium'
};

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  enableRealTimeAnalytics: boolean;
  enableUserBehaviorTracking: boolean;
  enablePerformanceMonitoring: boolean;
  dataRetentionDays: number;
  aggregationIntervalMinutes: number;
  enableHeatmaps: boolean;
  enableErrorTracking: boolean;
  samplingRate: number; // 0.0 to 1.0
}

export const analyticsConfig: AnalyticsConfig = {
  enableRealTimeAnalytics: true,
  enableUserBehaviorTracking: true,
  enablePerformanceMonitoring: true,
  dataRetentionDays: 90,
  aggregationIntervalMinutes: 5,
  enableHeatmaps: false, // Can be resource intensive
  enableErrorTracking: true,
  samplingRate: 1.0 // Track all events in development, reduce in production
};

/**
 * Security configuration
 */
export interface SecurityConfig {
  enableInputSanitization: boolean;
  enableRateLimiting: boolean;
  enableAntiCheat: boolean;
  maxMessageLength: number;
  allowedFileTypes: string[];
  enableContentFiltering: boolean;
  enableSpamDetection: boolean;
  suspiciousActivityThreshold: number;
}

export const securityConfig: SecurityConfig = {
  enableInputSanitization: true,
  enableRateLimiting: true,
  enableAntiCheat: true,
  maxMessageLength: 500,
  allowedFileTypes: ['jpg', 'jpeg', 'png', 'gif'], // For avatars/images
  enableContentFiltering: true,
  enableSpamDetection: true,
  suspiciousActivityThreshold: 10 // Actions per minute that trigger investigation
};

/**
 * Notification configuration
 */
export interface NotificationConfig {
  enablePushNotifications: boolean;
  enableEmailNotifications: boolean;
  enableInAppNotifications: boolean;
  enableSoundEffects: boolean;
  defaultSettings: {
    friendRequests: boolean;
    gameInvites: boolean;
    achievements: boolean;
    powerUpEffects: boolean;
    spectatorEvents: boolean;
  };
}

export const notificationConfig: NotificationConfig = {
  enablePushNotifications: true,
  enableEmailNotifications: false, // Keep simple for Phase 2.3
  enableInAppNotifications: true,
  enableSoundEffects: true,
  defaultSettings: {
    friendRequests: true,
    gameInvites: true,
    achievements: true,
    powerUpEffects: false, // Can be noisy
    spectatorEvents: false
  }
};

/**
 * Redis configuration for Phase 2.3 features
 */
export interface RedisConfig {
  enableRedis: boolean;
  useForSessions: boolean;
  useForRealTimeData: boolean;
  useForAnalytics: boolean;
  keyPrefix: string;
  ttlDefaults: {
    gameState: number; // seconds
    userSession: number;
    analytics: number;
    powerUpCooldown: number;
  };
}

export const redisConfig: RedisConfig = {
  enableRedis: true,
  useForSessions: true,
  useForRealTimeData: true,
  useForAnalytics: true,
  keyPrefix: 'qmp23:', // QuizMaster Pro Phase 2.3
  ttlDefaults: {
    gameState: 3600, // 1 hour
    userSession: 86400, // 24 hours
    analytics: 604800, // 1 week
    powerUpCooldown: 300 // 5 minutes
  }
};

/**
 * Load balancing configuration
 */
export interface LoadBalancingConfig {
  enableLoadBalancing: boolean;
  strategy: 'round_robin' | 'least_connections' | 'resource_based';
  healthCheckInterval: number; // seconds
  failoverTimeout: number; // seconds
  maxConnectionsPerNode: number;
  enableAutoScaling: boolean;
}

export const loadBalancingConfig: LoadBalancingConfig = {
  enableLoadBalancing: false, // Single instance for Phase 2.3
  strategy: 'least_connections',
  healthCheckInterval: 30,
  failoverTimeout: 5,
  maxConnectionsPerNode: 1000,
  enableAutoScaling: false
};

/**
 * Complete Phase 2.3 configuration
 */
export interface Phase23Config {
  enhancedMultiplayer: EnhancedMultiplayerConfig;
  featureFlags: FeatureFlags;
  rateLimit: RateLimitConfig;
  mobile: MobileConfig;
  analytics: AnalyticsConfig;
  security: SecurityConfig;
  notifications: NotificationConfig;
  redis: RedisConfig;
  loadBalancing: LoadBalancingConfig;
}

/**
 * Get complete Phase 2.3 configuration
 */
export const getPhase23Config = (environment: string = process.env.NODE_ENV || 'development'): Phase23Config => {
  return {
    enhancedMultiplayer: getEnhancedMultiplayerConfig(environment),
    featureFlags: getFeatureFlags(),
    rateLimit: rateLimitConfig,
    mobile: mobileConfig,
    analytics: {
      ...analyticsConfig,
      // Reduce sampling rate in production for performance
      samplingRate: environment === 'production' ? 0.1 : 1.0
    },
    security: securityConfig,
    notifications: notificationConfig,
    redis: redisConfig,
    loadBalancing: {
      ...loadBalancingConfig,
      enableLoadBalancing: environment === 'production'
    }
  };
};

/**
 * Validate configuration
 */
export const validateConfig = (config: Phase23Config): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Validate power-up configuration
  if (config.enhancedMultiplayer.powerUps.maxActivePowerUpsPerPlayer < 1) {
    errors.push('maxActivePowerUpsPerPlayer must be at least 1');
  }

  if (config.enhancedMultiplayer.powerUps.globalCooldownSeconds < 0) {
    errors.push('globalCooldownSeconds cannot be negative');
  }

  // Validate performance limits
  if (config.enhancedMultiplayer.performance.maxConcurrentGames < 1) {
    errors.push('maxConcurrentGames must be at least 1');
  }

  if (config.enhancedMultiplayer.performance.maxPlayersPerGame < 2) {
    errors.push('maxPlayersPerGame must be at least 2');
  }

  // Validate room limits
  if (config.enhancedMultiplayer.rooms.maxRoomsPerUser < 1) {
    errors.push('maxRoomsPerUser must be at least 1');
  }

  if (config.enhancedMultiplayer.rooms.maxSpectators < 0) {
    errors.push('maxSpectators cannot be negative');
  }

  // Validate rate limits
  if (config.rateLimit.chatMessages.max < 1) {
    errors.push('Chat message rate limit max must be at least 1');
  }

  // Validate mobile configuration
  if (config.mobile.touchTargetSizeMin < 20) {
    errors.push('touchTargetSizeMin should be at least 20 pixels for accessibility');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Configuration logger
 */
export const logConfiguration = (config: Phase23Config): void => {
  const logger = require('@/config/logger').logger;
  
  logger.info('Phase 2.3 Configuration Loaded', {
    powerUpsEnabled: config.featureFlags.enablePowerUps,
    socialEnabled: config.featureFlags.enableSocialFeatures,
    spectatorEnabled: config.featureFlags.enableSpectatorMode,
    gameModesEnabled: config.featureFlags.enableAdvancedGameModes,
    achievementsEnabled: config.featureFlags.enableAchievements,
    maxConcurrentGames: config.enhancedMultiplayer.performance.maxConcurrentGames,
    maxPlayersPerGame: config.enhancedMultiplayer.performance.maxPlayersPerGame,
    enabledGameModes: config.enhancedMultiplayer.gameModes.enabledModes,
    moderationLevel: config.enhancedMultiplayer.social.moderationLevel
  });
};
