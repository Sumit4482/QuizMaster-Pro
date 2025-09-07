/**
 * Phase 2.3: Enhanced Room Management Types
 * Advanced room system with discovery, analytics, and social features
 */

import { GameMode, GameModeConfig } from './gameModes';
import { ParticipantRole, ParticipantStatus } from './social';

// Enhanced room enums
export enum GameRoomStatus {
  WAITING = 'WAITING',
  STARTING = 'STARTING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
  ABANDONED = 'ABANDONED'
}

export enum RoomCategory {
  GENERAL = 'GENERAL',
  TRIVIA = 'TRIVIA',
  EDUCATION = 'EDUCATION',
  ENTERTAINMENT = 'ENTERTAINMENT',
  SCIENCE = 'SCIENCE',
  SPORTS = 'SPORTS',
  HISTORY = 'HISTORY',
  TECHNOLOGY = 'TECHNOLOGY',
  ARTS = 'ARTS',
  CUSTOM = 'CUSTOM'
}

export enum RoomVisibility {
  PUBLIC = 'PUBLIC',
  FRIENDS_ONLY = 'FRIENDS_ONLY',
  PRIVATE = 'PRIVATE',
  INVITED_ONLY = 'INVITED_ONLY'
}

// Enhanced room types
export interface EnhancedGameRoom {
  // Basic room information
  id: string;
  code: string;
  name: string;
  description?: string;
  category: RoomCategory;
  tags: string[];
  
  // Host and management
  hostId: string;
  coHosts: string[];
  moderators: string[];
  
  // Player management
  maxPlayers: number;
  currentPlayers: number;
  spectatorCount: number;
  waitingList: string[]; // User IDs waiting to join when full
  
  // Privacy and access
  visibility: RoomVisibility;
  password?: string;
  allowSpectators: boolean;
  requireApproval: boolean;
  inviteOnly: boolean;
  
  // Game configuration
  status: GameRoomStatus;
  gameMode: GameMode;
  gameModeConfig?: GameModeConfig;
  quizConfig?: QuizConfiguration;
  
  // Advanced settings
  settings: EnhancedRoomSettings;
  
  // Social features
  allowChat: boolean;
  allowReactions: boolean;
  allowVoiceChat: boolean;
  
  // Analytics and metrics
  popularity: RoomPopularity;
  analytics: RoomAnalytics;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date;
  startedAt?: Date;
  endedAt?: Date;
  
  // Relations
  host: RoomHost;
  participants: EnhancedRoomParticipant[];
  
  // Runtime data
  activeGame?: string; // Game ID
  reconnectionTokens: Map<string, string>; // User ID -> reconnection token
  
  // Room state
  isLocked: boolean;
  maintenanceMode: boolean;
  customData: Record<string, any>;
}

export interface RoomHost {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  hostingRating: number; // 1-5 star rating
  hostedGamesCount: number;
  isVerified: boolean;
  hostPreferences: HostPreferences;
}

export interface HostPreferences {
  autoStart: boolean;
  allowLatejoin: boolean;
  kickInactivePlayers: boolean;
  moderationLevel: 'strict' | 'moderate' | 'relaxed';
  defaultGameMode: GameMode;
  preferredCategories: string[];
  hostingStyle: 'competitive' | 'casual' | 'educational';
}

export interface EnhancedRoomSettings {
  // Game flow
  autoStart: boolean;
  autoStartDelay: number; // seconds
  allowReconnection: boolean;
  reconnectionTimeLimit: number; // seconds
  allowLatejoin: boolean;
  lateJoinCutoff: number; // question number
  
  // Question settings
  questionTimeLimit: number;
  showHints: boolean;
  allowSkipping: boolean;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showCorrectAnswers: boolean;
  showExplanations: boolean;
  
  // Scoring
  scoringSystem: 'standard' | 'time_based' | 'streak_based' | 'custom';
  bonusPoints: {
    timeBonus: boolean;
    streakBonus: boolean;
    difficultyBonus: boolean;
    firstCorrectBonus: boolean;
  };
  
  // Power-ups
  allowPowerUps: boolean;
  powerUpSettings: {
    startingPowerUps: number;
    earnPowerUpsInGame: boolean;
    maxActivePowerUps: number;
    powerUpCooldown: number;
  };
  
  // Social features
  chatSettings: {
    enabled: boolean;
    moderationLevel: 'none' | 'basic' | 'strict';
    allowEmojis: boolean;
    allowMentions: boolean;
    rateLimit: number; // messages per minute
  };
  
  reactionSettings: {
    enabled: boolean;
    allowDuringQuestions: boolean;
    allowCustomReactions: boolean;
  };
  
  // Privacy and moderation
  moderationSettings: {
    autoKickInactive: boolean;
    inactiveTimeLimit: number;
    allowPlayerReports: boolean;
    requireHostApproval: boolean;
    banDisruptivePlayers: boolean;
  };
  
  // Spectator settings
  spectatorSettings: {
    allowSpectators: boolean;
    spectatorLimit: number;
    allowSpectatorChat: boolean;
    allowSpectatorPromotion: boolean;
  };
  
  // Advanced features
  advancedSettings: {
    recordGame: boolean;
    allowScreenShare: boolean;
    enableVoiceChat: boolean;
    customBackgroundMusic: boolean;
    customTheme?: string;
  };
}

export interface QuizConfiguration {
  categoryIds: number[];
  difficultyLevels: number[];
  questionCount: number;
  questionTypes: string[];
  customQuestionSet?: string; // ID of custom question set
  excludeRecentQuestions: boolean;
  languagePreference: string;
  includeImages: boolean;
  includeMultimedia: boolean;
}

export interface EnhancedRoomParticipant {
  // Basic information
  id: string;
  roomId: string;
  userId: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  
  // Timing
  joinedAt: Date;
  leftAt?: Date;
  lastActivity: Date;
  
  // Game state
  isReady: boolean;
  readyAt?: Date;
  score: number;
  rank?: number;
  
  // Power-ups and features
  powerUpsUsed: number;
  availablePowerUps: string[]; // Power-up IDs
  
  // Social stats
  chatMessages: number;
  reactionsGiven: number;
  friendsInRoom: number;
  
  // Connection info
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  latency: number;
  reconnectionCount: number;
  
  // User details
  user: ParticipantUser;
  
  // Permissions
  permissions: ParticipantPermissions;
  
  // Achievements in this room
  sessionAchievements: string[];
  
  // Custom participant data
  customData: Record<string, any>;
}

export interface ParticipantUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  level: number;
  experiencePoints: number;
  isVerified: boolean;
  countryCode?: string;
  timezone?: string;
}

export interface ParticipantPermissions {
  canChat: boolean;
  canUseReactions: boolean;
  canUsePowerUps: boolean;
  canInviteFriends: boolean;
  canUseVoiceChat: boolean;
  canShareScreen: boolean;
  canModifySettings: boolean;
  canKickPlayers: boolean;
  canMuteUsers: boolean;
  canStartGame: boolean;
  canPauseGame: boolean;
  canPromoteSpectators: boolean;
}

// Room discovery and filtering
export interface RoomDiscoveryFilter {
  category?: RoomCategory;
  gameMode?: GameMode;
  tags?: string[];
  minPlayers?: number;
  maxPlayers?: number;
  hasPassword?: boolean;
  allowsSpectators?: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  language?: string;
  hostRating?: number;
  createdAfter?: Date;
  
  // Advanced filters
  friendsInRoom?: boolean;
  nearbyOnly?: boolean; // Based on geography/timezone
  newHostsOnly?: boolean;
  verifiedHostsOnly?: boolean;
  
  // Sorting options
  sortBy?: 'popularity' | 'newest' | 'players' | 'rating' | 'activity';
  sortOrder?: 'asc' | 'desc';
}

export interface RoomListEntry {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: RoomCategory;
  tags: string[];
  gameMode: GameMode;
  currentPlayers: number;
  maxPlayers: number;
  spectatorCount: number;
  hasPassword: boolean;
  allowsSpectators: boolean;
  status: GameRoomStatus;
  hostUsername: string;
  hostRating: number;
  popularity: number;
  createdAt: Date;
  lastActivity: Date;
  friendsInRoom: number; // How many of your friends are in this room
  estimatedWaitTime?: number; // seconds until game starts
  
  // Quick join info
  canJoin: boolean;
  joinRestriction?: 'full' | 'password' | 'approval' | 'banned';
}

// Room analytics and popularity
export interface RoomPopularity {
  score: number; // 0-100 popularity score
  views: number; // How many times room appeared in lists
  joins: number; // Total joins (including re-joins)
  completions: number; // Games completed
  rating: number; // Average user rating (1-5)
  ratingCount: number;
  bookmarks: number; // Users who bookmarked this room
  shares: number; // Times room was shared
  
  // Trending metrics
  hourlyJoins: number;
  dailyJoins: number;
  weeklyJoins: number;
  trend: 'rising' | 'stable' | 'declining';
  
  // Quality metrics
  retentionRate: number; // Percentage of players who finish games
  averageSessionDuration: number; // minutes
  chatActivityLevel: 'low' | 'medium' | 'high';
  powerUpUsageRate: number;
}

export interface RoomAnalytics {
  // Player metrics
  totalUniqueVisitors: number;
  peakConcurrentPlayers: number;
  averagePlayersPerGame: number;
  playerRetentionRate: number;
  
  // Game metrics
  totalGamesPlayed: number;
  averageGameDuration: number;
  completionRate: number;
  abandonmentRate: number;
  
  // Engagement metrics
  totalChatMessages: number;
  averageMessagesPerPlayer: number;
  totalReactions: number;
  powerUpsUsedTotal: number;
  
  // Performance metrics
  averageQuestionResponseTime: number;
  averageScore: number;
  difficultyDistribution: Record<string, number>;
  categoryPopularity: Record<string, number>;
  
  // Social metrics
  friendInvites: number;
  spectatorMinutes: number;
  userRatings: {
    average: number;
    distribution: Record<number, number>; // rating -> count
  };
  
  // Time-based analytics
  hourlyActivity: number[]; // 24 hours
  dailyActivity: number[]; // 7 days
  weeklyActivity: number[]; // 4 weeks
  
  // Revenue metrics (if applicable)
  powerUpsPurchased?: number;
  premiumFeaturesUsed?: number;
}

// Room recommendations
export interface RoomRecommendation {
  roomId: string;
  score: number; // 0-1 recommendation score
  reasons: RecommendationReason[];
  room: RoomListEntry;
}

export interface RecommendationReason {
  type: 'category_preference' | 'friend_activity' | 'skill_match' | 'host_rating' | 'trending' | 'similar_interests';
  weight: number;
  description: string;
}

// Room templates
export interface RoomTemplate {
  id: string;
  name: string;
  description: string;
  category: RoomCategory;
  gameMode: GameMode;
  settings: Partial<EnhancedRoomSettings>;
  quizConfig?: Partial<QuizConfiguration>;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: number; // minutes
  minPlayers: number;
  maxPlayers: number;
  isOfficial: boolean;
  createdBy?: string;
  usageCount: number;
  rating: number;
  iconUrl?: string;
}

// Advanced room management
export interface RoomModerationAction {
  id: string;
  roomId: string;
  moderatorId: string;
  targetUserId: string;
  action: 'kick' | 'ban' | 'mute' | 'warn' | 'promote' | 'demote';
  reason: string;
  duration?: number; // seconds, for temporary actions
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RoomInvitation {
  id: string;
  roomId: string;
  inviterId: string;
  inviteeId: string;
  message?: string;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: Date;
  respondedAt?: Date;
}

export interface RoomBookmark {
  id: string;
  userId: string;
  roomId: string;
  notes?: string;
  createdAt: Date;
  room: RoomListEntry;
}

// Socket events for enhanced room management
export interface EnhancedRoomSocketEvents {
  // Room discovery
  'rooms:discover': (filter: RoomDiscoveryFilter) => void;
  'rooms:list_updated': (rooms: RoomListEntry[]) => void;
  'rooms:recommendations': (recommendations: RoomRecommendation[]) => void;
  
  // Room joining and management
  'room:join_request': (payload: { roomId: string; password?: string }) => void;
  'room:join_approved': (roomData: EnhancedGameRoom) => void;
  'room:join_denied': (reason: string) => void;
  'room:participant_joined': (participant: EnhancedRoomParticipant) => void;
  'room:participant_left': (userId: string, reason?: string) => void;
  'room:participant_updated': (participant: EnhancedRoomParticipant) => void;
  
  // Room settings and configuration
  'room:settings_updated': (settings: EnhancedRoomSettings) => void;
  'room:mode_changed': (gameMode: GameMode, config: GameModeConfig) => void;
  'room:status_changed': (status: GameRoomStatus) => void;
  
  // Moderation
  'room:moderation_action': (action: RoomModerationAction) => void;
  'room:invitation_sent': (invitation: RoomInvitation) => void;
  'room:invitation_received': (invitation: RoomInvitation) => void;
  
  // Analytics and popularity
  'room:analytics_updated': (roomId: string, analytics: RoomAnalytics) => void;
  'room:popularity_changed': (roomId: string, popularity: RoomPopularity) => void;
  
  // Advanced features
  'room:template_applied': (template: RoomTemplate) => void;
  'room:bookmark_added': (bookmark: RoomBookmark) => void;
  'room:voice_chat_started': (roomId: string) => void;
  'room:screen_share_started': (userId: string) => void;
}

// Room service errors
export class EnhancedRoomError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'EnhancedRoomError';
  }
}

export enum EnhancedRoomErrorCode {
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_FULL = 'ROOM_FULL',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  BANNED_FROM_ROOM = 'BANNED_FROM_ROOM',
  INVALID_PERMISSIONS = 'INVALID_PERMISSIONS',
  ROOM_LOCKED = 'ROOM_LOCKED',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  INVALID_GAME_MODE = 'INVALID_GAME_MODE',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  INVITATION_EXPIRED = 'INVITATION_EXPIRED',
  BOOKMARK_LIMIT_EXCEEDED = 'BOOKMARK_LIMIT_EXCEEDED',
  MODERATION_FAILED = 'MODERATION_FAILED'
}

// Room service configuration
export interface EnhancedRoomServiceConfig {
  maxRoomsPerUser: number;
  maxSpectators: number;
  roomInactivityTimeout: number; // minutes
  autoCleanupInterval: number; // minutes
  
  discovery: {
    maxResults: number;
    cacheTimeout: number; // seconds
    enableRecommendations: boolean;
    recommendationEngine: 'basic' | 'ml' | 'hybrid';
  };
  
  analytics: {
    enableRealTime: boolean;
    aggregationInterval: number; // minutes
    retentionPeriod: number; // days
  };
  
  moderation: {
    autoModeration: boolean;
    reportThreshold: number;
    banDurationDefault: number; // minutes
    maxModerationActions: number; // per moderator per hour
  };
  
  features: {
    enableVoiceChat: boolean;
    enableScreenShare: boolean;
    enableRecording: boolean;
    enableCustomThemes: boolean;
  };
}
