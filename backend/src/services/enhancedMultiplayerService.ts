/**
 * Phase 2.3: Enhanced Multiplayer Service
 * Integration service that coordinates all Phase 2.3 features
 */

import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { PowerUpService } from './powerUpService';
import { SocialService } from './socialService';
import { EnhancedRoomService } from './enhancedRoomService';
import { GameModeService } from './gameModeService';
import { SpectatorService } from './spectatorService';
import { AchievementService } from './achievementService';
import { GameManager } from '@/sockets/managers/gameManager';
import { GameMode } from '@/types/gameModes';
import { PowerUpType, PowerUpActivationPayload } from '@/types/powerups';
import { MessageType, ParticipantRole } from '@/types/social';

// Configuration interfaces
export interface EnhancedMultiplayerConfig {
  powerUps: {
    enabled: boolean;
    maxActivePowerUpsPerPlayer: number;
    globalCooldownSeconds: number;
    balancing: {
      rarityWeights: Record<string, number>;
      effectLimits: Record<string, number>;
    };
  };
  
  social: {
    enableChat: boolean;
    enableReactions: boolean;
    enableFriendSystem: boolean;
    moderationLevel: 'none' | 'basic' | 'strict';
    maxChatMessagesPerMinute: number;
  };
  
  rooms: {
    maxRoomsPerUser: number;
    maxSpectators: number;
    enableRoomDiscovery: boolean;
    enableAnalytics: boolean;
  };
  
  gameModes: {
    enabledModes: GameMode[];
    allowCustomModes: boolean;
    enableModeVoting: boolean;
  };
  
  spectators: {
    enabled: boolean;
    maxSpectatorsPerRoom: number;
    enablePredictions: boolean;
    enablePolls: boolean;
  };
  
  achievements: {
    enabled: boolean;
    enableRealTimeTracking: boolean;
    enableNotifications: boolean;
  };
  
  performance: {
    maxConcurrentGames: number;
    maxPlayersPerGame: number;
    enableLoadBalancing: boolean;
  };
}

// Integration events
export interface EnhancedMultiplayerEvents {
  'game:enhanced_start': (gameData: any) => void;
  'game:enhanced_end': (gameData: any) => void;
  'player:power_up_used': (data: any) => void;
  'player:achievement_earned': (data: any) => void;
  'room:social_activity': (data: any) => void;
  'spectator:milestone_reached': (data: any) => void;
  'system:performance_alert': (data: any) => void;
}

export class EnhancedMultiplayerService extends EventEmitter {
  private static instance: EnhancedMultiplayerService | null = null;
  private config: EnhancedMultiplayerConfig;
  private io: Server;
  
  // Service instances
  private powerUpService: PowerUpService;
  private socialService: SocialService;
  private enhancedRoomService: EnhancedRoomService;
  private gameModeService: GameModeService;
  private spectatorService: SpectatorService;
  private achievementService: AchievementService;
  private gameManager: GameManager;
  
  // Performance monitoring
  private performanceMetrics: {
    activeGames: number;
    activePlayers: number;
    activeSpectators: number;
    messageRate: number;
    systemLoad: number;
    lastUpdated: Date;
  } = {
    activeGames: 0,
    activePlayers: 0,
    activeSpectators: 0,
    messageRate: 0,
    systemLoad: 0,
    lastUpdated: new Date()
  };
  
  // Integration state
  private gameIntegrationState: Map<string, GameIntegrationState> = new Map();
  
  private constructor(config: EnhancedMultiplayerConfig, io: Server) {
    super();
    this.config = config;
    this.io = io;
    this.initializeServices();
  }

  public static getInstance(config?: EnhancedMultiplayerConfig, io?: Server): EnhancedMultiplayerService {
    if (!EnhancedMultiplayerService.instance) {
      if (!config || !io) {
        throw new Error('EnhancedMultiplayerService must be initialized with config and io');
      }
      EnhancedMultiplayerService.instance = new EnhancedMultiplayerService(config, io);
    }
    return EnhancedMultiplayerService.instance;
  }

  /**
   * Initialize all services and set up integration
   */
  private async initializeServices(): Promise<void> {
    try {
      logger.info('Initializing Enhanced Multiplayer Service...');

      // Initialize individual services
      this.powerUpService = PowerUpService.getInstance({
        enablePowerUps: this.config.powerUps.enabled,
        maxActivePowerUpsPerPlayer: this.config.powerUps.maxActivePowerUpsPerPlayer,
        globalCooldownSeconds: this.config.powerUps.globalCooldownSeconds,
        allowSimultaneousEffects: true,
        effectQueueSize: 10,
        balancing: this.config.powerUps.balancing as any
      });

      this.socialService = SocialService.getInstance();
      
      this.enhancedRoomService = EnhancedRoomService.getInstance({
        maxRoomsPerUser: this.config.rooms.maxRoomsPerUser,
        maxSpectators: this.config.rooms.maxSpectators,
        roomInactivityTimeout: 30,
        autoCleanupInterval: 10,
        discovery: {
          maxResults: 50,
          cacheTimeout: 300,
          enableRecommendations: true,
          recommendationEngine: 'basic'
        },
        analytics: {
          enableRealTime: this.config.rooms.enableAnalytics,
          aggregationInterval: 5,
          retentionPeriod: 30
        },
        moderation: {
          autoModeration: true,
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

      this.gameModeService = GameModeService.getInstance({
        enabledModes: this.config.gameModes.enabledModes,
        defaultConfigs: {} as any,
        customModeLimit: 10,
        allowModeVoting: this.config.gameModes.enableModeVoting,
        modeRotation: {
          enabled: false,
          rotationModes: [],
          rotationIntervalMinutes: 60
        }
      });

      this.spectatorService = SpectatorService.getInstance();
      this.achievementService = AchievementService.getInstance();
      this.gameManager = GameManager.getInstance(this.io);

      // Set up cross-service integration
      await this.setupServiceIntegration();
      
      // Start monitoring
      this.startPerformanceMonitoring();
      
      logger.info('Enhanced Multiplayer Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Enhanced Multiplayer Service', { error });
      throw error;
    }
  }

  /**
   * Set up integration between services
   */
  private async setupServiceIntegration(): Promise<void> {
    // Power-up integration
    this.powerUpService.on('powerup:activated', (result) => {
      this.handlePowerUpActivated(result);
    });

    // Social integration
    this.socialService.on('friend:request_sent', (data) => {
      this.handleFriendRequestSent(data);
    });

    this.socialService.on('chat:message_sent', (data) => {
      this.handleChatMessageSent(data);
    });

    // Room integration
    this.enhancedRoomService.on('room:created', (data) => {
      this.handleRoomCreated(data);
    });

    this.enhancedRoomService.on('room:participant_joined', (data) => {
      this.handleParticipantJoined(data);
    });

    // Game mode integration
    this.gameModeService.on('game_mode:player_eliminated', (gameId, userId, reason) => {
      this.handlePlayerEliminated(gameId, userId, reason);
    });

    this.gameModeService.on('game_mode:completed', (gameId, results) => {
      this.handleGameModeCompleted(gameId, results);
    });

    // Spectator integration
    this.spectatorService.on('spectator:joined', (data) => {
      this.handleSpectatorJoined(data);
    });

    // Achievement integration
    this.achievementService.on('achievement:earned', (event) => {
      this.handleAchievementEarned(event);
    });

    // Game manager integration
    this.gameManager.on('game:started', (gameState) => {
      this.handleGameStarted(gameState);
    });

    this.gameManager.on('game:ended', (results) => {
      this.handleGameEnded(results);
    });

    logger.info('Service integration setup complete');
  }

  // ==========================================
  // GAME LIFECYCLE INTEGRATION
  // ==========================================

  /**
   * Start enhanced multiplayer game
   */
  public async startEnhancedGame(
    roomId: string,
    hostUserId: string,
    gameConfig: {
      gameMode: GameMode;
      allowPowerUps: boolean;
      allowSpectators: boolean;
      enableChat: boolean;
      customSettings?: any;
    }
  ): Promise<string> {
    try {
      // Create integration state
      const integrationState: GameIntegrationState = {
        gameId: '',
        roomId,
        hostUserId,
        gameMode: gameConfig.gameMode,
        features: {
          powerUpsEnabled: gameConfig.allowPowerUps && this.config.powerUps.enabled,
          socialEnabled: gameConfig.enableChat && this.config.social.enableChat,
          spectatorsEnabled: gameConfig.allowSpectators && this.config.spectators.enabled,
          achievementsEnabled: this.config.achievements.enabled
        },
        startTime: new Date(),
        participants: new Map(),
        spectators: new Map(),
        powerUpUsage: [],
        socialActivity: [],
        achievements: []
      };

      // Start the base game
      const gameState = await this.gameManager.startGame(roomId, hostUserId, {
        totalQuestions: 20,
        categoryIds: [],
        difficultyLevels: [1, 2, 3],
        timeBonusEnabled: true,
        streakBonusEnabled: true
      });

      integrationState.gameId = gameState.id;
      this.gameIntegrationState.set(gameState.id, integrationState);

      // Initialize game mode
      const participants = Array.from(gameState.players.keys());
      await this.gameModeService.initializeGameMode(
        gameState.id,
        roomId,
        gameConfig.gameMode,
        gameConfig.customSettings,
        participants
      );

      // Initialize power-ups if enabled
      if (integrationState.features.powerUpsEnabled) {
        this.powerUpService.initializeGamePowerUps(gameState.id, roomId);
      }

      // Initialize spectator view if enabled
      if (integrationState.features.spectatorsEnabled) {
        this.spectatorService.initializeSpectatorView(gameState.id, roomId, {
          maxSpectators: this.config.spectators.maxSpectatorsPerRoom,
          enablePredictions: this.config.spectators.enablePredictions,
          enablePolls: this.config.spectators.enablePolls
        });
      }

      // Initialize chat room if enabled
      if (integrationState.features.socialEnabled) {
        this.socialService.initializeChatRoom(roomId, {
          allowChat: true,
          allowReactions: this.config.social.enableReactions,
          rateLimitMessages: this.config.social.maxChatMessagesPerMinute,
          moderationLevel: this.config.social.moderationLevel
        });
      }

      // Track achievement metrics
      if (integrationState.features.achievementsEnabled) {
        for (const playerId of participants) {
          this.achievementService.trackUserMetrics(playerId, {
            games_started: 1,
            game_mode: gameConfig.gameMode
          }, gameState.id);
        }
      }

      // Start game mode
      await this.gameModeService.startGameMode(gameState.id);

      // Update performance metrics
      this.updatePerformanceMetrics();

      // Emit enhanced game start event
      this.emit('game:enhanced_start', {
        gameId: gameState.id,
        roomId,
        gameMode: gameConfig.gameMode,
        features: integrationState.features,
        participants: participants.length
      });

      logger.info('Enhanced multiplayer game started', {
        gameId: gameState.id,
        roomId,
        gameMode: gameConfig.gameMode,
        participantCount: participants.length,
        features: integrationState.features
      });

      return gameState.id;

    } catch (error) {
      logger.error('Failed to start enhanced game', { roomId, hostUserId, gameConfig, error });
      throw error;
    }
  }

  /**
   * Handle power-up activation in game context
   */
  public async activatePowerUp(
    gameId: string,
    userId: string,
    powerUpPayload: PowerUpActivationPayload
  ): Promise<any> {
    try {
      const integrationState = this.gameIntegrationState.get(gameId);
      if (!integrationState || !integrationState.features.powerUpsEnabled) {
        throw new Error('Power-ups not enabled for this game');
      }

      // Activate power-up
      const result = await this.powerUpService.activatePowerUp(powerUpPayload, userId);

      // Record usage in integration state
      integrationState.powerUpUsage.push({
        userId,
        powerUpId: powerUpPayload.powerUpId,
        timestamp: new Date(),
        effectiveness: result.success ? 1.0 : 0.0
      });

      // Track achievement metrics
      if (integrationState.features.achievementsEnabled) {
        this.achievementService.trackUserMetrics(userId, {
          power_ups_used: 1,
          power_up_type: result.type
        }, gameId);
      }

      // Apply power-up effects to game mode
      if (result.success) {
        await this.applyPowerUpToGameMode(gameId, userId, result);
      }

      // Notify spectators
      if (integrationState.features.spectatorsEnabled) {
        this.spectatorService.addCommentaryHighlight(gameId, {
          type: 'power_up',
          playerId: userId,
          description: `Power-up activated: ${result.type}`,
          excitement: 6
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to activate power-up in game context', { gameId, userId, error });
      throw error;
    }
  }

  // ==========================================
  // EVENT HANDLERS
  // ==========================================

  /**
   * Handle power-up activated
   */
  private handlePowerUpActivated(result: any): void {
    logger.debug('Power-up activated', { userId: result.userId, type: result.type });
    
    // Emit to clients
    this.io.to(result.gameId).emit('powerup:effect_applied', result);
  }

  /**
   * Handle friend request sent
   */
  private handleFriendRequestSent(data: any): void {
    logger.debug('Friend request sent', { fromUserId: data.fromUserId, toUserId: data.toUserId });
    
    // Track social achievement metrics
    if (this.config.achievements.enabled) {
      this.achievementService.trackUserMetrics(data.fromUserId, {
        friend_requests_sent: 1
      });
    }
  }

  /**
   * Handle chat message sent
   */
  private handleChatMessageSent(data: any): void {
    const { roomId, message } = data;
    
    // Update room analytics
    this.enhancedRoomService.updateRoomAnalytics(roomId, 'chat_message', {
      userId: message.userId,
      messageLength: message.content.length
    });

    // Track achievement metrics
    if (this.config.achievements.enabled) {
      this.achievementService.trackUserMetrics(message.userId, {
        chat_messages: 1
      });
    }
  }

  /**
   * Handle room created
   */
  private handleRoomCreated(data: any): void {
    const { room } = data;
    
    logger.info('Enhanced room created', {
      roomId: room.id,
      name: room.name,
      hostId: room.hostId
    });
  }

  /**
   * Handle participant joined
   */
  private handleParticipantJoined(data: any): void {
    const { roomId, participant } = data;
    
    // Add to chat room if enabled
    if (this.config.social.enableChat) {
      this.socialService.addChatParticipant(
        roomId,
        participant.userId,
        participant.user.username,
        participant.role
      );
    }

    // Update room analytics
    this.enhancedRoomService.updateRoomAnalytics(roomId, 'player_joined', {
      userId: participant.userId,
      role: participant.role
    });
  }

  /**
   * Handle player eliminated
   */
  private handlePlayerEliminated(gameId: string, userId: string, reason: string): void {
    const integrationState = this.gameIntegrationState.get(gameId);
    if (!integrationState) return;

    // Track achievement metrics
    if (integrationState.features.achievementsEnabled) {
      this.achievementService.trackUserMetrics(userId, {
        eliminations: 1,
        elimination_reason: reason
      }, gameId);
    }

    // Add spectator commentary
    if (integrationState.features.spectatorsEnabled) {
      this.spectatorService.addCommentaryHighlight(gameId, {
        type: 'elimination',
        playerId: userId,
        description: `Player eliminated: ${reason}`,
        excitement: 7
      });
    }
  }

  /**
   * Handle game mode completed
   */
  private handleGameModeCompleted(gameId: string, results: any): void {
    const integrationState = this.gameIntegrationState.get(gameId);
    if (!integrationState) return;

    // Track achievement metrics for all participants
    if (integrationState.features.achievementsEnabled) {
      for (const playerResult of results.playerResults) {
        this.achievementService.trackUserMetrics(playerResult.userId, {
          games_completed: 1,
          final_rank: playerResult.finalRank,
          final_score: playerResult.score,
          accuracy_rate: playerResult.correctAnswers / playerResult.questionsAnswered * 100,
          game_mode: integrationState.gameMode
        }, gameId);
      }

      // Special metrics for winners
      for (const winner of results.winners) {
        this.achievementService.trackUserMetrics(winner.userId, {
          games_won: 1,
          victory_rank: winner.rank
        }, gameId);
      }
    }
  }

  /**
   * Handle spectator joined
   */
  private handleSpectatorJoined(data: any): void {
    const { gameId, spectator, totalSpectators } = data;
    
    // Update room analytics
    const integrationState = this.gameIntegrationState.get(gameId);
    if (integrationState) {
      this.enhancedRoomService.updateRoomAnalytics(integrationState.roomId, 'spectator_joined', {
        spectatorId: spectator.userId,
        totalSpectators
      });
    }

    // Check for spectator milestones
    if (totalSpectators % 10 === 0 && totalSpectators > 0) {
      this.emit('spectator:milestone_reached', {
        gameId,
        milestone: totalSpectators,
        spectatorId: spectator.userId
      });
    }
  }

  /**
   * Handle achievement earned
   */
  private handleAchievementEarned(event: any): void {
    const { userId, achievement, gameId } = event;
    
    logger.info('Achievement earned', {
      userId,
      achievementId: achievement.id,
      achievementName: achievement.displayName,
      gameId
    });

    // Emit to user
    this.io.to(userId).emit('achievement:earned', {
      achievement,
      rewards: event.rewards
    });

    // Notify spectators if in a game
    if (gameId) {
      const integrationState = this.gameIntegrationState.get(gameId);
      if (integrationState?.features.spectatorsEnabled) {
        this.spectatorService.addCommentaryHighlight(gameId, {
          type: 'achievement',
          playerId: userId,
          description: `Achievement unlocked: ${achievement.displayName}`,
          excitement: 8
        });
      }
    }
  }

  /**
   * Handle game started
   */
  private handleGameStarted(gameState: any): void {
    this.performanceMetrics.activeGames++;
    this.performanceMetrics.activePlayers += gameState.players.size;
  }

  /**
   * Handle game ended
   */
  private handleGameEnded(results: any): void {
    const { gameId } = results;
    
    // Clean up integration state
    const integrationState = this.gameIntegrationState.get(gameId);
    if (integrationState) {
      // Clean up power-ups
      if (integrationState.features.powerUpsEnabled) {
        this.powerUpService.cleanupGamePowerUps(gameId);
      }

      // Clean up spectators
      if (integrationState.features.spectatorsEnabled) {
        // Spectator cleanup is handled by the spectator service
      }

      // Clean up chat
      if (integrationState.features.socialEnabled) {
        this.socialService.cleanupChatRoom(integrationState.roomId);
      }

      this.gameIntegrationState.delete(gameId);
    }

    this.performanceMetrics.activeGames--;
    
    // Emit enhanced game end event
    this.emit('game:enhanced_end', {
      gameId,
      results,
      integrationState
    });
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Apply power-up effects to game mode
   */
  private async applyPowerUpToGameMode(gameId: string, userId: string, powerUpResult: any): Promise<void> {
    try {
      const gameModeState = this.gameModeService.getGameModeState(gameId);
      if (!gameModeState) return;

      // Apply different effects based on power-up type
      switch (powerUpResult.type) {
        case PowerUpType.FREEZE_OPPONENTS:
          // Temporarily disable other players' input
          for (const [playerId] of gameModeState.playerStates) {
            if (playerId !== userId) {
              this.io.to(playerId).emit('game:player_frozen', {
                duration: powerUpResult.effects[0]?.value?.freezeDuration || 10
              });
            }
          }
          break;

        case PowerUpType.TIME_EXTENSION:
          // Extend question timer
          this.io.to(gameId).emit('game:time_extended', {
            additionalSeconds: powerUpResult.effects[0]?.value?.additionalSeconds || 15,
            userId
          });
          break;

        case PowerUpType.ELIMINATION:
          // Remove incorrect options for the user
          this.io.to(userId).emit('game:options_eliminated', {
            eliminatedCount: powerUpResult.effects[0]?.value?.eliminatedOptions || 2
          });
          break;

        // Add other power-up effects as needed
      }

    } catch (error) {
      logger.error('Failed to apply power-up to game mode', { gameId, userId, error });
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    // Update active players count
    let totalPlayers = 0;
    let totalSpectators = 0;

    for (const integrationState of this.gameIntegrationState.values()) {
      totalPlayers += integrationState.participants.size;
      totalSpectators += integrationState.spectators.size;
    }

    this.performanceMetrics.activePlayers = totalPlayers;
    this.performanceMetrics.activeSpectators = totalSpectators;
    this.performanceMetrics.lastUpdated = new Date();

    // Check for performance alerts
    if (this.performanceMetrics.activeGames > this.config.performance.maxConcurrentGames) {
      this.emit('system:performance_alert', {
        type: 'max_games_exceeded',
        current: this.performanceMetrics.activeGames,
        limit: this.config.performance.maxConcurrentGames
      });
    }
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 30000);

    // System health check every 5 minutes
    setInterval(() => {
      this.performSystemHealthCheck();
    }, 300000);
  }

  /**
   * Perform system health check
   */
  private performSystemHealthCheck(): void {
    const healthStatus = {
      timestamp: new Date(),
      services: {
        powerUps: this.powerUpService ? 'healthy' : 'error',
        social: this.socialService ? 'healthy' : 'error',
        rooms: this.enhancedRoomService ? 'healthy' : 'error',
        gameModes: this.gameModeService ? 'healthy' : 'error',
        spectators: this.spectatorService ? 'healthy' : 'error',
        achievements: this.achievementService ? 'healthy' : 'error'
      },
      metrics: this.performanceMetrics,
      activeGames: this.gameIntegrationState.size
    };

    logger.debug('System health check', healthStatus);

    // Emit health status for monitoring
    this.emit('system:health_check', healthStatus);
  }

  /**
   * Get current system status
   */
  public getSystemStatus(): any {
    return {
      performanceMetrics: this.performanceMetrics,
      activeGames: this.gameIntegrationState.size,
      config: this.config,
      services: {
        powerUps: !!this.powerUpService,
        social: !!this.socialService,
        rooms: !!this.enhancedRoomService,
        gameModes: !!this.gameModeService,
        spectators: !!this.spectatorService,
        achievements: !!this.achievementService
      }
    };
  }

  /**
   * Get game integration state
   */
  public getGameIntegrationState(gameId: string): GameIntegrationState | undefined {
    return this.gameIntegrationState.get(gameId);
  }

  /**
   * Update configuration
   */
  public updateConfiguration(newConfig: Partial<EnhancedMultiplayerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update individual services with new config
    if (newConfig.powerUps) {
      this.powerUpService.updateConfig(newConfig.powerUps as any);
    }

    logger.info('Enhanced multiplayer configuration updated', { newConfig });
  }
}

// Integration state interface
interface GameIntegrationState {
  gameId: string;
  roomId: string;
  hostUserId: string;
  gameMode: GameMode;
  features: {
    powerUpsEnabled: boolean;
    socialEnabled: boolean;
    spectatorsEnabled: boolean;
    achievementsEnabled: boolean;
  };
  startTime: Date;
  participants: Map<string, ParticipantIntegrationData>;
  spectators: Map<string, SpectatorIntegrationData>;
  powerUpUsage: PowerUpUsageData[];
  socialActivity: SocialActivityData[];
  achievements: AchievementEarnedData[];
}

interface ParticipantIntegrationData {
  userId: string;
  joinedAt: Date;
  role: ParticipantRole;
  powerUpsUsed: number;
  achievementsEarned: number;
  socialInteractions: number;
}

interface SpectatorIntegrationData {
  userId: string;
  joinedAt: Date;
  predictionsCount: number;
  pollVotes: number;
  chatMessages: number;
}

interface PowerUpUsageData {
  userId: string;
  powerUpId: string;
  timestamp: Date;
  effectiveness: number;
}

interface SocialActivityData {
  userId: string;
  type: 'chat' | 'reaction' | 'friend_invite';
  timestamp: Date;
  metadata: any;
}

interface AchievementEarnedData {
  userId: string;
  achievementId: string;
  timestamp: Date;
  gameContext: any;
}
