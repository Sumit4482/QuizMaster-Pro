/**
 * Phase 2.3: Enhanced Room Service
 * Advanced room management with discovery, analytics, and social features
 */

import { EventEmitter } from 'events';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import {
  EnhancedGameRoom,
  GameRoomStatus,
  RoomCategory,
  RoomVisibility,
  EnhancedRoomSettings,
  EnhancedRoomParticipant,
  RoomDiscoveryFilter,
  RoomListEntry,
  RoomPopularity,
  RoomAnalytics,
  RoomRecommendation,
  RecommendationReason,
  RoomTemplate,
  RoomModerationAction,
  RoomInvitation,
  RoomBookmark,
  EnhancedRoomError,
  EnhancedRoomErrorCode,
  EnhancedRoomServiceConfig,
  ParticipantRole,
  ParticipantStatus
} from '@/types/enhancedRooms';
import { GameMode } from '@/types/gameModes';

export class EnhancedRoomService extends EventEmitter {
  private static instance: EnhancedRoomService | null = null;
  private config: EnhancedRoomServiceConfig;
  
  // In-memory cache for active rooms and discovery
  private activeRooms: Map<string, EnhancedGameRoom> = new Map();
  private roomPopularity: Map<string, RoomPopularity> = new Map();
  private roomAnalytics: Map<string, RoomAnalytics> = new Map();
  private discoveryCache: Map<string, { data: RoomListEntry[]; timestamp: number }> = new Map();
  
  // Rate limiting and moderation
  private moderationActions: Map<string, RoomModerationAction[]> = new Map(); // roomId -> actions
  private userRoomCounts: Map<string, number> = new Map(); // userId -> room count
  
  // Room templates cache
  private roomTemplates: Map<string, RoomTemplate> = new Map();

  private readonly DEFAULT_ROOM_SETTINGS: EnhancedRoomSettings = {
    // Game flow
    autoStart: false,
    autoStartDelay: 30,
    allowReconnection: true,
    reconnectionTimeLimit: 180,
    allowLatejoin: true,
    lateJoinCutoff: 5,
    
    // Question settings
    questionTimeLimit: 30,
    showHints: false,
    allowSkipping: false,
    shuffleQuestions: true,
    shuffleAnswers: true,
    showCorrectAnswers: true,
    showExplanations: true,
    
    // Scoring
    scoringSystem: 'standard',
    bonusPoints: {
      timeBonus: true,
      streakBonus: true,
      difficultyBonus: true,
      firstCorrectBonus: false
    },
    
    // Power-ups
    allowPowerUps: true,
    powerUpSettings: {
      startingPowerUps: 3,
      earnPowerUpsInGame: true,
      maxActivePowerUps: 2,
      powerUpCooldown: 60
    },
    
    // Social features
    chatSettings: {
      enabled: true,
      moderationLevel: 'basic',
      allowEmojis: true,
      allowMentions: true,
      rateLimit: 10
    },
    
    reactionSettings: {
      enabled: true,
      allowDuringQuestions: true,
      allowCustomReactions: false
    },
    
    // Privacy and moderation
    moderationSettings: {
      autoKickInactive: true,
      inactiveTimeLimit: 300,
      allowPlayerReports: true,
      requireHostApproval: false,
      banDisruptivePlayers: true
    },
    
    // Spectator settings
    spectatorSettings: {
      allowSpectators: true,
      spectatorLimit: 50,
      allowSpectatorChat: true,
      allowSpectatorPromotion: true
    },
    
    // Advanced features
    advancedSettings: {
      recordGame: false,
      allowScreenShare: false,
      enableVoiceChat: false,
      customBackgroundMusic: false
    }
  };

  private constructor(config: EnhancedRoomServiceConfig) {
    super();
    this.config = config;
    this.initializeService();
  }

  public static getInstance(config?: EnhancedRoomServiceConfig): EnhancedRoomService {
    if (!EnhancedRoomService.instance) {
      if (!config) {
        throw new Error('EnhancedRoomService must be initialized with config');
      }
      EnhancedRoomService.instance = new EnhancedRoomService(config);
    }
    return EnhancedRoomService.instance;
  }

  /**
   * Initialize the enhanced room service
   */
  private async initializeService(): Promise<void> {
    try {
      // Load room templates
      await this.loadRoomTemplates();
      
      // Initialize analytics collection
      this.startAnalyticsCollection();
      
      // Start cleanup routines
      this.startCleanupRoutines();
      
      logger.info('EnhancedRoomService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize EnhancedRoomService', { error });
      throw error;
    }
  }

  // ==========================================
  // ROOM CREATION AND MANAGEMENT
  // ==========================================

  /**
   * Create enhanced game room
   */
  public async createEnhancedRoom(
    hostId: string,
    roomData: {
      name: string;
      description?: string;
      category?: RoomCategory;
      tags?: string[];
      gameMode?: GameMode;
      maxPlayers?: number;
      visibility?: RoomVisibility;
      password?: string;
      settings?: Partial<EnhancedRoomSettings>;
    }
  ): Promise<EnhancedGameRoom> {
    try {
      // Check user room limit
      const userRoomCount = this.userRoomCounts.get(hostId) || 0;
      if (userRoomCount >= this.config.maxRoomsPerUser) {
        throw new EnhancedRoomError(
          EnhancedRoomErrorCode.ROOM_NOT_FOUND,
          `Maximum number of rooms (${this.config.maxRoomsPerUser}) reached`
        );
      }

      // Generate unique room code
      const roomCode = await this.generateUniqueRoomCode();

      // Get host information
      const host = await prisma.user.findUnique({
        where: { id: hostId },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          avatarUrl: true
        }
      });

      if (!host) {
        throw new EnhancedRoomError(EnhancedRoomErrorCode.ROOM_NOT_FOUND, 'Host not found');
      }

      // Create room in database
      const dbRoom = await prisma.gameRoom.create({
        data: {
          code: roomCode,
          name: roomData.name,
          description: roomData.description,
          category: roomData.category || RoomCategory.GENERAL,
          tags: roomData.tags || [],
          hostId,
          maxPlayers: roomData.maxPlayers || 10,
          currentPlayers: 1,
          isPrivate: roomData.visibility === RoomVisibility.PRIVATE,
          password: roomData.password,
          status: GameRoomStatus.WAITING,
          gameMode: roomData.gameMode || GameMode.CLASSIC,
          settings: { ...this.DEFAULT_ROOM_SETTINGS, ...roomData.settings }
        },
        include: {
          host: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatarUrl: true
            }
          }
        }
      });

      // Create enhanced room object
      const enhancedRoom: EnhancedGameRoom = {
        ...dbRoom,
        coHosts: [],
        moderators: [],
        spectatorCount: 0,
        waitingList: [],
        visibility: roomData.visibility || RoomVisibility.PUBLIC,
        allowSpectators: this.DEFAULT_ROOM_SETTINGS.spectatorSettings.allowSpectators,
        requireApproval: this.DEFAULT_ROOM_SETTINGS.moderationSettings.requireHostApproval,
        inviteOnly: roomData.visibility === RoomVisibility.INVITED_ONLY,
        allowChat: this.DEFAULT_ROOM_SETTINGS.chatSettings.enabled,
        allowReactions: this.DEFAULT_ROOM_SETTINGS.reactionSettings.enabled,
        allowVoiceChat: this.DEFAULT_ROOM_SETTINGS.advancedSettings.enableVoiceChat,
        popularity: this.initializeRoomPopularity(),
        analytics: this.initializeRoomAnalytics(),
        host: {
          ...host,
          hostingRating: 5.0, // Default rating
          hostedGamesCount: 0,
          isVerified: false,
          hostPreferences: {
            autoStart: false,
            allowLatejoin: true,
            kickInactivePlayers: true,
            moderationLevel: 'moderate',
            defaultGameMode: GameMode.CLASSIC,
            preferredCategories: [],
            hostingStyle: 'casual'
          }
        },
        participants: [],
        reconnectionTokens: new Map(),
        isLocked: false,
        maintenanceMode: false,
        customData: {}
      };

      // Add host as participant
      await this.addParticipant(dbRoom.id, hostId, ParticipantRole.HOST);

      // Cache the room
      this.activeRooms.set(dbRoom.id, enhancedRoom);
      
      // Update user room count
      this.userRoomCounts.set(hostId, userRoomCount + 1);

      // Initialize analytics
      this.initializeRoomAnalytics(dbRoom.id);

      // Emit event
      this.emit('room:created', { room: enhancedRoom });

      logger.info('Enhanced room created', {
        roomId: dbRoom.id,
        roomCode,
        hostId,
        name: roomData.name
      });

      return enhancedRoom;

    } catch (error) {
      logger.error('Failed to create enhanced room', { hostId, roomData, error });
      throw error;
    }
  }

  /**
   * Generate unique room code
   */
  private async generateUniqueRoomCode(): Promise<string> {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      // Check if code already exists
      const existing = await prisma.gameRoom.findUnique({
        where: { code }
      });

      if (!existing) {
        return code;
      }

      attempts++;
    }

    throw new EnhancedRoomError(
      EnhancedRoomErrorCode.ROOM_NOT_FOUND,
      'Failed to generate unique room code'
    );
  }

  /**
   * Add participant to room
   */
  public async addParticipant(
    roomId: string,
    userId: string,
    role: ParticipantRole = ParticipantRole.PLAYER,
    password?: string
  ): Promise<EnhancedRoomParticipant> {
    try {
      // Get room
      const room = await this.getRoom(roomId);
      if (!room) {
        throw new EnhancedRoomError(EnhancedRoomErrorCode.ROOM_NOT_FOUND, 'Room not found');
      }

      // Validate password if required
      if (room.password && password !== room.password) {
        throw new EnhancedRoomError(EnhancedRoomErrorCode.INVALID_PASSWORD, 'Invalid password');
      }

      // Check if room is full
      if (role === ParticipantRole.PLAYER && room.currentPlayers >= room.maxPlayers) {
        throw new EnhancedRoomError(EnhancedRoomErrorCode.ROOM_FULL, 'Room is full');
      }

      // Check if user is banned
      if (this.isUserBanned(roomId, userId)) {
        throw new EnhancedRoomError(EnhancedRoomErrorCode.BANNED_FROM_ROOM, 'User is banned from this room');
      }

      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          statistics: true
        }
      });

      if (!user) {
        throw new EnhancedRoomError(EnhancedRoomErrorCode.ROOM_NOT_FOUND, 'User not found');
      }

      // Check if already a participant
      const existingParticipant = await prisma.gameRoomParticipant.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId
          }
        }
      });

      if (existingParticipant && !existingParticipant.leftAt) {
        throw new EnhancedRoomError(EnhancedRoomErrorCode.ROOM_NOT_FOUND, 'Already in room');
      }

      // Create participant
      const dbParticipant = await prisma.gameRoomParticipant.create({
        data: {
          roomId,
          userId,
          role,
          status: ParticipantStatus.WAITING
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              statistics: true,
              profile: true
            }
          }
        }
      });

      // Create enhanced participant object
      const participant: EnhancedRoomParticipant = {
        ...dbParticipant,
        availablePowerUps: [], // Would be loaded from user's inventory
        chatMessages: 0,
        reactionsGiven: 0,
        friendsInRoom: 0,
        connectionQuality: 'good',
        latency: 50,
        reconnectionCount: 0,
        permissions: this.getParticipantPermissions(role),
        sessionAchievements: [],
        customData: {},
        user: {
          ...dbParticipant.user,
          level: user.statistics?.level || 1,
          experiencePoints: user.statistics?.experiencePoints || 0,
          isVerified: false, // Would check verification status
          countryCode: user.profile?.location || undefined,
          timezone: user.profile?.preferences?.appearance?.timezone || 'UTC'
        } as any
      };

      // Update room participant count
      if (role === ParticipantRole.PLAYER) {
        await prisma.gameRoom.update({
          where: { id: roomId },
          data: { currentPlayers: { increment: 1 } }
        });
      } else if (role === ParticipantRole.SPECTATOR) {
        await prisma.gameRoom.update({
          where: { id: roomId },
          data: { spectatorCount: { increment: 1 } }
        });
      }

      // Update cached room
      const cachedRoom = this.activeRooms.get(roomId);
      if (cachedRoom) {
        cachedRoom.participants.push(participant);
        if (role === ParticipantRole.PLAYER) {
          cachedRoom.currentPlayers++;
        } else if (role === ParticipantRole.SPECTATOR) {
          cachedRoom.spectatorCount++;
        }
      }

      // Emit event
      this.emit('room:participant_joined', { roomId, participant });

      logger.info('Participant added to room', { roomId, userId, role });
      return participant;

    } catch (error) {
      logger.error('Failed to add participant to room', { roomId, userId, role, error });
      throw error;
    }
  }

  // ==========================================
  // ROOM DISCOVERY AND SEARCH
  // ==========================================

  /**
   * Discover rooms with advanced filtering
   */
  public async discoverRooms(
    filter: RoomDiscoveryFilter,
    userId?: string
  ): Promise<RoomListEntry[]> {
    try {
      // Check cache first
      const cacheKey = this.generateDiscoveryCacheKey(filter);
      const cached = this.discoveryCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.config.discovery.cacheTimeout * 1000) {
        return this.personalizeRoomList(cached.data, userId);
      }

      // Build database query
      const whereClause: any = {
        isPrivate: filter.hasPassword !== undefined ? filter.hasPassword : false,
        status: {
          in: [GameRoomStatus.WAITING, GameRoomStatus.IN_PROGRESS]
        }
      };

      if (filter.category) {
        whereClause.category = filter.category;
      }

      if (filter.gameMode) {
        whereClause.gameMode = filter.gameMode;
      }

      if (filter.tags && filter.tags.length > 0) {
        whereClause.tags = {
          hasSome: filter.tags
        };
      }

      if (filter.minPlayers !== undefined) {
        whereClause.currentPlayers = {
          gte: filter.minPlayers
        };
      }

      if (filter.maxPlayers !== undefined) {
        whereClause.maxPlayers = {
          lte: filter.maxPlayers
        };
      }

      if (filter.createdAfter) {
        whereClause.createdAt = {
          gte: filter.createdAfter
        };
      }

      // Execute query
      const dbRooms = await prisma.gameRoom.findMany({
        where: whereClause,
        include: {
          host: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatarUrl: true
            }
          },
          analytics: {
            orderBy: { date: 'desc' },
            take: 1
          }
        },
        take: this.config.discovery.maxResults,
        orderBy: this.buildOrderByClause(filter.sortBy, filter.sortOrder)
      });

      // Convert to room list entries
      const roomList: RoomListEntry[] = dbRooms.map(room => ({
        id: room.id,
        code: room.code,
        name: room.name,
        description: room.description,
        category: room.category as RoomCategory,
        tags: room.tags,
        gameMode: room.gameMode as GameMode,
        currentPlayers: room.currentPlayers,
        maxPlayers: room.maxPlayers,
        spectatorCount: room.spectatorCount,
        hasPassword: !!room.password,
        allowsSpectators: true, // From room settings
        status: room.status as GameRoomStatus,
        hostUsername: room.host.username,
        hostRating: 5.0, // Would calculate from host statistics
        popularity: room.analytics[0]?.popularityScore || 0,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        friendsInRoom: 0, // Would calculate based on user's friends
        canJoin: this.canUserJoinRoom(room, userId),
        joinRestriction: this.getJoinRestriction(room, userId)
      }));

      // Cache results
      this.discoveryCache.set(cacheKey, {
        data: roomList,
        timestamp: Date.now()
      });

      return this.personalizeRoomList(roomList, userId);

    } catch (error) {
      logger.error('Failed to discover rooms', { filter, error });
      throw error;
    }
  }

  /**
   * Get room recommendations for user
   */
  public async getRoomRecommendations(userId: string, limit: number = 10): Promise<RoomRecommendation[]> {
    try {
      if (!this.config.discovery.enableRecommendations) {
        return [];
      }

      // Get user's game history and preferences
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          profile: true,
          statistics: true,
          friends: {
            where: { status: 'ACCEPTED' },
            include: { friend: true }
          }
        }
      });

      if (!user) {
        return [];
      }

      // Get available rooms
      const availableRooms = await this.discoverRooms({}, userId);

      // Calculate recommendation scores
      const recommendations: RoomRecommendation[] = [];

      for (const room of availableRooms) {
        const score = await this.calculateRecommendationScore(room, user);
        const reasons = this.generateRecommendationReasons(room, user);

        if (score > 0.3) { // Minimum recommendation threshold
          recommendations.push({
            roomId: room.id,
            score,
            reasons,
            room
          });
        }
      }

      // Sort by score and limit results
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    } catch (error) {
      logger.error('Failed to get room recommendations', { userId, error });
      return [];
    }
  }

  // ==========================================
  // ROOM ANALYTICS AND POPULARITY
  // ==========================================

  /**
   * Initialize room analytics
   */
  private initializeRoomAnalytics(roomId?: string): RoomAnalytics {
    const analytics: RoomAnalytics = {
      totalUniqueVisitors: 0,
      peakConcurrentPlayers: 0,
      averagePlayersPerGame: 0,
      playerRetentionRate: 0,
      totalGamesPlayed: 0,
      averageGameDuration: 0,
      completionRate: 0,
      abandonmentRate: 0,
      totalChatMessages: 0,
      averageMessagesPerPlayer: 0,
      totalReactions: 0,
      powerUpsUsedTotal: 0,
      averageQuestionResponseTime: 0,
      averageScore: 0,
      difficultyDistribution: {},
      categoryPopularity: {},
      friendInvites: 0,
      spectatorMinutes: 0,
      userRatings: {
        average: 0,
        distribution: {}
      },
      hourlyActivity: new Array(24).fill(0),
      dailyActivity: new Array(7).fill(0),
      weeklyActivity: new Array(4).fill(0)
    };

    if (roomId) {
      this.roomAnalytics.set(roomId, analytics);
    }

    return analytics;
  }

  /**
   * Initialize room popularity
   */
  private initializeRoomPopularity(): RoomPopularity {
    return {
      score: 0,
      views: 0,
      joins: 0,
      completions: 0,
      rating: 0,
      ratingCount: 0,
      bookmarks: 0,
      shares: 0,
      hourlyJoins: 0,
      dailyJoins: 0,
      weeklyJoins: 0,
      trend: 'stable',
      retentionRate: 0,
      averageSessionDuration: 0,
      chatActivityLevel: 'low',
      powerUpUsageRate: 0
    };
  }

  /**
   * Update room analytics
   */
  public async updateRoomAnalytics(roomId: string, event: string, data: any): Promise<void> {
    try {
      let analytics = this.roomAnalytics.get(roomId);
      if (!analytics) {
        analytics = this.initializeRoomAnalytics();
        this.roomAnalytics.set(roomId, analytics);
      }

      const hour = new Date().getHours();
      const dayOfWeek = new Date().getDay();
      const week = Math.floor(new Date().getDate() / 7);

      switch (event) {
        case 'player_joined':
          analytics.totalUniqueVisitors++;
          analytics.hourlyActivity[hour]++;
          analytics.dailyActivity[dayOfWeek]++;
          analytics.weeklyActivity[week]++;
          break;
        
        case 'game_started':
          analytics.totalGamesPlayed++;
          break;
        
        case 'game_completed':
          analytics.completionRate = analytics.totalGamesPlayed > 0 
            ? analytics.completions / analytics.totalGamesPlayed 
            : 0;
          break;
        
        case 'chat_message':
          analytics.totalChatMessages++;
          break;
        
        case 'power_up_used':
          analytics.powerUpsUsedTotal++;
          break;
      }

      // Update popularity score
      this.updateRoomPopularity(roomId, event, data);

      // Emit analytics update event
      this.emit('room:analytics_updated', { roomId, analytics });

    } catch (error) {
      logger.error('Failed to update room analytics', { roomId, event, error });
    }
  }

  /**
   * Update room popularity
   */
  private updateRoomPopularity(roomId: string, event: string, data: any): void {
    let popularity = this.roomPopularity.get(roomId);
    if (!popularity) {
      popularity = this.initializeRoomPopularity();
      this.roomPopularity.set(roomId, popularity);
    }

    switch (event) {
      case 'room_viewed':
        popularity.views++;
        break;
      
      case 'player_joined':
        popularity.joins++;
        popularity.hourlyJoins++;
        popularity.dailyJoins++;
        popularity.weeklyJoins++;
        break;
      
      case 'game_completed':
        popularity.completions++;
        break;
      
      case 'room_rated':
        popularity.rating = (popularity.rating * popularity.ratingCount + data.rating) / (popularity.ratingCount + 1);
        popularity.ratingCount++;
        break;
      
      case 'room_bookmarked':
        popularity.bookmarks++;
        break;
      
      case 'room_shared':
        popularity.shares++;
        break;
    }

    // Calculate popularity score (0-100)
    popularity.score = Math.min(100, 
      (popularity.joins * 2) + 
      (popularity.completions * 5) + 
      (popularity.rating * 10) + 
      (popularity.bookmarks * 3) + 
      (popularity.shares * 4)
    );

    // Determine trend
    const recentActivity = popularity.hourlyJoins + popularity.dailyJoins;
    if (recentActivity > 10) {
      popularity.trend = 'rising';
    } else if (recentActivity < 2) {
      popularity.trend = 'declining';
    } else {
      popularity.trend = 'stable';
    }

    this.emit('room:popularity_updated', { roomId, popularity });
  }

  // ==========================================
  // ROOM TEMPLATES
  // ==========================================

  /**
   * Load room templates
   */
  private async loadRoomTemplates(): Promise<void> {
    const templates: RoomTemplate[] = [
      {
        id: 'classic_trivia',
        name: 'Classic Trivia',
        description: 'Traditional quiz room with standard settings',
        category: RoomCategory.TRIVIA,
        gameMode: GameMode.CLASSIC,
        settings: {
          questionTimeLimit: 30,
          allowPowerUps: true,
          showCorrectAnswers: true
        },
        tags: ['trivia', 'classic', 'general'],
        difficulty: 'medium',
        estimatedDuration: 15,
        minPlayers: 2,
        maxPlayers: 20,
        isOfficial: true,
        createdBy: undefined,
        usageCount: 0,
        rating: 5.0,
        iconUrl: '/templates/classic-trivia.svg'
      },
      {
        id: 'speed_challenge',
        name: 'Speed Challenge',
        description: 'Fast-paced quiz with reduced time limits',
        category: RoomCategory.ENTERTAINMENT,
        gameMode: GameMode.SPEED_ROUND,
        settings: {
          questionTimeLimit: 15,
          allowPowerUps: true,
          showCorrectAnswers: false
        },
        tags: ['speed', 'challenge', 'fast'],
        difficulty: 'hard',
        estimatedDuration: 10,
        minPlayers: 3,
        maxPlayers: 15,
        isOfficial: true,
        createdBy: undefined,
        usageCount: 0,
        rating: 4.5,
        iconUrl: '/templates/speed-challenge.svg'
      },
      {
        id: 'elimination_battle',
        name: 'Elimination Battle',
        description: 'Last player standing wins',
        category: RoomCategory.GENERAL,
        gameMode: GameMode.ELIMINATION,
        settings: {
          questionTimeLimit: 25,
          allowPowerUps: false,
          showCorrectAnswers: true
        },
        tags: ['elimination', 'battle', 'competitive'],
        difficulty: 'hard',
        estimatedDuration: 20,
        minPlayers: 5,
        maxPlayers: 30,
        isOfficial: true,
        createdBy: undefined,
        usageCount: 0,
        rating: 4.8,
        iconUrl: '/templates/elimination-battle.svg'
      }
    ];

    for (const template of templates) {
      this.roomTemplates.set(template.id, template);
    }

    logger.info('Room templates loaded', { count: templates.length });
  }

  /**
   * Get room template
   */
  public getRoomTemplate(templateId: string): RoomTemplate | undefined {
    return this.roomTemplates.get(templateId);
  }

  /**
   * Get all room templates
   */
  public getAllRoomTemplates(): RoomTemplate[] {
    return Array.from(this.roomTemplates.values());
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Get room by ID
   */
  public async getRoom(roomId: string): Promise<EnhancedGameRoom | null> {
    // Check cache first
    const cached = this.activeRooms.get(roomId);
    if (cached) {
      return cached;
    }

    // Load from database
    const dbRoom = await prisma.gameRoom.findUnique({
      where: { id: roomId },
      include: {
        host: true,
        participants: {
          include: {
            user: {
              include: {
                profile: true,
                statistics: true
              }
            }
          }
        },
        analytics: {
          orderBy: { date: 'desc' },
          take: 1
        }
      }
    });

    if (!dbRoom) {
      return null;
    }

    // Convert to enhanced room (simplified)
    const enhancedRoom = this.convertDbRoomToEnhanced(dbRoom);
    this.activeRooms.set(roomId, enhancedRoom);
    
    return enhancedRoom;
  }

  /**
   * Convert database room to enhanced room
   */
  private convertDbRoomToEnhanced(dbRoom: any): EnhancedGameRoom {
    // This is a simplified conversion
    // In a real implementation, you'd properly map all fields
    return {
      ...dbRoom,
      visibility: dbRoom.isPrivate ? RoomVisibility.PRIVATE : RoomVisibility.PUBLIC,
      coHosts: [],
      moderators: [],
      waitingList: [],
      allowSpectators: true,
      requireApproval: false,
      inviteOnly: false,
      allowChat: true,
      allowReactions: true,
      allowVoiceChat: false,
      popularity: this.roomPopularity.get(dbRoom.id) || this.initializeRoomPopularity(),
      analytics: this.roomAnalytics.get(dbRoom.id) || this.initializeRoomAnalytics(),
      reconnectionTokens: new Map(),
      isLocked: false,
      maintenanceMode: false,
      customData: {}
    } as EnhancedGameRoom;
  }

  /**
   * Generate discovery cache key
   */
  private generateDiscoveryCacheKey(filter: RoomDiscoveryFilter): string {
    return `discovery_${JSON.stringify(filter)}`;
  }

  /**
   * Build order by clause for room discovery
   */
  private buildOrderByClause(sortBy?: string, sortOrder?: string): any {
    const order = sortOrder === 'desc' ? 'desc' : 'asc';
    
    switch (sortBy) {
      case 'popularity':
        return { lastActivity: 'desc' }; // Simplified
      case 'newest':
        return { createdAt: order };
      case 'players':
        return { currentPlayers: order };
      case 'activity':
        return { lastActivity: order };
      default:
        return { createdAt: 'desc' };
    }
  }

  /**
   * Check if user can join room
   */
  private canUserJoinRoom(room: any, userId?: string): boolean {
    if (!userId) return false;
    if (room.currentPlayers >= room.maxPlayers) return false;
    if (this.isUserBanned(room.id, userId)) return false;
    return true;
  }

  /**
   * Get join restriction for room
   */
  private getJoinRestriction(room: any, userId?: string): string | undefined {
    if (room.currentPlayers >= room.maxPlayers) return 'full';
    if (room.password) return 'password';
    if (this.isUserBanned(room.id, userId)) return 'banned';
    return undefined;
  }

  /**
   * Check if user is banned from room
   */
  private isUserBanned(roomId: string, userId?: string): boolean {
    if (!userId) return false;
    // Implementation would check moderation actions
    return false;
  }

  /**
   * Personalize room list for user
   */
  private personalizeRoomList(rooms: RoomListEntry[], userId?: string): RoomListEntry[] {
    if (!userId) return rooms;

    // Add personalized data like friends in room, etc.
    return rooms.map(room => ({
      ...room,
      friendsInRoom: 0, // Would calculate based on user's friends
      estimatedWaitTime: this.calculateEstimatedWaitTime(room)
    }));
  }

  /**
   * Calculate estimated wait time
   */
  private calculateEstimatedWaitTime(room: RoomListEntry): number | undefined {
    if (room.status === GameRoomStatus.IN_PROGRESS) {
      return 300; // 5 minutes average game time remaining
    }
    if (room.status === GameRoomStatus.WAITING) {
      return 60; // 1 minute until game starts
    }
    return undefined;
  }

  /**
   * Calculate recommendation score
   */
  private async calculateRecommendationScore(room: RoomListEntry, user: any): Promise<number> {
    let score = 0.5; // Base score

    // Category preference (would be based on user history)
    if (room.category === RoomCategory.TRIVIA) {
      score += 0.2;
    }

    // Game mode preference
    if (room.gameMode === GameMode.CLASSIC) {
      score += 0.1;
    }

    // Popularity boost
    if (room.popularity > 50) {
      score += 0.1;
    }

    // Host rating boost
    if (room.hostRating > 4.0) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * Generate recommendation reasons
   */
  private generateRecommendationReasons(room: RoomListEntry, user: any): RecommendationReason[] {
    const reasons: RecommendationReason[] = [];

    if (room.popularity > 50) {
      reasons.push({
        type: 'trending',
        weight: 0.3,
        description: 'This room is trending with other players'
      });
    }

    if (room.hostRating > 4.0) {
      reasons.push({
        type: 'host_rating',
        weight: 0.2,
        description: 'The host has excellent ratings from other players'
      });
    }

    return reasons;
  }

  /**
   * Get participant permissions based on role
   */
  private getParticipantPermissions(role: ParticipantRole): any {
    const basePermissions = {
      canChat: true,
      canUseReactions: true,
      canUsePowerUps: false,
      canInviteFriends: true,
      canUseVoiceChat: false,
      canShareScreen: false,
      canModifySettings: false,
      canKickPlayers: false,
      canMuteUsers: false,
      canStartGame: false,
      canPauseGame: false,
      canPromoteSpectators: false
    };

    switch (role) {
      case ParticipantRole.HOST:
        return {
          ...basePermissions,
          canUsePowerUps: true,
          canUseVoiceChat: true,
          canShareScreen: true,
          canModifySettings: true,
          canKickPlayers: true,
          canMuteUsers: true,
          canStartGame: true,
          canPauseGame: true,
          canPromoteSpectators: true
        };
      
      case ParticipantRole.CO_HOST:
        return {
          ...basePermissions,
          canUsePowerUps: true,
          canUseVoiceChat: true,
          canKickPlayers: true,
          canMuteUsers: true,
          canStartGame: true,
          canPromoteSpectators: true
        };
      
      case ParticipantRole.PLAYER:
        return {
          ...basePermissions,
          canUsePowerUps: true,
          canUseVoiceChat: true
        };
      
      case ParticipantRole.SPECTATOR:
        return {
          ...basePermissions,
          canUsePowerUps: false
        };
      
      case ParticipantRole.MODERATOR:
        return {
          ...basePermissions,
          canKickPlayers: true,
          canMuteUsers: true
        };
      
      default:
        return basePermissions;
    }
  }

  /**
   * Start analytics collection
   */
  private startAnalyticsCollection(): void {
    if (!this.config.analytics.enableRealTime) {
      return;
    }

    // Collect analytics every interval
    setInterval(() => {
      this.collectAnalytics();
    }, this.config.analytics.aggregationInterval * 60000);
  }

  /**
   * Collect analytics data
   */
  private async collectAnalytics(): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Aggregate analytics for all active rooms
      for (const [roomId, analytics] of this.roomAnalytics) {
        await prisma.gameRoomAnalytics.upsert({
          where: {
            roomId_date: {
              roomId,
              date: today
            }
          },
          create: {
            roomId,
            date: today,
            playersJoined: analytics.totalUniqueVisitors,
            gamesCompleted: analytics.totalGamesPlayed,
            averageScore: analytics.averageScore,
            popularityScore: this.roomPopularity.get(roomId)?.score || 0,
            chatMessages: analytics.totalChatMessages,
            powerUpsUsed: analytics.powerUpsUsedTotal,
            spectatorMinutes: analytics.spectatorMinutes
          },
          update: {
            playersJoined: analytics.totalUniqueVisitors,
            gamesCompleted: analytics.totalGamesPlayed,
            averageScore: analytics.averageScore,
            popularityScore: this.roomPopularity.get(roomId)?.score || 0,
            chatMessages: analytics.totalChatMessages,
            powerUpsUsed: analytics.powerUpsUsedTotal,
            spectatorMinutes: analytics.spectatorMinutes
          }
        });
      }

      logger.debug('Analytics collected for active rooms');
    } catch (error) {
      logger.error('Failed to collect analytics', { error });
    }
  }

  /**
   * Start cleanup routines
   */
  private startCleanupRoutines(): void {
    // Clean up inactive rooms every hour
    setInterval(() => {
      this.cleanupInactiveRooms();
    }, 3600000);

    // Clean up discovery cache every 5 minutes
    setInterval(() => {
      this.cleanupDiscoveryCache();
    }, 300000);
  }

  /**
   * Clean up inactive rooms
   */
  private async cleanupInactiveRooms(): Promise<void> {
    const cutoffTime = new Date(Date.now() - this.config.roomInactivityTimeout * 60000);
    
    // Find inactive rooms
    const inactiveRooms = await prisma.gameRoom.findMany({
      where: {
        lastActivity: { lt: cutoffTime },
        status: { in: [GameRoomStatus.WAITING, GameRoomStatus.FINISHED] },
        currentPlayers: 0
      }
    });

    for (const room of inactiveRooms) {
      await this.cleanupRoom(room.id);
    }

    if (inactiveRooms.length > 0) {
      logger.info('Cleaned up inactive rooms', { count: inactiveRooms.length });
    }
  }

  /**
   * Clean up room
   */
  private async cleanupRoom(roomId: string): Promise<void> {
    try {
      // Remove from caches
      this.activeRooms.delete(roomId);
      this.roomAnalytics.delete(roomId);
      this.roomPopularity.delete(roomId);
      this.moderationActions.delete(roomId);

      // Update database status
      await prisma.gameRoom.update({
        where: { id: roomId },
        data: { status: GameRoomStatus.ABANDONED }
      });

      // Emit cleanup event
      this.emit('room:cleaned_up', { roomId });

    } catch (error) {
      logger.error('Failed to cleanup room', { roomId, error });
    }
  }

  /**
   * Clean up discovery cache
   */
  private cleanupDiscoveryCache(): void {
    const now = Date.now();
    const cacheTimeout = this.config.discovery.cacheTimeout * 1000;

    for (const [key, cached] of this.discoveryCache) {
      if (now - cached.timestamp > cacheTimeout) {
        this.discoveryCache.delete(key);
      }
    }
  }
}
