/**
 * Phase 2.3: Social Features Types
 * Enhanced multiplayer social system definitions
 */

// Social feature enums matching Prisma
export enum FriendshipStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  BLOCKED = 'BLOCKED',
  DECLINED = 'DECLINED'
}

export enum MessageType {
  TEXT = 'TEXT',
  REACTION = 'REACTION',
  SYSTEM = 'SYSTEM',
  POWER_UP = 'POWER_UP',
  ACHIEVEMENT = 'ACHIEVEMENT'
}

export enum ParticipantRole {
  HOST = 'HOST',
  CO_HOST = 'CO_HOST',
  PLAYER = 'PLAYER',
  SPECTATOR = 'SPECTATOR',
  MODERATOR = 'MODERATOR'
}

export enum ParticipantStatus {
  WAITING = 'WAITING',
  READY = 'READY',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
  DISCONNECTED = 'DISCONNECTED',
  KICKED = 'KICKED',
  BANNED = 'BANNED'
}

// Friend system types
export interface UserFriend {
  id: string;
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  requestedBy: string;
  requestedAt: Date;
  acceptedAt?: Date;
  blockedAt?: Date;
  friend?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    profile?: UserProfile;
  };
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  message?: string;
  status: FriendshipStatus;
  createdAt: Date;
  fromUser: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
}

export interface UserProfile {
  id: string;
  userId: string;
  displayName?: string;
  bio?: string;
  location?: string;
  website?: string;
  socialLinks?: Record<string, string>;
  preferences: UserPreferences;
  privacySettings: PrivacySettings;
  isOnline: boolean;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  notifications: {
    friendRequests: boolean;
    gameInvites: boolean;
    achievements: boolean;
    chatMentions: boolean;
    powerUpEffects: boolean;
  };
  gameplay: {
    allowSpectators: boolean;
    showPerformanceStats: boolean;
    autoJoinFriendGames: boolean;
    preferredGameModes: string[];
  };
  appearance: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    timezone: string;
    showAnimations: boolean;
  };
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private';
  onlineStatus: 'visible' | 'friends_only' | 'hidden';
  allowFriendRequests: boolean;
  allowGameInvites: 'everyone' | 'friends' | 'nobody';
  showGameHistory: boolean;
  showStatistics: boolean;
  allowSpectating: 'everyone' | 'friends' | 'nobody';
}

// Chat system types
export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  type: MessageType;
  metadata?: {
    mentions?: string[]; // User IDs mentioned
    replyTo?: string; // Message ID being replied to
    powerUpId?: string; // For power-up related messages
    achievementId?: string; // For achievement messages
    isSystemGenerated?: boolean;
  };
  isDeleted: boolean;
  createdAt: Date;
  editedAt?: Date;
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
    role: ParticipantRole;
  };
  reactions: ChatReaction[];
}

export interface ChatReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export interface ChatRoom {
  id: string;
  participants: Map<string, ChatParticipant>;
  messages: ChatMessage[];
  settings: ChatSettings;
  moderators: Set<string>; // User IDs with moderation permissions
  bannedUsers: Set<string>; // Banned user IDs
  mutedUsers: Map<string, Date>; // User ID -> unmute time
  messageCount: number;
  lastActivity: Date;
}

export interface ChatParticipant {
  userId: string;
  username: string;
  role: ParticipantRole;
  joinedAt: Date;
  lastActivity: Date;
  messageCount: number;
  isMuted: boolean;
  muteExpires?: Date;
}

export interface ChatSettings {
  allowChat: boolean;
  allowReactions: boolean;
  allowMentions: boolean;
  allowLinks: boolean;
  allowEmojis: boolean;
  maxMessageLength: number;
  rateLimitMessages: number; // Messages per minute
  moderationLevel: 'none' | 'basic' | 'strict';
  wordFilter: string[];
  requireApproval: boolean;
}

// Real-time reaction system
export interface QuickReaction {
  id: string;
  emoji: string;
  name: string;
  description: string;
  soundEffect?: string;
  animationData?: any;
  isActive: boolean;
  sortOrder: number;
}

export interface ReactionEvent {
  id: string;
  userId: string;
  roomId: string;
  gameId?: string;
  targetId?: string; // Message ID, player ID, or question ID
  targetType: 'message' | 'player' | 'question' | 'general';
  reactionId: string;
  emoji: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Game-specific participant management
export interface GameRoomParticipant {
  id: string;
  roomId: string;
  userId: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinedAt: Date;
  leftAt?: Date;
  isReady: boolean;
  score: number;
  rank?: number;
  powerUpsUsed: number;
  user: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    profile?: UserProfile;
  };
  permissions: ParticipantPermissions;
  statistics: ParticipantGameStats;
}

export interface ParticipantPermissions {
  canChat: boolean;
  canUseReactions: boolean;
  canUsePowerUps: boolean;
  canInviteFriends: boolean;
  canModifyRoomSettings: boolean;
  canKickPlayers: boolean;
  canMuteUsers: boolean;
  canStartGame: boolean;
  canPauseGame: boolean;
}

export interface ParticipantGameStats {
  gamesPlayed: number;
  gamesWon: number;
  averageScore: number;
  bestScore: number;
  averageRank: number;
  powerUpsUsed: number;
  achievementsEarned: number;
  friendsInvited: number;
  chatMessages: number;
  reactionsGiven: number;
  spectateTime: number; // minutes
}

// Social feed and activity
export interface SocialFeedItem {
  id: string;
  userId: string;
  type: 'achievement' | 'game_result' | 'friend_activity' | 'power_up' | 'level_up';
  content: Record<string, any>;
  visibility: 'public' | 'friends' | 'private';
  createdAt: Date;
  user: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  interactions: {
    likes: number;
    comments: number;
    shares: number;
  };
}

export interface UserActivity {
  userId: string;
  activity: 'online' | 'in_game' | 'in_lobby' | 'offline';
  gameId?: string;
  roomId?: string;
  lastUpdate: Date;
  metadata?: {
    gameMode?: string;
    roomName?: string;
    spectating?: boolean;
  };
}

// Leaderboards and social competition
export interface SocialLeaderboard {
  id: string;
  name: string;
  type: 'global' | 'friends' | 'regional';
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  metric: 'score' | 'games_won' | 'streak' | 'power_ups' | 'achievements';
  entries: LeaderboardEntry[];
  updatedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  value: number;
  change: number; // Position change from last period
  trend: 'up' | 'down' | 'same';
  friendRank?: number; // Rank among friends
}

// Socket events for social features
export interface SocialSocketEvents {
  'friend:request': (payload: { toUserId: string; message?: string }) => void;
  'friend:request_received': (request: FriendRequest) => void;
  'friend:respond': (payload: { requestId: string; accept: boolean }) => void;
  'friend:status_updated': (friendship: UserFriend) => void;
  'friend:online_status': (userId: string, isOnline: boolean) => void;
  
  'chat:message': (payload: { roomId: string; content: string; type?: MessageType }) => void;
  'chat:message_received': (message: ChatMessage) => void;
  'chat:reaction': (payload: { messageId: string; emoji: string }) => void;
  'chat:reaction_added': (reaction: ChatReaction) => void;
  'chat:typing': (payload: { roomId: string; isTyping: boolean }) => void;
  'chat:user_typing': (payload: { userId: string; username: string; isTyping: boolean }) => void;
  
  'reaction:send': (payload: { roomId: string; reactionId: string; targetType: string; targetId?: string }) => void;
  'reaction:received': (event: ReactionEvent) => void;
  
  'user:profile_updated': (profile: UserProfile) => void;
  'user:activity_changed': (activity: UserActivity) => void;
  
  'social:feed_updated': (items: SocialFeedItem[]) => void;
  'social:leaderboard_updated': (leaderboard: SocialLeaderboard) => void;
}

// Social service errors
export class SocialError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SocialError';
  }
}

export enum SocialErrorCode {
  FRIEND_REQUEST_ALREADY_SENT = 'FRIEND_REQUEST_ALREADY_SENT',
  FRIEND_REQUEST_NOT_FOUND = 'FRIEND_REQUEST_NOT_FOUND',
  ALREADY_FRIENDS = 'ALREADY_FRIENDS',
  CANNOT_FRIEND_SELF = 'CANNOT_FRIEND_SELF',
  USER_BLOCKED = 'USER_BLOCKED',
  FRIEND_REQUESTS_DISABLED = 'FRIEND_REQUESTS_DISABLED',
  
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
  RATE_LIMITED = 'RATE_LIMITED',
  USER_MUTED = 'USER_MUTED',
  CHAT_DISABLED = 'CHAT_DISABLED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  INVALID_REACTION = 'INVALID_REACTION',
  REACTION_DISABLED = 'REACTION_DISABLED',
  
  PROFILE_UPDATE_FAILED = 'PROFILE_UPDATE_FAILED',
  PRIVACY_VIOLATION = 'PRIVACY_VIOLATION'
}
