/**
 * Phase 2.3: Social Service
 * Core service for managing friends, chat, reactions, and social interactions
 */

import { EventEmitter } from 'events';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import {
  UserFriend,
  FriendRequest,
  FriendshipStatus,
  ChatMessage,
  ChatReaction,
  ChatRoom,
  ChatSettings,
  UserProfile,
  UserPreferences,
  PrivacySettings,
  ReactionEvent,
  QuickReaction,
  SocialFeedItem,
  UserActivity,
  SocialLeaderboard,
  LeaderboardEntry,
  SocialError,
  SocialErrorCode,
  MessageType,
  ParticipantRole
} from '@/types/social';

export class SocialService extends EventEmitter {
  private static instance: SocialService | null = null;
  private chatRooms: Map<string, ChatRoom> = new Map();
  private userActivities: Map<string, UserActivity> = new Map();
  private activeConnections: Map<string, Set<string>> = new Map(); // roomId -> userIds
  
  // Rate limiting
  private messageRateLimits: Map<string, number[]> = new Map(); // userId -> timestamps
  private reactionRateLimits: Map<string, number[]> = new Map();

  // Default configurations
  private readonly DEFAULT_CHAT_SETTINGS: ChatSettings = {
    allowChat: true,
    allowReactions: true,
    allowMentions: true,
    allowLinks: false,
    allowEmojis: true,
    maxMessageLength: 500,
    rateLimitMessages: 10, // per minute
    moderationLevel: 'basic',
    wordFilter: ['spam', 'inappropriate'], // This would be loaded from config
    requireApproval: false
  };

  private readonly DEFAULT_USER_PREFERENCES: UserPreferences = {
    notifications: {
      friendRequests: true,
      gameInvites: true,
      achievements: true,
      chatMentions: true,
      powerUpEffects: true
    },
    gameplay: {
      allowSpectators: true,
      showPerformanceStats: true,
      autoJoinFriendGames: false,
      preferredGameModes: ['CLASSIC']
    },
    appearance: {
      theme: 'auto',
      language: 'en',
      timezone: 'UTC',
      showAnimations: true
    }
  };

  private readonly DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
    profileVisibility: 'public',
    onlineStatus: 'visible',
    allowFriendRequests: true,
    allowGameInvites: 'everyone',
    showGameHistory: true,
    showStatistics: true,
    allowSpectating: 'everyone'
  };

  private constructor() {
    super();
    this.initializeService();
  }

  public static getInstance(): SocialService {
    if (!SocialService.instance) {
      SocialService.instance = new SocialService();
    }
    return SocialService.instance;
  }

  /**
   * Initialize the social service
   */
  private async initializeService(): Promise<void> {
    try {
      // Initialize default quick reactions
      await this.initializeQuickReactions();
      
      // Start cleanup routines
      this.startCleanupRoutines();
      
      logger.info('SocialService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SocialService', { error });
      throw error;
    }
  }

  // ==========================================
  // FRIEND SYSTEM
  // ==========================================

  /**
   * Send friend request
   */
  public async sendFriendRequest(fromUserId: string, toUserId: string, message?: string): Promise<UserFriend> {
    try {
      // Validate users exist
      const [fromUser, toUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: fromUserId } }),
        prisma.user.findUnique({ where: { id: toUserId } })
      ]);

      if (!fromUser || !toUser) {
        throw new SocialError(SocialErrorCode.FRIEND_REQUEST_NOT_FOUND, 'User not found');
      }

      if (fromUserId === toUserId) {
        throw new SocialError(SocialErrorCode.CANNOT_FRIEND_SELF, 'Cannot send friend request to yourself');
      }

      // Check if already friends or request exists
      const existingRelation = await prisma.userFriend.findFirst({
        where: {
          OR: [
            { userId: fromUserId, friendId: toUserId },
            { userId: toUserId, friendId: fromUserId }
          ]
        }
      });

      if (existingRelation) {
        if (existingRelation.status === FriendshipStatus.ACCEPTED) {
          throw new SocialError(SocialErrorCode.ALREADY_FRIENDS, 'Already friends');
        }
        if (existingRelation.status === FriendshipStatus.PENDING) {
          throw new SocialError(SocialErrorCode.FRIEND_REQUEST_ALREADY_SENT, 'Friend request already sent');
        }
        if (existingRelation.status === FriendshipStatus.BLOCKED) {
          throw new SocialError(SocialErrorCode.USER_BLOCKED, 'User is blocked');
        }
      }

      // Check recipient's privacy settings
      const toUserProfile = await this.getUserProfile(toUserId);
      if (!toUserProfile.privacySettings.allowFriendRequests) {
        throw new SocialError(SocialErrorCode.FRIEND_REQUESTS_DISABLED, 'User does not accept friend requests');
      }

      // Create friend request
      const friendRequest = await prisma.userFriend.create({
        data: {
          userId: toUserId, // The recipient
          friendId: fromUserId, // The requester
          status: FriendshipStatus.PENDING,
          requestedBy: fromUserId
        },
        include: {
          friend: {
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

      // Emit event for real-time notification
      this.emit('friend:request_sent', {
        fromUserId,
        toUserId,
        friendRequest,
        message
      });

      logger.info('Friend request sent', { fromUserId, toUserId });
      return friendRequest;

    } catch (error) {
      logger.error('Failed to send friend request', { fromUserId, toUserId, error });
      throw error;
    }
  }

  /**
   * Respond to friend request
   */
  public async respondToFriendRequest(requestId: string, userId: string, accept: boolean): Promise<UserFriend> {
    try {
      const friendRequest = await prisma.userFriend.findUnique({
        where: { id: requestId }
      });

      if (!friendRequest) {
        throw new SocialError(SocialErrorCode.FRIEND_REQUEST_NOT_FOUND, 'Friend request not found');
      }

      if (friendRequest.userId !== userId) {
        throw new SocialError(SocialErrorCode.INSUFFICIENT_PERMISSIONS, 'Cannot respond to this friend request');
      }

      const newStatus = accept ? FriendshipStatus.ACCEPTED : FriendshipStatus.DECLINED;
      const acceptedAt = accept ? new Date() : undefined;

      // Update the request
      const updatedRequest = await prisma.userFriend.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          acceptedAt
        },
        include: {
          friend: {
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

      if (accept) {
        // Create reciprocal friendship
        await prisma.userFriend.create({
          data: {
            userId: friendRequest.friendId,
            friendId: friendRequest.userId,
            status: FriendshipStatus.ACCEPTED,
            requestedBy: friendRequest.requestedBy,
            acceptedAt: new Date()
          }
        });
      }

      // Emit event
      this.emit('friend:request_responded', {
        requestId,
        userId,
        accepted: accept,
        friendRequest: updatedRequest
      });

      logger.info('Friend request responded', { requestId, userId, accept });
      return updatedRequest;

    } catch (error) {
      logger.error('Failed to respond to friend request', { requestId, userId, accept, error });
      throw error;
    }
  }

  /**
   * Get user's friends
   */
  public async getUserFriends(userId: string): Promise<UserFriend[]> {
    return await prisma.userFriend.findMany({
      where: {
        userId,
        status: FriendshipStatus.ACCEPTED
      },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            profile: true
          }
        }
      },
      orderBy: { acceptedAt: 'desc' }
    });
  }

  /**
   * Get friend requests for user
   */
  public async getFriendRequests(userId: string): Promise<UserFriend[]> {
    return await prisma.userFriend.findMany({
      where: {
        userId,
        status: FriendshipStatus.PENDING
      },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { requestedAt: 'desc' }
    });
  }

  /**
   * Block user
   */
  public async blockUser(userId: string, targetUserId: string): Promise<void> {
    try {
      // Remove existing friendship if any
      await prisma.userFriend.deleteMany({
        where: {
          OR: [
            { userId, friendId: targetUserId },
            { userId: targetUserId, friendId: userId }
          ]
        }
      });

      // Create block relationship
      await prisma.userFriend.create({
        data: {
          userId,
          friendId: targetUserId,
          status: FriendshipStatus.BLOCKED,
          requestedBy: userId,
          blockedAt: new Date()
        }
      });

      this.emit('user:blocked', { userId, targetUserId });
      logger.info('User blocked', { userId, targetUserId });

    } catch (error) {
      logger.error('Failed to block user', { userId, targetUserId, error });
      throw error;
    }
  }

  // ==========================================
  // USER PROFILES
  // ==========================================

  /**
   * Get user profile
   */
  public async getUserProfile(userId: string): Promise<UserProfile> {
    let profile = await prisma.userProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      // Create default profile
      profile = await prisma.userProfile.create({
        data: {
          userId,
          preferences: this.DEFAULT_USER_PREFERENCES,
          privacySettings: this.DEFAULT_PRIVACY_SETTINGS,
          isOnline: false
        }
      });
    }

    return profile as UserProfile;
  }

  /**
   * Update user profile
   */
  public async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const profile = await prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          ...updates,
          preferences: updates.preferences || this.DEFAULT_USER_PREFERENCES,
          privacySettings: updates.privacySettings || this.DEFAULT_PRIVACY_SETTINGS
        },
        update: updates
      });

      this.emit('profile:updated', { userId, profile });
      return profile as UserProfile;

    } catch (error) {
      logger.error('Failed to update user profile', { userId, updates, error });
      throw new SocialError(SocialErrorCode.PROFILE_UPDATE_FAILED, 'Failed to update profile');
    }
  }

  /**
   * Update user online status
   */
  public async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    try {
      await prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          isOnline,
          lastSeenAt: new Date(),
          preferences: this.DEFAULT_USER_PREFERENCES,
          privacySettings: this.DEFAULT_PRIVACY_SETTINGS
        },
        update: {
          isOnline,
          lastSeenAt: new Date()
        }
      });

      // Update user activity
      this.userActivities.set(userId, {
        userId,
        activity: isOnline ? 'online' : 'offline',
        lastUpdate: new Date()
      });

      this.emit('user:online_status_changed', { userId, isOnline });

    } catch (error) {
      logger.error('Failed to update online status', { userId, isOnline, error });
    }
  }

  // ==========================================
  // CHAT SYSTEM
  // ==========================================

  /**
   * Initialize chat room
   */
  public initializeChatRoom(roomId: string, settings?: Partial<ChatSettings>): ChatRoom {
    const chatRoom: ChatRoom = {
      id: roomId,
      participants: new Map(),
      messages: [],
      settings: { ...this.DEFAULT_CHAT_SETTINGS, ...settings },
      moderators: new Set(),
      bannedUsers: new Set(),
      mutedUsers: new Map(),
      messageCount: 0,
      lastActivity: new Date()
    };

    this.chatRooms.set(roomId, chatRoom);
    this.activeConnections.set(roomId, new Set());

    logger.info('Chat room initialized', { roomId });
    return chatRoom;
  }

  /**
   * Add participant to chat room
   */
  public addChatParticipant(roomId: string, userId: string, username: string, role: ParticipantRole): void {
    const chatRoom = this.chatRooms.get(roomId);
    if (!chatRoom) {
      logger.warn('Chat room not found', { roomId });
      return;
    }

    const participant = {
      userId,
      username,
      role,
      joinedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      isMuted: false
    };

    chatRoom.participants.set(userId, participant);
    
    const activeUsers = this.activeConnections.get(roomId) || new Set();
    activeUsers.add(userId);
    this.activeConnections.set(roomId, activeUsers);

    this.emit('chat:participant_joined', { roomId, userId, username, role });
  }

  /**
   * Remove participant from chat room
   */
  public removeChatParticipant(roomId: string, userId: string): void {
    const chatRoom = this.chatRooms.get(roomId);
    if (!chatRoom) return;

    chatRoom.participants.delete(userId);
    
    const activeUsers = this.activeConnections.get(roomId);
    if (activeUsers) {
      activeUsers.delete(userId);
    }

    this.emit('chat:participant_left', { roomId, userId });
  }

  /**
   * Send chat message
   */
  public async sendChatMessage(
    roomId: string,
    userId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
    metadata?: any
  ): Promise<ChatMessage> {
    try {
      const chatRoom = this.chatRooms.get(roomId);
      if (!chatRoom) {
        throw new SocialError(SocialErrorCode.CHAT_DISABLED, 'Chat room not found');
      }

      if (!chatRoom.settings.allowChat) {
        throw new SocialError(SocialErrorCode.CHAT_DISABLED, 'Chat is disabled');
      }

      const participant = chatRoom.participants.get(userId);
      if (!participant) {
        throw new SocialError(SocialErrorCode.INSUFFICIENT_PERMISSIONS, 'Not a participant in this chat');
      }

      if (participant.isMuted) {
        throw new SocialError(SocialErrorCode.USER_MUTED, 'You are muted in this chat');
      }

      // Check rate limiting
      if (!this.checkMessageRateLimit(userId, chatRoom.settings.rateLimitMessages)) {
        throw new SocialError(SocialErrorCode.RATE_LIMITED, 'Rate limit exceeded');
      }

      // Validate message content
      if (content.length > chatRoom.settings.maxMessageLength) {
        throw new SocialError(SocialErrorCode.MESSAGE_TOO_LONG, 'Message too long');
      }

      // Apply content filtering
      const filteredContent = this.filterMessageContent(content, chatRoom.settings);

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          avatarUrl: true
        }
      });

      if (!user) {
        throw new SocialError(SocialErrorCode.INSUFFICIENT_PERMISSIONS, 'User not found');
      }

      // Create message
      const message = await prisma.chatMessage.create({
        data: {
          roomId,
          userId,
          content: filteredContent,
          type,
          metadata
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true
            }
          },
          reactions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  avatarUrl: true
                }
              }
            }
          }
        }
      });

      // Update chat room state
      const chatMessage: ChatMessage = {
        ...message,
        user: {
          ...message.user,
          role: participant.role
        }
      };

      chatRoom.messages.push(chatMessage);
      chatRoom.messageCount++;
      chatRoom.lastActivity = new Date();
      
      // Update participant stats
      participant.messageCount++;
      participant.lastActivity = new Date();

      // Emit message event
      this.emit('chat:message_sent', { roomId, message: chatMessage });

      logger.info('Chat message sent', { roomId, userId, messageLength: content.length });
      return chatMessage;

    } catch (error) {
      logger.error('Failed to send chat message', { roomId, userId, error });
      throw error;
    }
  }

  /**
   * Add reaction to message
   */
  public async addReaction(messageId: string, userId: string, emoji: string): Promise<ChatReaction> {
    try {
      // Check if reaction already exists
      const existingReaction = await prisma.chatReaction.findUnique({
        where: {
          messageId_userId_emoji: {
            messageId,
            userId,
            emoji
          }
        }
      });

      if (existingReaction) {
        return existingReaction as ChatReaction;
      }

      // Check rate limiting
      if (!this.checkReactionRateLimit(userId)) {
        throw new SocialError(SocialErrorCode.RATE_LIMITED, 'Reaction rate limit exceeded');
      }

      // Create reaction
      const reaction = await prisma.chatReaction.create({
        data: {
          messageId,
          userId,
          emoji
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true
            }
          }
        }
      });

      this.emit('chat:reaction_added', { messageId, reaction });
      return reaction as ChatReaction;

    } catch (error) {
      logger.error('Failed to add reaction', { messageId, userId, emoji, error });
      throw error;
    }
  }

  /**
   * Send quick reaction
   */
  public sendQuickReaction(
    roomId: string,
    userId: string,
    reactionId: string,
    targetType: string,
    targetId?: string
  ): ReactionEvent {
    const reaction: ReactionEvent = {
      id: `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      roomId,
      targetId,
      targetType,
      reactionId,
      emoji: this.getEmojiForReaction(reactionId),
      timestamp: new Date()
    };

    this.emit('reaction:sent', { roomId, reaction });
    return reaction;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Check message rate limit
   */
  private checkMessageRateLimit(userId: string, rateLimitPerMinute: number): boolean {
    const now = Date.now();
    const userTimestamps = this.messageRateLimits.get(userId) || [];
    
    // Remove timestamps older than 1 minute
    const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < 60000);
    
    if (recentTimestamps.length >= rateLimitPerMinute) {
      return false;
    }

    recentTimestamps.push(now);
    this.messageRateLimits.set(userId, recentTimestamps);
    return true;
  }

  /**
   * Check reaction rate limit
   */
  private checkReactionRateLimit(userId: string): boolean {
    const now = Date.now();
    const userTimestamps = this.reactionRateLimits.get(userId) || [];
    
    // Remove timestamps older than 1 minute
    const recentTimestamps = userTimestamps.filter(timestamp => now - timestamp < 60000);
    
    // Allow 30 reactions per minute
    if (recentTimestamps.length >= 30) {
      return false;
    }

    recentTimestamps.push(now);
    this.reactionRateLimits.set(userId, recentTimestamps);
    return true;
  }

  /**
   * Filter message content
   */
  private filterMessageContent(content: string, settings: ChatSettings): string {
    let filtered = content;

    // Apply word filter
    if (settings.moderationLevel !== 'none') {
      for (const word of settings.wordFilter) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        filtered = filtered.replace(regex, '*'.repeat(word.length));
      }
    }

    // Remove links if not allowed
    if (!settings.allowLinks) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      filtered = filtered.replace(urlRegex, '[link removed]');
    }

    return filtered.trim();
  }

  /**
   * Get emoji for reaction ID
   */
  private getEmojiForReaction(reactionId: string): string {
    const reactionMap: Record<string, string> = {
      'like': '👍',
      'love': '❤️',
      'laugh': '😂',
      'wow': '😮',
      'sad': '😢',
      'angry': '😠',
      'fire': '🔥',
      'star': '⭐',
      'thinking': '🤔',
      'clap': '👏'
    };

    return reactionMap[reactionId] || '👍';
  }

  /**
   * Initialize quick reactions
   */
  private async initializeQuickReactions(): Promise<void> {
    // This would typically load from database
    const quickReactions: QuickReaction[] = [
      { id: 'like', emoji: '👍', name: 'Like', description: 'Show approval', isActive: true, sortOrder: 1 },
      { id: 'love', emoji: '❤️', name: 'Love', description: 'Show love', isActive: true, sortOrder: 2 },
      { id: 'laugh', emoji: '😂', name: 'Laugh', description: 'Find it funny', isActive: true, sortOrder: 3 },
      { id: 'wow', emoji: '😮', name: 'Wow', description: 'Show surprise', isActive: true, sortOrder: 4 },
      { id: 'fire', emoji: '🔥', name: 'Fire', description: 'Show excitement', isActive: true, sortOrder: 5 },
      { id: 'clap', emoji: '👏', name: 'Clap', description: 'Show appreciation', isActive: true, sortOrder: 6 }
    ];

    // Store in memory or database as needed
    logger.info('Quick reactions initialized', { count: quickReactions.length });
  }

  /**
   * Start cleanup routines
   */
  private startCleanupRoutines(): void {
    // Clean up old chat messages every hour
    setInterval(() => {
      this.cleanupOldChatMessages();
    }, 3600000);

    // Clean up rate limit data every 5 minutes
    setInterval(() => {
      this.cleanupRateLimitData();
    }, 300000);
  }

  /**
   * Clean up old chat messages from memory
   */
  private cleanupOldChatMessages(): void {
    const maxMessagesPerRoom = 1000;
    const maxAgeHours = 24;

    for (const [roomId, chatRoom] of this.chatRooms) {
      // Remove old messages
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      chatRoom.messages = chatRoom.messages.filter(message => 
        message.createdAt.getTime() > cutoffTime
      );

      // Limit message count
      if (chatRoom.messages.length > maxMessagesPerRoom) {
        chatRoom.messages = chatRoom.messages.slice(-maxMessagesPerRoom);
      }
    }
  }

  /**
   * Clean up rate limit data
   */
  private cleanupRateLimitData(): void {
    const now = Date.now();
    
    // Clean message rate limits
    for (const [userId, timestamps] of this.messageRateLimits) {
      const recent = timestamps.filter(ts => now - ts < 60000);
      if (recent.length === 0) {
        this.messageRateLimits.delete(userId);
      } else {
        this.messageRateLimits.set(userId, recent);
      }
    }

    // Clean reaction rate limits
    for (const [userId, timestamps] of this.reactionRateLimits) {
      const recent = timestamps.filter(ts => now - ts < 60000);
      if (recent.length === 0) {
        this.reactionRateLimits.delete(userId);
      } else {
        this.reactionRateLimits.set(userId, recent);
      }
    }
  }

  /**
   * Get chat room
   */
  public getChatRoom(roomId: string): ChatRoom | undefined {
    return this.chatRooms.get(roomId);
  }

  /**
   * Clean up chat room
   */
  public cleanupChatRoom(roomId: string): void {
    this.chatRooms.delete(roomId);
    this.activeConnections.delete(roomId);
    logger.info('Chat room cleaned up', { roomId });
  }

  /**
   * Mute user in chat room
   */
  public muteUser(roomId: string, userId: string, durationMinutes: number = 10): void {
    const chatRoom = this.chatRooms.get(roomId);
    if (!chatRoom) return;

    const participant = chatRoom.participants.get(userId);
    if (!participant) return;

    const muteExpires = new Date(Date.now() + durationMinutes * 60000);
    participant.isMuted = true;
    participant.muteExpires = muteExpires;
    chatRoom.mutedUsers.set(userId, muteExpires);

    // Schedule unmute
    setTimeout(() => {
      participant.isMuted = false;
      chatRoom.mutedUsers.delete(userId);
      this.emit('chat:user_unmuted', { roomId, userId });
    }, durationMinutes * 60000);

    this.emit('chat:user_muted', { roomId, userId, durationMinutes });
    logger.info('User muted in chat', { roomId, userId, durationMinutes });
  }

  /**
   * Get recent chat messages
   */
  public async getRecentChatMessages(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
    return await prisma.chatMessage.findMany({
      where: { roomId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    }) as ChatMessage[];
  }
}
