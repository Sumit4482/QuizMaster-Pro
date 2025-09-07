/**
 * Phase 2.3: Service Initializer
 * Initializes and integrates all Phase 2.3 enhanced multiplayer services
 */

import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { getPhase23Config, validateConfig, logConfiguration, Phase23Config } from '@/config/enhancedMultiplayer';

// Import all Phase 2.3 services
import { PowerUpService } from './powerUpService';
import { SocialService } from './socialService';
import { EnhancedRoomService } from './enhancedRoomService';
import { GameModeService } from './gameModeService';
import { SpectatorService } from './spectatorService';
import { AchievementService } from './achievementService';
import { EnhancedMultiplayerService } from './enhancedMultiplayerService';

// Import socket handlers
import { EnhancedMultiplayerHandlers } from '@/sockets/handlers/enhancedMultiplayerHandlers';

export class Phase23Initializer {
  private static instance: Phase23Initializer | null = null;
  private config: Phase23Config;
  private isInitialized: boolean = false;
  
  // Service instances
  private powerUpService?: PowerUpService;
  private socialService?: SocialService;
  private enhancedRoomService?: EnhancedRoomService;
  private gameModeService?: GameModeService;
  private spectatorService?: SpectatorService;
  private achievementService?: AchievementService;
  private enhancedMultiplayerService?: EnhancedMultiplayerService;
  
  // Socket handler instance
  private enhancedHandlers?: EnhancedMultiplayerHandlers;

  private constructor() {
    this.config = getPhase23Config();
  }

  public static getInstance(): Phase23Initializer {
    if (!Phase23Initializer.instance) {
      Phase23Initializer.instance = new Phase23Initializer();
    }
    return Phase23Initializer.instance;
  }

  /**
   * Initialize all Phase 2.3 services
   */
  public async initialize(io: Server): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.warn('Phase 2.3 services already initialized');
        return;
      }

      logger.info('Initializing Phase 2.3 Enhanced Multiplayer Services...');

      // Validate configuration
      const validation = validateConfig(this.config);
      if (!validation.isValid) {
        logger.error('Phase 2.3 configuration validation failed', { errors: validation.errors });
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      // Log configuration
      logConfiguration(this.config);

      // Initialize services in dependency order
      await this.initializeServices(io);

      // Setup socket event handlers
      this.setupSocketHandlers();

      // Setup service integrations
      await this.setupServiceIntegrations();

      // Start background processes
      this.startBackgroundProcesses();

      this.isInitialized = true;
      
      logger.info('Phase 2.3 Enhanced Multiplayer Services initialized successfully', {
        enabledFeatures: this.getEnabledFeatures(),
        serviceCount: this.getInitializedServiceCount()
      });

    } catch (error) {
      logger.error('Failed to initialize Phase 2.3 services', { error });
      throw error;
    }
  }

  /**
   * Initialize individual services
   */
  private async initializeServices(io: Server): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Initialize Power-up Service
      if (this.config.featureFlags.enablePowerUps) {
        logger.debug('Initializing PowerUp Service...');
        this.powerUpService = PowerUpService.getInstance({
          enablePowerUps: this.config.enhancedMultiplayer.powerUps.enabled,
          maxActivePowerUpsPerPlayer: this.config.enhancedMultiplayer.powerUps.maxActivePowerUpsPerPlayer,
          globalCooldownSeconds: this.config.enhancedMultiplayer.powerUps.globalCooldownSeconds,
          allowSimultaneousEffects: true,
          effectQueueSize: 10,
          balancing: this.config.enhancedMultiplayer.powerUps.balancing as any
        });
        logger.debug('PowerUp Service initialized');
      }

      // Initialize Social Service
      if (this.config.featureFlags.enableSocialFeatures) {
        logger.debug('Initializing Social Service...');
        this.socialService = SocialService.getInstance();
        logger.debug('Social Service initialized');
      }

      // Initialize Enhanced Room Service
      if (this.config.featureFlags.enableRoomDiscovery) {
        logger.debug('Initializing Enhanced Room Service...');
        this.enhancedRoomService = EnhancedRoomService.getInstance({
          maxRoomsPerUser: this.config.enhancedMultiplayer.rooms.maxRoomsPerUser,
          maxSpectators: this.config.enhancedMultiplayer.rooms.maxSpectators,
          roomInactivityTimeout: 30,
          autoCleanupInterval: 10,
          discovery: {
            maxResults: 50,
            cacheTimeout: 300,
            enableRecommendations: true,
            recommendationEngine: 'basic'
          },
          analytics: {
            enableRealTime: this.config.enhancedMultiplayer.rooms.enableAnalytics,
            aggregationInterval: this.config.analytics.aggregationIntervalMinutes,
            retentionPeriod: Math.floor(this.config.analytics.dataRetentionDays)
          },
          moderation: {
            autoModeration: this.config.security.enableAntiCheat,
            reportThreshold: 5,
            banDurationDefault: 60,
            maxModerationActions: 10
          },
          features: {
            enableVoiceChat: false,
            enableScreenShare: false,
            enableRecording: false,
            enableCustomThemes: false
          }
        });
        logger.debug('Enhanced Room Service initialized');
      }

      // Initialize Game Mode Service
      if (this.config.featureFlags.enableAdvancedGameModes) {
        logger.debug('Initializing Game Mode Service...');
        this.gameModeService = GameModeService.getInstance({
          enabledModes: this.config.enhancedMultiplayer.gameModes.enabledModes,
          defaultConfigs: {} as any, // Will be populated by service
          customModeLimit: 10,
          allowModeVoting: this.config.enhancedMultiplayer.gameModes.enableModeVoting,
          modeRotation: {
            enabled: false,
            rotationModes: [],
            rotationIntervalMinutes: 60
          }
        });
        logger.debug('Game Mode Service initialized');
      }

      // Initialize Spectator Service
      if (this.config.featureFlags.enableSpectatorMode) {
        logger.debug('Initializing Spectator Service...');
        this.spectatorService = SpectatorService.getInstance();
        logger.debug('Spectator Service initialized');
      }

      // Initialize Achievement Service
      if (this.config.featureFlags.enableAchievements) {
        logger.debug('Initializing Achievement Service...');
        this.achievementService = AchievementService.getInstance();
        logger.debug('Achievement Service initialized');
      }

      // Initialize Enhanced Multiplayer Coordinator Service
      logger.debug('Initializing Enhanced Multiplayer Coordinator...');
      this.enhancedMultiplayerService = EnhancedMultiplayerService.getInstance(
        this.config.enhancedMultiplayer,
        io
      );
      logger.debug('Enhanced Multiplayer Coordinator initialized');

      const initTime = Date.now() - startTime;
      logger.info('All Phase 2.3 services initialized', { 
        initializationTime: `${initTime}ms`,
        servicesInitialized: this.getInitializedServiceCount()
      });

    } catch (error) {
      logger.error('Failed to initialize services', { error });
      throw error;
    }
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(): void {
    try {
      logger.debug('Setting up Phase 2.3 socket handlers...');
      this.enhancedHandlers = new EnhancedMultiplayerHandlers();
      logger.debug('Phase 2.3 socket handlers ready');
    } catch (error) {
      logger.error('Failed to setup socket handlers', { error });
      throw error;
    }
  }

  /**
   * Setup service integrations
   */
  private async setupServiceIntegrations(): Promise<void> {
    try {
      logger.debug('Setting up service integrations...');

      // Service integrations are handled by the EnhancedMultiplayerService
      // Additional custom integrations can be added here

      // Example: Setup achievement tracking for social activities
      if (this.socialService && this.achievementService) {
        this.socialService.on('friend:request_sent', (data) => {
          this.achievementService!.trackUserMetrics(data.fromUserId, {
            friend_requests_sent: 1
          });
        });

        this.socialService.on('chat:message_sent', (data) => {
          this.achievementService!.trackUserMetrics(data.message.userId, {
            chat_messages: 1
          });
        });
      }

      // Setup spectator achievement tracking
      if (this.spectatorService && this.achievementService) {
        this.spectatorService.on('spectator:joined', (data) => {
          // Track hosting achievements for the game host
          const gameState = this.enhancedMultiplayerService?.getGameIntegrationState(data.gameId);
          if (gameState) {
            this.achievementService!.trackUserMetrics(gameState.hostUserId, {
              spectators_attracted: 1,
              max_spectators: data.totalSpectators
            }, data.gameId);
          }
        });
      }

      logger.debug('Service integrations setup complete');

    } catch (error) {
      logger.error('Failed to setup service integrations', { error });
      throw error;
    }
  }

  /**
   * Start background processes
   */
  private startBackgroundProcesses(): void {
    try {
      logger.debug('Starting background processes...');

      // Start performance monitoring if enabled
      if (this.config.analytics.enablePerformanceMonitoring) {
        this.startPerformanceMonitoring();
      }

      // Start health checks
      this.startHealthChecks();

      // Start cleanup routines (handled by individual services)

      logger.debug('Background processes started');

    } catch (error) {
      logger.error('Failed to start background processes', { error });
      throw error;
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Monitor system performance every 30 seconds
    setInterval(() => {
      try {
        const systemStatus = this.enhancedMultiplayerService?.getSystemStatus();
        
        if (systemStatus) {
          const metrics = systemStatus.performanceMetrics;
          
          // Log performance metrics
          logger.debug('Performance metrics', {
            activeGames: metrics.activeGames,
            activePlayers: metrics.activePlayers,
            activeSpectators: metrics.activeSpectators,
            systemLoad: metrics.systemLoad
          });

          // Check for performance issues
          if (metrics.activeGames > this.config.enhancedMultiplayer.performance.maxConcurrentGames * 0.9) {
            logger.warn('Approaching maximum concurrent games limit', {
              current: metrics.activeGames,
              limit: this.config.enhancedMultiplayer.performance.maxConcurrentGames
            });
          }

          if (metrics.systemLoad > 0.8) {
            logger.warn('High system load detected', {
              systemLoad: metrics.systemLoad
            });
          }
        }
      } catch (error) {
        logger.error('Performance monitoring error', { error });
      }
    }, 30000);
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    // Run health checks every 5 minutes
    setInterval(() => {
      try {
        const healthStatus = this.getHealthStatus();
        
        if (!healthStatus.isHealthy) {
          logger.warn('Health check failed', {
            failedServices: healthStatus.failedServices,
            issues: healthStatus.issues
          });
        } else {
          logger.debug('Health check passed', {
            activeServices: healthStatus.activeServices
          });
        }
      } catch (error) {
        logger.error('Health check error', { error });
      }
    }, 300000);
  }

  /**
   * Setup socket handlers for a connection
   */
  public setupSocketConnection(socket: any): void {
    if (!this.isInitialized || !this.enhancedHandlers) {
      logger.warn('Phase 2.3 services not initialized, skipping enhanced handlers');
      return;
    }

    try {
      this.enhancedHandlers.setupEnhancedHandlers(socket);
      logger.debug('Enhanced multiplayer handlers setup for socket', { socketId: socket.id });
    } catch (error) {
      logger.error('Failed to setup enhanced handlers for socket', { 
        socketId: socket.id, 
        error: error instanceof Error ? error.message : error 
      });
    }
  }

  /**
   * Get initialization status
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get configuration
   */
  public getConfiguration(): Phase23Config {
    return this.config;
  }

  /**
   * Get enabled features
   */
  public getEnabledFeatures(): string[] {
    const features: string[] = [];
    
    if (this.config.featureFlags.enablePowerUps) features.push('Power-ups');
    if (this.config.featureFlags.enableSocialFeatures) features.push('Social Features');
    if (this.config.featureFlags.enableSpectatorMode) features.push('Spectator Mode');
    if (this.config.featureFlags.enableAdvancedGameModes) features.push('Advanced Game Modes');
    if (this.config.featureFlags.enableAchievements) features.push('Achievements');
    if (this.config.featureFlags.enableRoomDiscovery) features.push('Room Discovery');
    if (this.config.featureFlags.enableMobileOptimizations) features.push('Mobile Optimizations');
    if (this.config.featureFlags.enableAnalytics) features.push('Analytics');
    
    return features;
  }

  /**
   * Get initialized service count
   */
  public getInitializedServiceCount(): number {
    let count = 0;
    
    if (this.powerUpService) count++;
    if (this.socialService) count++;
    if (this.enhancedRoomService) count++;
    if (this.gameModeService) count++;
    if (this.spectatorService) count++;
    if (this.achievementService) count++;
    if (this.enhancedMultiplayerService) count++;
    
    return count;
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    isHealthy: boolean;
    activeServices: string[];
    failedServices: string[];
    issues: string[];
  } {
    const activeServices: string[] = [];
    const failedServices: string[] = [];
    const issues: string[] = [];

    // Check each service
    try {
      if (this.powerUpService) activeServices.push('PowerUp');
      else if (this.config.featureFlags.enablePowerUps) failedServices.push('PowerUp');
    } catch (error) {
      failedServices.push('PowerUp');
      issues.push('PowerUp service error');
    }

    try {
      if (this.socialService) activeServices.push('Social');
      else if (this.config.featureFlags.enableSocialFeatures) failedServices.push('Social');
    } catch (error) {
      failedServices.push('Social');
      issues.push('Social service error');
    }

    try {
      if (this.enhancedRoomService) activeServices.push('EnhancedRoom');
      else if (this.config.featureFlags.enableRoomDiscovery) failedServices.push('EnhancedRoom');
    } catch (error) {
      failedServices.push('EnhancedRoom');
      issues.push('EnhancedRoom service error');
    }

    try {
      if (this.gameModeService) activeServices.push('GameMode');
      else if (this.config.featureFlags.enableAdvancedGameModes) failedServices.push('GameMode');
    } catch (error) {
      failedServices.push('GameMode');
      issues.push('GameMode service error');
    }

    try {
      if (this.spectatorService) activeServices.push('Spectator');
      else if (this.config.featureFlags.enableSpectatorMode) failedServices.push('Spectator');
    } catch (error) {
      failedServices.push('Spectator');
      issues.push('Spectator service error');
    }

    try {
      if (this.achievementService) activeServices.push('Achievement');
      else if (this.config.featureFlags.enableAchievements) failedServices.push('Achievement');
    } catch (error) {
      failedServices.push('Achievement');
      issues.push('Achievement service error');
    }

    try {
      if (this.enhancedMultiplayerService) activeServices.push('EnhancedMultiplayer');
      else failedServices.push('EnhancedMultiplayer');
    } catch (error) {
      failedServices.push('EnhancedMultiplayer');
      issues.push('EnhancedMultiplayer service error');
    }

    return {
      isHealthy: failedServices.length === 0 && issues.length === 0,
      activeServices,
      failedServices,
      issues
    };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Phase 2.3 services...');

      // Shutdown services in reverse order
      if (this.enhancedMultiplayerService) {
        // EnhancedMultiplayerService handles coordination shutdown
        logger.debug('Shutting down Enhanced Multiplayer Service...');
      }

      // Individual service cleanup is handled by their respective destructors
      // and cleanup routines

      this.isInitialized = false;
      
      logger.info('Phase 2.3 services shutdown complete');

    } catch (error) {
      logger.error('Error during Phase 2.3 services shutdown', { error });
      throw error;
    }
  }

  /**
   * Update configuration
   */
  public updateConfiguration(newConfig: Partial<Phase23Config>): void {
    try {
      logger.info('Updating Phase 2.3 configuration...');
      
      this.config = { ...this.config, ...newConfig };
      
      // Update individual service configurations
      if (newConfig.enhancedMultiplayer && this.enhancedMultiplayerService) {
        this.enhancedMultiplayerService.updateConfiguration(newConfig.enhancedMultiplayer);
      }

      logger.info('Phase 2.3 configuration updated successfully');

    } catch (error) {
      logger.error('Failed to update Phase 2.3 configuration', { error });
      throw error;
    }
  }

  /**
   * Get service statistics
   */
  public async getServiceStatistics(): Promise<any> {
    try {
      const stats: any = {
        timestamp: new Date(),
        uptime: this.isInitialized ? Date.now() - 0 : 0, // Would track actual uptime
        services: {}
      };

      // Get statistics from each service
      if (this.powerUpService) {
        stats.services.powerUps = await this.powerUpService.getPowerUpStatistics();
      }

      if (this.achievementService) {
        stats.services.achievements = await this.achievementService.getAchievementStatistics();
      }

      if (this.enhancedMultiplayerService) {
        stats.services.enhancedMultiplayer = this.enhancedMultiplayerService.getSystemStatus();
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get service statistics', { error });
      throw error;
    }
  }
}
