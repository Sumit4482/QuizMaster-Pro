/**
 * Phase 2.3: Enhanced Multiplayer Socket Handlers
 * Socket event handlers for power-ups, social features, spectator mode, and advanced game modes
 */

import { Socket } from 'socket.io';
import { logger } from '@/config/logger';
import { eventHandlers } from '.';
import { PowerUpService } from '@/services/powerUpService';
import { SocialService } from '@/services/socialService';
import { EnhancedRoomService } from '@/services/enhancedRoomService';
import { GameModeService } from '@/services/gameModeService';
import { SpectatorService } from '@/services/spectatorService';
import { AchievementService } from '@/services/achievementService';
import { EnhancedMultiplayerService } from '@/services/enhancedMultiplayerService';
import { ExtendedSocket } from '@/sockets/types/socket';
import {
  PowerUpActivationPayload,
  PowerUpErrorCode
} from '@/types/powerups';
import {
  MessageType,
  ParticipantRole,
  FriendshipStatus
} from '@/types/social';
import {
  RoomDiscoveryFilter,
  RoomCategory,
  GameMode as EnhancedGameMode
} from '@/types/enhancedRooms';

export class EnhancedMultiplayerHandlers {
  private powerUpService: PowerUpService;
  private socialService: SocialService;
  private enhancedRoomService: EnhancedRoomService;
  private gameModeService: GameModeService;
  private spectatorService: SpectatorService;
  private achievementService: AchievementService;
  private enhancedMultiplayerService: EnhancedMultiplayerService;

  constructor() {
    // Services will be initialized when needed (lazy loading)
  }

  /**
   * Setup all enhanced multiplayer event handlers
   */
  public setupEnhancedHandlers(socket: ExtendedSocket): void {
    // Initialize services if not already done
    this.initializeServices(socket);

    // Power-up event handlers
    this.setupPowerUpHandlers(socket);

    // Social feature handlers
    this.setupSocialHandlers(socket);

    // Enhanced room handlers
    this.setupEnhancedRoomHandlers(socket);

    // Game mode handlers
    this.setupGameModeHandlers(socket);

    // Spectator handlers
    this.setupSpectatorHandlers(socket);

    // Achievement handlers
    this.setupAchievementHandlers(socket);

    logger.debug('Enhanced multiplayer handlers setup complete', {
      userId: socket.data.user.id,
      socketId: socket.id
    });
  }

  /**
   * Initialize services (lazy loading)
   */
  private initializeServices(socket: ExtendedSocket): void {
    try {
      // Get or initialize services
      if (!this.powerUpService) {
        this.powerUpService = PowerUpService.getInstance();
      }
      if (!this.socialService) {
        this.socialService = SocialService.getInstance();
      }
      if (!this.enhancedRoomService) {
        this.enhancedRoomService = EnhancedRoomService.getInstance();
      }
      if (!this.gameModeService) {
        this.gameModeService = GameModeService.getInstance();
      }
      if (!this.spectatorService) {
        this.spectatorService = SpectatorService.getInstance();
      }
      if (!this.achievementService) {
        this.achievementService = AchievementService.getInstance();
      }
      if (!this.enhancedMultiplayerService) {
        this.enhancedMultiplayerService = EnhancedMultiplayerService.getInstance();
      }
    } catch (error) {
      logger.warn('Some enhanced services not yet initialized', { error: error instanceof Error ? error.message : error });
    }
  }

  // ==========================================
  // POWER-UP EVENT HANDLERS
  // ==========================================

  private setupPowerUpHandlers(socket: ExtendedSocket): void {
    // Get user power-ups
    socket.on('powerup:get_inventory', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.powerUpService) {
          throw new Error('PowerUp service not available');
        }

        const inventory = await this.powerUpService.getUserPowerUps(socket.data.user.id);
        
        callback?.({
          success: true,
          data: inventory,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get power-up inventory', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'INVENTORY_FETCH_FAILED',
            message: 'Failed to get power-up inventory'
          }
        });
      }
    }));

    // Activate power-up
    socket.on('powerup:activate', eventHandlers.withErrorHandling(socket, async (payload: PowerUpActivationPayload, callback) => {
      try {
        if (!this.powerUpService || !this.enhancedMultiplayerService) {
          throw new Error('Required services not available');
        }

        // Use the integrated service for power-up activation in game context
        const result = await this.enhancedMultiplayerService.activatePowerUp(
          payload.gameId,
          socket.data.user.id,
          payload
        );

        // Broadcast to room participants
        socket.to(payload.roomId).emit('powerup:activated', {
          userId: socket.data.user.id,
          powerUpId: payload.powerUpId,
          effects: result.effects,
          timestamp: new Date().toISOString()
        });

        callback?.({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to activate power-up', { 
          userId: socket.data.user.id, 
          payload, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof Error && error.message.includes('not enabled') 
              ? PowerUpErrorCode.POWER_UP_DISABLED 
              : PowerUpErrorCode.EFFECT_FAILED,
            message: error instanceof Error ? error.message : 'Failed to activate power-up'
          }
        });
      }
    }));

    // Get available power-ups
    socket.on('powerup:get_available', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.powerUpService) {
          throw new Error('PowerUp service not available');
        }

        const powerUps = await this.powerUpService.getAllPowerUps();
        
        callback?.({
          success: true,
          data: powerUps,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get available power-ups', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'POWERUPS_FETCH_FAILED',
            message: 'Failed to get available power-ups'
          }
        });
      }
    }));
  }

  // ==========================================
  // SOCIAL FEATURE HANDLERS
  // ==========================================

  private setupSocialHandlers(socket: ExtendedSocket): void {
    // Send friend request
    socket.on('social:send_friend_request', eventHandlers.withErrorHandling(socket, async (payload: { toUserId: string; message?: string }, callback) => {
      try {
        if (!this.socialService) {
          throw new Error('Social service not available');
        }

        const friendRequest = await this.socialService.sendFriendRequest(
          socket.data.user.id,
          payload.toUserId,
          payload.message
        );

        // Notify the recipient
        socket.to(payload.toUserId).emit('social:friend_request_received', {
          request: friendRequest,
          fromUser: {
            id: socket.data.user.id,
            username: socket.data.user.username
          }
        });

        callback?.({
          success: true,
          data: friendRequest,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to send friend request', { 
          fromUserId: socket.data.user.id, 
          toUserId: payload.toUserId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'FRIEND_REQUEST_FAILED',
            message: error instanceof Error ? error.message : 'Failed to send friend request'
          }
        });
      }
    }));

    // Respond to friend request
    socket.on('social:respond_friend_request', eventHandlers.withErrorHandling(socket, async (payload: { requestId: string; accept: boolean }, callback) => {
      try {
        if (!this.socialService) {
          throw new Error('Social service not available');
        }

        const response = await this.socialService.respondToFriendRequest(
          payload.requestId,
          socket.data.user.id,
          payload.accept
        );

        // Notify the requester
        if (response.friend) {
          socket.to(response.friend.id).emit('social:friend_request_responded', {
            request: response,
            accepted: payload.accept,
            user: {
              id: socket.data.user.id,
              username: socket.data.user.username
            }
          });
        }

        callback?.({
          success: true,
          data: response,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to respond to friend request', { 
          userId: socket.data.user.id, 
          requestId: payload.requestId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'FRIEND_RESPONSE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to respond to friend request'
          }
        });
      }
    }));

    // Send chat message
    socket.on('chat:send_message', eventHandlers.withErrorHandling(socket, async (payload: { roomId: string; content: string; type?: MessageType }, callback) => {
      try {
        if (!this.socialService) {
          throw new Error('Social service not available');
        }

        const message = await this.socialService.sendChatMessage(
          payload.roomId,
          socket.data.user.id,
          payload.content,
          payload.type || MessageType.TEXT
        );

        // Broadcast to room participants
        socket.to(payload.roomId).emit('chat:message_received', message);

        callback?.({
          success: true,
          data: message,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to send chat message', { 
          userId: socket.data.user.id, 
          roomId: payload.roomId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'CHAT_MESSAGE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to send chat message'
          }
        });
      }
    }));

    // Add reaction to message
    socket.on('chat:add_reaction', eventHandlers.withErrorHandling(socket, async (payload: { messageId: string; emoji: string }, callback) => {
      try {
        if (!this.socialService) {
          throw new Error('Social service not available');
        }

        const reaction = await this.socialService.addReaction(
          payload.messageId,
          socket.data.user.id,
          payload.emoji
        );

        // Broadcast reaction to room
        // Note: We'd need to get the room ID from the message
        socket.broadcast.emit('chat:reaction_added', reaction);

        callback?.({
          success: true,
          data: reaction,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to add reaction', { 
          userId: socket.data.user.id, 
          messageId: payload.messageId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'REACTION_FAILED',
            message: error instanceof Error ? error.message : 'Failed to add reaction'
          }
        });
      }
    }));

    // Send quick reaction
    socket.on('reaction:send', eventHandlers.withErrorHandling(socket, async (payload: { roomId: string; reactionId: string; targetType: string; targetId?: string }, callback) => {
      try {
        if (!this.socialService) {
          throw new Error('Social service not available');
        }

        const reaction = this.socialService.sendQuickReaction(
          payload.roomId,
          socket.data.user.id,
          payload.reactionId,
          payload.targetType,
          payload.targetId
        );

        // Broadcast to room
        socket.to(payload.roomId).emit('reaction:received', reaction);

        callback?.({
          success: true,
          data: reaction,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to send reaction', { 
          userId: socket.data.user.id, 
          payload, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'REACTION_SEND_FAILED',
            message: 'Failed to send reaction'
          }
        });
      }
    }));

    // Get user friends
    socket.on('social:get_friends', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.socialService) {
          throw new Error('Social service not available');
        }

        const friends = await this.socialService.getUserFriends(socket.data.user.id);
        
        callback?.({
          success: true,
          data: friends,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get friends', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'FRIENDS_FETCH_FAILED',
            message: 'Failed to get friends list'
          }
        });
      }
    }));
  }

  // ==========================================
  // ENHANCED ROOM HANDLERS
  // ==========================================

  private setupEnhancedRoomHandlers(socket: ExtendedSocket): void {
    // Discover rooms
    socket.on('rooms:discover', eventHandlers.withErrorHandling(socket, async (payload: { filter: RoomDiscoveryFilter }, callback) => {
      try {
        if (!this.enhancedRoomService) {
          throw new Error('Enhanced room service not available');
        }

        const rooms = await this.enhancedRoomService.discoverRooms(
          payload.filter,
          socket.data.user.id
        );
        
        callback?.({
          success: true,
          data: rooms,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to discover rooms', { 
          userId: socket.data.user.id, 
          filter: payload.filter, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'ROOM_DISCOVERY_FAILED',
            message: 'Failed to discover rooms'
          }
        });
      }
    }));

    // Get room recommendations
    socket.on('rooms:get_recommendations', eventHandlers.withErrorHandling(socket, async (payload: { limit?: number }, callback) => {
      try {
        if (!this.enhancedRoomService) {
          throw new Error('Enhanced room service not available');
        }

        const recommendations = await this.enhancedRoomService.getRoomRecommendations(
          socket.data.user.id,
          payload.limit || 10
        );
        
        callback?.({
          success: true,
          data: recommendations,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get room recommendations', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'RECOMMENDATIONS_FAILED',
            message: 'Failed to get room recommendations'
          }
        });
      }
    }));

    // Create enhanced room
    socket.on('rooms:create_enhanced', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.enhancedRoomService) {
          throw new Error('Enhanced room service not available');
        }

        const room = await this.enhancedRoomService.createEnhancedRoom(
          socket.data.user.id,
          payload
        );

        // Join the socket to the room
        await socket.join(room.id);
        
        callback?.({
          success: true,
          data: room,
          timestamp: new Date().toISOString()
        });

        // Emit room created event for room discovery updates
        socket.broadcast.emit('rooms:room_created', {
          room: {
            id: room.id,
            name: room.name,
            category: room.category,
            gameMode: room.gameMode,
            currentPlayers: room.currentPlayers,
            maxPlayers: room.maxPlayers,
            isPrivate: room.visibility !== 'PUBLIC'
          }
        });

      } catch (error) {
        logger.error('Failed to create enhanced room', { 
          userId: socket.data.user.id, 
          payload, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'ROOM_CREATE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to create room'
          }
        });
      }
    }));

    // Get room templates
    socket.on('rooms:get_templates', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.enhancedRoomService) {
          throw new Error('Enhanced room service not available');
        }

        const templates = this.enhancedRoomService.getAllRoomTemplates();
        
        callback?.({
          success: true,
          data: templates,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get room templates', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'TEMPLATES_FETCH_FAILED',
            message: 'Failed to get room templates'
          }
        });
      }
    }));
  }

  // ==========================================
  // GAME MODE HANDLERS
  // ==========================================

  private setupGameModeHandlers(socket: ExtendedSocket): void {
    // Get available game modes
    socket.on('gamemode:get_available', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.gameModeService) {
          throw new Error('Game mode service not available');
        }

        const gameModes = this.gameModeService.getAvailableGameModes();
        
        callback?.({
          success: true,
          data: gameModes,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get available game modes', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'GAMEMODE_FETCH_FAILED',
            message: 'Failed to get available game modes'
          }
        });
      }
    }));

    // Get game mode configuration
    socket.on('gamemode:get_config', eventHandlers.withErrorHandling(socket, async (payload: { mode: EnhancedGameMode }, callback) => {
      try {
        if (!this.gameModeService) {
          throw new Error('Game mode service not available');
        }

        const config = this.gameModeService.getGameModeConfig(payload.mode as any);
        
        callback?.({
          success: true,
          data: config,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get game mode config', { 
          userId: socket.data.user.id, 
          mode: payload.mode, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'GAMEMODE_CONFIG_FAILED',
            message: 'Failed to get game mode configuration'
          }
        });
      }
    }));
  }

  // ==========================================
  // SPECTATOR HANDLERS
  // ==========================================

  private setupSpectatorHandlers(socket: ExtendedSocket): void {
    // Join as spectator
    socket.on('spectator:join', eventHandlers.withErrorHandling(socket, async (payload: { gameId: string; preferences?: any }, callback) => {
      try {
        if (!this.spectatorService) {
          throw new Error('Spectator service not available');
        }

        const spectator = await this.spectatorService.addSpectator(
          payload.gameId,
          socket.data.user.id,
          {
            username: socket.data.user.username,
            avatarUrl: socket.data.user.avatarUrl
          },
          payload.preferences
        );

        // Join spectator room
        await socket.join(`spectator:${payload.gameId}`);
        
        // Notify other spectators
        socket.to(`spectator:${payload.gameId}`).emit('spectator:user_joined', {
          spectator: {
            userId: spectator.userId,
            username: spectator.username,
            joinedAt: spectator.joinedAt
          }
        });

        callback?.({
          success: true,
          data: spectator,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to join as spectator', { 
          userId: socket.data.user.id, 
          gameId: payload.gameId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'SPECTATOR_JOIN_FAILED',
            message: error instanceof Error ? error.message : 'Failed to join as spectator'
          }
        });
      }
    }));

    // Leave spectator mode
    socket.on('spectator:leave', eventHandlers.withErrorHandling(socket, async (payload: { gameId: string }, callback) => {
      try {
        if (!this.spectatorService) {
          throw new Error('Spectator service not available');
        }

        await this.spectatorService.removeSpectator(payload.gameId, socket.data.user.id);
        
        // Leave spectator room
        await socket.leave(`spectator:${payload.gameId}`);
        
        // Notify other spectators
        socket.to(`spectator:${payload.gameId}`).emit('spectator:user_left', {
          userId: socket.data.user.id
        });

        callback?.({
          success: true,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to leave spectator mode', { 
          userId: socket.data.user.id, 
          gameId: payload.gameId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'SPECTATOR_LEAVE_FAILED',
            message: 'Failed to leave spectator mode'
          }
        });
      }
    }));

    // Create spectator poll
    socket.on('spectator:create_poll', eventHandlers.withErrorHandling(socket, async (payload: { gameId: string; question: string; options: string[]; durationSeconds: number }, callback) => {
      try {
        if (!this.spectatorService) {
          throw new Error('Spectator service not available');
        }

        const poll = await this.spectatorService.createSpectatorPoll(
          payload.gameId,
          socket.data.user.id,
          {
            question: payload.question,
            options: payload.options,
            durationSeconds: payload.durationSeconds
          }
        );

        // Notify all spectators
        socket.to(`spectator:${payload.gameId}`).emit('spectator:poll_created', poll);

        callback?.({
          success: true,
          data: poll,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to create spectator poll', { 
          userId: socket.data.user.id, 
          gameId: payload.gameId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'POLL_CREATE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to create poll'
          }
        });
      }
    }));

    // Vote on spectator poll
    socket.on('spectator:vote_poll', eventHandlers.withErrorHandling(socket, async (payload: { gameId: string; pollId: string; optionId: string }, callback) => {
      try {
        if (!this.spectatorService) {
          throw new Error('Spectator service not available');
        }

        await this.spectatorService.voteOnPoll(
          payload.gameId,
          payload.pollId,
          socket.data.user.id,
          payload.optionId
        );

        callback?.({
          success: true,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to vote on poll', { 
          userId: socket.data.user.id, 
          pollId: payload.pollId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'POLL_VOTE_FAILED',
            message: 'Failed to vote on poll'
          }
        });
      }
    }));

    // Create prediction
    socket.on('spectator:create_prediction', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.spectatorService) {
          throw new Error('Spectator service not available');
        }

        const prediction = await this.spectatorService.createSpectatorPrediction(
          payload.gameId,
          socket.data.user.id,
          payload
        );

        callback?.({
          success: true,
          data: prediction,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to create prediction', { 
          userId: socket.data.user.id, 
          payload, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'PREDICTION_FAILED',
            message: error instanceof Error ? error.message : 'Failed to create prediction'
          }
        });
      }
    }));
  }

  // ==========================================
  // ACHIEVEMENT HANDLERS
  // ==========================================

  private setupAchievementHandlers(socket: ExtendedSocket): void {
    // Get user achievements
    socket.on('achievements:get_user', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.achievementService) {
          throw new Error('Achievement service not available');
        }

        const achievements = await this.achievementService.getUserAchievements(socket.data.user.id);
        
        callback?.({
          success: true,
          data: achievements,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get user achievements', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'ACHIEVEMENTS_FETCH_FAILED',
            message: 'Failed to get user achievements'
          }
        });
      }
    }));

    // Get achievement progress
    socket.on('achievements:get_progress', eventHandlers.withErrorHandling(socket, async (payload: { achievementId?: string }, callback) => {
      try {
        if (!this.achievementService) {
          throw new Error('Achievement service not available');
        }

        const progress = await this.achievementService.getUserAchievementProgress(
          socket.data.user.id,
          payload.achievementId
        );
        
        callback?.({
          success: true,
          data: Object.fromEntries(progress),
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get achievement progress', { 
          userId: socket.data.user.id, 
          achievementId: payload.achievementId, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'PROGRESS_FETCH_FAILED',
            message: 'Failed to get achievement progress'
          }
        });
      }
    }));

    // Get all available achievements
    socket.on('achievements:get_available', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.achievementService) {
          throw new Error('Achievement service not available');
        }

        const achievements = this.achievementService.getAllAchievements();
        
        callback?.({
          success: true,
          data: achievements,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get available achievements', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'AVAILABLE_ACHIEVEMENTS_FAILED',
            message: 'Failed to get available achievements'
          }
        });
      }
    }));

    // Get achievement summary
    socket.on('achievements:get_summary', eventHandlers.withErrorHandling(socket, async (payload: any, callback) => {
      try {
        if (!this.achievementService) {
          throw new Error('Achievement service not available');
        }

        const summary = await this.achievementService.getUserAchievementSummary(socket.data.user.id);
        
        callback?.({
          success: true,
          data: summary,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get achievement summary', { 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: 'SUMMARY_FETCH_FAILED',
            message: 'Failed to get achievement summary'
          }
        });
      }
    }));
  }
}
