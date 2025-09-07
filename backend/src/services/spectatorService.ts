/**
 * Phase 2.3: Spectator Service
 * Comprehensive spectator mode with rich observer experience and social features
 */

import { EventEmitter } from 'events';
import { logger } from '@/config/logger';

// Spectator-related types
export enum SpectatorPermission {
  VIEW_GAME = 'VIEW_GAME',
  VIEW_PLAYER_STATS = 'VIEW_PLAYER_STATS',
  VIEW_ANSWERS = 'VIEW_ANSWERS',
  CHAT = 'CHAT',
  USE_REACTIONS = 'USE_REACTIONS',
  INFLUENCE_GAME = 'INFLUENCE_GAME', // Polls, votes, etc.
  PROMOTE_TO_PLAYER = 'PROMOTE_TO_PLAYER'
}

export interface SpectatorProfile {
  userId: string;
  username: string;
  avatarUrl?: string;
  joinedAt: Date;
  sessionDuration: number; // milliseconds
  permissions: Set<SpectatorPermission>;
  preferences: SpectatorPreferences;
  statistics: SpectatorStatistics;
  metadata: Record<string, any>;
}

export interface SpectatorPreferences {
  autoFollowLeader: boolean;
  showPlayerStats: boolean;
  showAnswerReveals: boolean;
  enableNotifications: boolean;
  preferredView: 'overview' | 'player_focus' | 'leaderboard';
  enableCommentary: boolean;
  showPredictions: boolean;
  focusedPlayerId?: string; // Player to focus camera/stats on
}

export interface SpectatorStatistics {
  totalWatchTime: number; // milliseconds
  gamesWatched: number;
  favoriteGameModes: string[];
  averageSessionLength: number;
  predictionsCorrect: number;
  predictionsTotal: number;
  predictionsAccuracy: number;
  chatMessages: number;
  reactionsGiven: number;
  playersFollowed: string[];
}

export interface SpectatorView {
  type: 'live_game' | 'replay' | 'highlights';
  gameId: string;
  roomId: string;
  spectators: Map<string, SpectatorProfile>;
  settings: SpectatorViewSettings;
  features: SpectatorFeatures;
  analytics: SpectatorAnalytics;
  commentary: GameCommentary;
}

export interface SpectatorViewSettings {
  maxSpectators: number;
  allowAnonymousSpectators: boolean;
  requireApproval: boolean;
  enableChat: boolean;
  enableReactions: boolean;
  enablePolls: boolean;
  enablePredictions: boolean;
  showPlayerCameras: boolean;
  showRealTimeStats: boolean;
  moderationLevel: 'none' | 'basic' | 'strict';
  accessRestriction: 'public' | 'friends' | 'invited' | 'paid';
}

export interface SpectatorFeatures {
  liveCommentary: boolean;
  playerFollowMode: boolean;
  instantReplays: boolean;
  statisticsOverlay: boolean;
  predictionSystem: boolean;
  pollsAndVoting: boolean;
  multiViewMode: boolean;
  picturInPicture: boolean;
}

export interface SpectatorAnalytics {
  currentViewers: number;
  peakViewers: number;
  totalViewTime: number; // aggregate of all spectator time
  averageSessionLength: number;
  engagementRate: number; // reactions + chat / viewers
  retentionRate: number; // viewers who watch >50% of game
  popularMoments: GameMoment[];
  viewerGeography: Record<string, number>; // country -> viewer count
  deviceTypes: Record<string, number>; // mobile, desktop, tablet
}

export interface GameCommentary {
  enabled: boolean;
  commentator?: {
    userId: string;
    username: string;
    isAI: boolean;
  };
  highlights: CommentaryHighlight[];
  automaticComments: boolean;
  communityComments: boolean;
}

export interface CommentaryHighlight {
  id: string;
  timestamp: Date;
  type: 'elimination' | 'comeback' | 'streak' | 'power_up' | 'close_call' | 'perfect_score';
  playerId?: string;
  description: string;
  excitement: number; // 1-10 scale
  metadata: Record<string, any>;
}

export interface GameMoment {
  id: string;
  timestamp: Date;
  type: string;
  description: string;
  viewerReactions: number;
  clipDuration: number; // seconds
  participantIds: string[];
}

export interface SpectatorPrediction {
  id: string;
  spectatorId: string;
  questionId: string;
  predictedWinner?: string;
  predictedOutcome?: string;
  confidence: number; // 0-100
  submittedAt: Date;
  isCorrect?: boolean;
  points?: number;
}

export interface SpectatorPoll {
  id: string;
  createdBy: string;
  question: string;
  options: SpectatorPollOption[];
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  totalVotes: number;
  metadata: Record<string, any>;
}

export interface SpectatorPollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
  voters: string[]; // spectator IDs
}

export interface SpectatorNotification {
  id: string;
  spectatorId: string;
  type: 'game_start' | 'player_eliminated' | 'final_round' | 'game_end' | 'highlight_moment';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  metadata: Record<string, any>;
}

// Service implementation
export class SpectatorService extends EventEmitter {
  private static instance: SpectatorService | null = null;
  
  // Active spectator sessions
  private spectatorViews: Map<string, SpectatorView> = new Map(); // gameId -> SpectatorView
  private spectatorProfiles: Map<string, SpectatorProfile> = new Map(); // userId -> SpectatorProfile
  private spectatorGameMappings: Map<string, Set<string>> = new Map(); // gameId -> spectator userIds
  
  // Predictions and polls
  private activePredictions: Map<string, SpectatorPrediction[]> = new Map(); // gameId -> predictions
  private activePolls: Map<string, SpectatorPoll[]> = new Map(); // gameId -> polls
  
  // Notifications
  private spectatorNotifications: Map<string, SpectatorNotification[]> = new Map(); // userId -> notifications

  private constructor() {
    super();
    this.initializeService();
  }

  public static getInstance(): SpectatorService {
    if (!SpectatorService.instance) {
      SpectatorService.instance = new SpectatorService();
    }
    return SpectatorService.instance;
  }

  /**
   * Initialize the spectator service
   */
  private async initializeService(): Promise<void> {
    try {
      // Start analytics collection
      this.startAnalyticsCollection();
      
      // Start cleanup routines
      this.startCleanupRoutines();
      
      logger.info('SpectatorService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SpectatorService', { error });
      throw error;
    }
  }

  // ==========================================
  // SPECTATOR SESSION MANAGEMENT
  // ==========================================

  /**
   * Initialize spectator view for a game
   */
  public initializeSpectatorView(
    gameId: string,
    roomId: string,
    settings: Partial<SpectatorViewSettings> = {}
  ): SpectatorView {
    const defaultSettings: SpectatorViewSettings = {
      maxSpectators: 100,
      allowAnonymousSpectators: true,
      requireApproval: false,
      enableChat: true,
      enableReactions: true,
      enablePolls: true,
      enablePredictions: true,
      showPlayerCameras: false,
      showRealTimeStats: true,
      moderationLevel: 'basic',
      accessRestriction: 'public'
    };

    const spectatorView: SpectatorView = {
      type: 'live_game',
      gameId,
      roomId,
      spectators: new Map(),
      settings: { ...defaultSettings, ...settings },
      features: {
        liveCommentary: true,
        playerFollowMode: true,
        instantReplays: true,
        statisticsOverlay: true,
        predictionSystem: settings.enablePredictions !== false,
        pollsAndVoting: settings.enablePolls !== false,
        multiViewMode: true,
        picturInPicture: true
      },
      analytics: {
        currentViewers: 0,
        peakViewers: 0,
        totalViewTime: 0,
        averageSessionLength: 0,
        engagementRate: 0,
        retentionRate: 0,
        popularMoments: [],
        viewerGeography: {},
        deviceTypes: {}
      },
      commentary: {
        enabled: true,
        automaticComments: true,
        communityComments: true,
        highlights: []
      }
    };

    this.spectatorViews.set(gameId, spectatorView);

    // Initialize collections for this game
    this.activePredictions.set(gameId, []);
    this.activePolls.set(gameId, []);
    this.spectatorGameMappings.set(gameId, new Set());

    logger.info('Spectator view initialized', {
      gameId,
      roomId,
      maxSpectators: spectatorView.settings.maxSpectators
    });

    return spectatorView;
  }

  /**
   * Add spectator to game
   */
  public async addSpectator(
    gameId: string,
    userId: string,
    userInfo: {
      username: string;
      avatarUrl?: string;
    },
    preferences: Partial<SpectatorPreferences> = {}
  ): Promise<SpectatorProfile> {
    try {
      const spectatorView = this.spectatorViews.get(gameId);
      if (!spectatorView) {
        throw new Error('Spectator view not found for game');
      }

      // Check if spectator limit reached
      if (spectatorView.spectators.size >= spectatorView.settings.maxSpectators) {
        throw new Error('Spectator limit reached');
      }

      // Check if already a spectator
      if (spectatorView.spectators.has(userId)) {
        return spectatorView.spectators.get(userId)!;
      }

      // Create spectator profile
      const defaultPreferences: SpectatorPreferences = {
        autoFollowLeader: true,
        showPlayerStats: true,
        showAnswerReveals: false,
        enableNotifications: true,
        preferredView: 'overview',
        enableCommentary: true,
        showPredictions: true
      };

      const existingProfile = this.spectatorProfiles.get(userId);
      const spectatorProfile: SpectatorProfile = {
        userId,
        username: userInfo.username,
        avatarUrl: userInfo.avatarUrl,
        joinedAt: new Date(),
        sessionDuration: 0,
        permissions: this.getSpectatorPermissions(spectatorView.settings),
        preferences: { ...defaultPreferences, ...preferences },
        statistics: existingProfile?.statistics || {
          totalWatchTime: 0,
          gamesWatched: 0,
          favoriteGameModes: [],
          averageSessionLength: 0,
          predictionsCorrect: 0,
          predictionsTotal: 0,
          predictionsAccuracy: 0,
          chatMessages: 0,
          reactionsGiven: 0,
          playersFollowed: []
        },
        metadata: {}
      };

      // Add to collections
      spectatorView.spectators.set(userId, spectatorProfile);
      this.spectatorProfiles.set(userId, spectatorProfile);
      this.spectatorGameMappings.get(gameId)?.add(userId);

      // Update analytics
      spectatorView.analytics.currentViewers++;
      spectatorView.analytics.peakViewers = Math.max(
        spectatorView.analytics.peakViewers,
        spectatorView.analytics.currentViewers
      );

      // Send welcome notification
      await this.sendSpectatorNotification(userId, {
        type: 'game_start',
        title: 'Welcome to the Game!',
        message: `You're now watching the game. Enjoy the show!`,
        metadata: { gameId }
      });

      // Emit join event
      this.emit('spectator:joined', {
        gameId,
        spectator: spectatorProfile,
        totalSpectators: spectatorView.analytics.currentViewers
      });

      logger.info('Spectator added to game', {
        gameId,
        userId,
        username: userInfo.username,
        currentViewers: spectatorView.analytics.currentViewers
      });

      return spectatorProfile;

    } catch (error) {
      logger.error('Failed to add spectator', { gameId, userId, error });
      throw error;
    }
  }

  /**
   * Remove spectator from game
   */
  public async removeSpectator(gameId: string, userId: string): Promise<void> {
    try {
      const spectatorView = this.spectatorViews.get(gameId);
      if (!spectatorView) return;

      const spectator = spectatorView.spectators.get(userId);
      if (!spectator) return;

      // Calculate session duration
      const sessionDuration = Date.now() - spectator.joinedAt.getTime();
      spectator.sessionDuration = sessionDuration;

      // Update statistics
      spectator.statistics.totalWatchTime += sessionDuration;
      spectator.statistics.gamesWatched++;
      spectator.statistics.averageSessionLength = 
        spectator.statistics.totalWatchTime / spectator.statistics.gamesWatched;

      // Remove from collections
      spectatorView.spectators.delete(userId);
      this.spectatorGameMappings.get(gameId)?.delete(userId);

      // Update analytics
      spectatorView.analytics.currentViewers--;
      spectatorView.analytics.totalViewTime += sessionDuration;

      // Emit leave event
      this.emit('spectator:left', {
        gameId,
        userId,
        sessionDuration,
        currentViewers: spectatorView.analytics.currentViewers
      });

      logger.info('Spectator removed from game', {
        gameId,
        userId,
        sessionDuration,
        currentViewers: spectatorView.analytics.currentViewers
      });

    } catch (error) {
      logger.error('Failed to remove spectator', { gameId, userId, error });
    }
  }

  // ==========================================
  // SPECTATOR FEATURES
  // ==========================================

  /**
   * Create spectator poll
   */
  public async createSpectatorPoll(
    gameId: string,
    creatorId: string,
    pollData: {
      question: string;
      options: string[];
      durationSeconds: number;
    }
  ): Promise<SpectatorPoll> {
    try {
      const spectatorView = this.spectatorViews.get(gameId);
      if (!spectatorView || !spectatorView.settings.enablePolls) {
        throw new Error('Polls not available for this game');
      }

      const poll: SpectatorPoll = {
        id: `poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdBy: creatorId,
        question: pollData.question,
        options: pollData.options.map((text, index) => ({
          id: `option_${index}`,
          text,
          votes: 0,
          percentage: 0,
          voters: []
        })),
        startTime: new Date(),
        endTime: new Date(Date.now() + pollData.durationSeconds * 1000),
        isActive: true,
        totalVotes: 0,
        metadata: {}
      };

      // Add to active polls
      const gamePolls = this.activePolls.get(gameId) || [];
      gamePolls.push(poll);
      this.activePolls.set(gameId, gamePolls);

      // Auto-end poll after duration
      setTimeout(() => {
        this.endSpectatorPoll(gameId, poll.id);
      }, pollData.durationSeconds * 1000);

      // Notify spectators
      this.emit('spectator:poll_created', { gameId, poll });

      logger.info('Spectator poll created', {
        gameId,
        pollId: poll.id,
        question: poll.question,
        duration: pollData.durationSeconds
      });

      return poll;

    } catch (error) {
      logger.error('Failed to create spectator poll', { gameId, creatorId, error });
      throw error;
    }
  }

  /**
   * Vote on spectator poll
   */
  public async voteOnPoll(
    gameId: string,
    pollId: string,
    spectatorId: string,
    optionId: string
  ): Promise<void> {
    try {
      const polls = this.activePolls.get(gameId);
      if (!polls) return;

      const poll = polls.find(p => p.id === pollId);
      if (!poll || !poll.isActive) return;

      const option = poll.options.find(o => o.id === optionId);
      if (!option) return;

      // Check if already voted
      if (option.voters.includes(spectatorId)) return;

      // Remove previous vote if exists
      for (const opt of poll.options) {
        const voterIndex = opt.voters.indexOf(spectatorId);
        if (voterIndex !== -1) {
          opt.voters.splice(voterIndex, 1);
          opt.votes--;
          poll.totalVotes--;
        }
      }

      // Add new vote
      option.voters.push(spectatorId);
      option.votes++;
      poll.totalVotes++;

      // Recalculate percentages
      for (const opt of poll.options) {
        opt.percentage = poll.totalVotes > 0 ? (opt.votes / poll.totalVotes) * 100 : 0;
      }

      // Emit vote update
      this.emit('spectator:poll_updated', { gameId, poll });

      logger.debug('Spectator voted on poll', {
        gameId,
        pollId,
        spectatorId,
        optionId,
        totalVotes: poll.totalVotes
      });

    } catch (error) {
      logger.error('Failed to vote on poll', { gameId, pollId, spectatorId, error });
    }
  }

  /**
   * Create spectator prediction
   */
  public async createSpectatorPrediction(
    gameId: string,
    spectatorId: string,
    predictionData: {
      questionId: string;
      predictedWinner?: string;
      predictedOutcome?: string;
      confidence: number;
    }
  ): Promise<SpectatorPrediction> {
    try {
      const spectatorView = this.spectatorViews.get(gameId);
      if (!spectatorView || !spectatorView.features.predictionSystem) {
        throw new Error('Predictions not available for this game');
      }

      const prediction: SpectatorPrediction = {
        id: `prediction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        spectatorId,
        questionId: predictionData.questionId,
        predictedWinner: predictionData.predictedWinner,
        predictedOutcome: predictionData.predictedOutcome,
        confidence: predictionData.confidence,
        submittedAt: new Date()
      };

      // Add to active predictions
      const gamePredictions = this.activePredictions.get(gameId) || [];
      gamePredictions.push(prediction);
      this.activePredictions.set(gameId, gamePredictions);

      // Update spectator statistics
      const spectator = this.spectatorProfiles.get(spectatorId);
      if (spectator) {
        spectator.statistics.predictionsTotal++;
      }

      logger.info('Spectator prediction created', {
        gameId,
        spectatorId,
        predictionId: prediction.id,
        confidence: prediction.confidence
      });

      return prediction;

    } catch (error) {
      logger.error('Failed to create spectator prediction', { gameId, spectatorId, error });
      throw error;
    }
  }

  /**
   * Add commentary highlight
   */
  public addCommentaryHighlight(
    gameId: string,
    highlight: Omit<CommentaryHighlight, 'id' | 'timestamp'>
  ): void {
    try {
      const spectatorView = this.spectatorViews.get(gameId);
      if (!spectatorView || !spectatorView.commentary.enabled) return;

      const commentaryHighlight: CommentaryHighlight = {
        id: `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        ...highlight
      };

      spectatorView.commentary.highlights.push(commentaryHighlight);

      // Add to popular moments if exciting enough
      if (highlight.excitement >= 7) {
        const moment: GameMoment = {
          id: commentaryHighlight.id,
          timestamp: commentaryHighlight.timestamp,
          type: highlight.type,
          description: highlight.description,
          viewerReactions: 0,
          clipDuration: 30, // 30 second highlight clip
          participantIds: highlight.playerId ? [highlight.playerId] : []
        };

        spectatorView.analytics.popularMoments.push(moment);
      }

      // Notify spectators of exciting moment
      if (highlight.excitement >= 8) {
        this.notifySpectatorsOfHighlight(gameId, commentaryHighlight);
      }

      // Emit highlight event
      this.emit('spectator:commentary_highlight', { gameId, highlight: commentaryHighlight });

      logger.info('Commentary highlight added', {
        gameId,
        type: highlight.type,
        excitement: highlight.excitement,
        description: highlight.description
      });

    } catch (error) {
      logger.error('Failed to add commentary highlight', { gameId, error });
    }
  }

  /**
   * Update spectator preferences
   */
  public async updateSpectatorPreferences(
    userId: string,
    preferences: Partial<SpectatorPreferences>
  ): Promise<void> {
    try {
      const spectator = this.spectatorProfiles.get(userId);
      if (!spectator) return;

      spectator.preferences = { ...spectator.preferences, ...preferences };

      // Emit preferences update
      this.emit('spectator:preferences_updated', {
        userId,
        preferences: spectator.preferences
      });

      logger.debug('Spectator preferences updated', { userId, preferences });

    } catch (error) {
      logger.error('Failed to update spectator preferences', { userId, error });
    }
  }

  // ==========================================
  // SPECTATOR ANALYTICS
  // ==========================================

  /**
   * Track spectator interaction
   */
  public trackSpectatorInteraction(
    gameId: string,
    spectatorId: string,
    interactionType: 'chat' | 'reaction' | 'poll_vote' | 'prediction' | 'follow_player',
    metadata: Record<string, any> = {}
  ): void {
    try {
      const spectatorView = this.spectatorViews.get(gameId);
      const spectator = this.spectatorProfiles.get(spectatorId);
      
      if (!spectatorView || !spectator) return;

      // Update spectator statistics
      switch (interactionType) {
        case 'chat':
          spectator.statistics.chatMessages++;
          break;
        case 'reaction':
          spectator.statistics.reactionsGiven++;
          break;
        case 'follow_player':
          if (metadata.playerId && !spectator.statistics.playersFollowed.includes(metadata.playerId)) {
            spectator.statistics.playersFollowed.push(metadata.playerId);
          }
          break;
      }

      // Update engagement analytics
      this.updateEngagementAnalytics(gameId);

      logger.debug('Spectator interaction tracked', {
        gameId,
        spectatorId,
        interactionType,
        metadata
      });

    } catch (error) {
      logger.error('Failed to track spectator interaction', { gameId, spectatorId, error });
    }
  }

  /**
   * Get spectator analytics
   */
  public getSpectatorAnalytics(gameId: string): SpectatorAnalytics | null {
    const spectatorView = this.spectatorViews.get(gameId);
    return spectatorView?.analytics || null;
  }

  /**
   * Get spectator profile
   */
  public getSpectatorProfile(userId: string): SpectatorProfile | null {
    return this.spectatorProfiles.get(userId) || null;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Get spectator permissions
   */
  private getSpectatorPermissions(settings: SpectatorViewSettings): Set<SpectatorPermission> {
    const permissions = new Set<SpectatorPermission>();

    // Basic viewing permissions
    permissions.add(SpectatorPermission.VIEW_GAME);
    
    if (settings.showRealTimeStats) {
      permissions.add(SpectatorPermission.VIEW_PLAYER_STATS);
    }

    // Interactive permissions
    if (settings.enableChat) {
      permissions.add(SpectatorPermission.CHAT);
    }

    if (settings.enableReactions) {
      permissions.add(SpectatorPermission.USE_REACTIONS);
    }

    if (settings.enablePolls) {
      permissions.add(SpectatorPermission.INFLUENCE_GAME);
    }

    // Answer viewing depends on game state and settings
    // This would be controlled dynamically based on question phase

    return permissions;
  }

  /**
   * Send notification to spectator
   */
  private async sendSpectatorNotification(
    spectatorId: string,
    notificationData: {
      type: SpectatorNotification['type'];
      title: string;
      message: string;
      actionUrl?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const notification: SpectatorNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        spectatorId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        timestamp: new Date(),
        read: false,
        actionUrl: notificationData.actionUrl,
        metadata: notificationData.metadata || {}
      };

      // Store notification
      const userNotifications = this.spectatorNotifications.get(spectatorId) || [];
      userNotifications.push(notification);
      this.spectatorNotifications.set(spectatorId, userNotifications);

      // Emit notification event
      this.emit('spectator:notification', { spectatorId, notification });

    } catch (error) {
      logger.error('Failed to send spectator notification', { spectatorId, error });
    }
  }

  /**
   * Notify spectators of highlight
   */
  private async notifySpectatorsOfHighlight(
    gameId: string,
    highlight: CommentaryHighlight
  ): Promise<void> {
    const spectatorView = this.spectatorViews.get(gameId);
    if (!spectatorView) return;

    // Send notification to all spectators with notifications enabled
    for (const [spectatorId, spectator] of spectatorView.spectators) {
      if (spectator.preferences.enableNotifications) {
        await this.sendSpectatorNotification(spectatorId, {
          type: 'highlight_moment',
          title: 'Exciting Moment!',
          message: highlight.description,
          metadata: {
            gameId,
            highlightId: highlight.id,
            excitement: highlight.excitement
          }
        });
      }
    }
  }

  /**
   * Update engagement analytics
   */
  private updateEngagementAnalytics(gameId: string): void {
    const spectatorView = this.spectatorViews.get(gameId);
    if (!spectatorView) return;

    // Calculate engagement rate (interactions per spectator)
    let totalInteractions = 0;
    for (const spectator of spectatorView.spectators.values()) {
      totalInteractions += 
        spectator.statistics.chatMessages + 
        spectator.statistics.reactionsGiven;
    }

    spectatorView.analytics.engagementRate = spectatorView.spectators.size > 0 
      ? totalInteractions / spectatorView.spectators.size 
      : 0;
  }

  /**
   * End spectator poll
   */
  private endSpectatorPoll(gameId: string, pollId: string): void {
    const polls = this.activePolls.get(gameId);
    if (!polls) return;

    const poll = polls.find(p => p.id === pollId);
    if (!poll) return;

    poll.isActive = false;
    poll.endTime = new Date();

    // Emit poll ended event
    this.emit('spectator:poll_ended', { gameId, poll });

    logger.info('Spectator poll ended', {
      gameId,
      pollId,
      totalVotes: poll.totalVotes
    });
  }

  /**
   * Validate prediction result
   */
  public validatePrediction(
    gameId: string,
    predictionId: string,
    actualResult: {
      winner?: string;
      outcome?: string;
    }
  ): void {
    try {
      const predictions = this.activePredictions.get(gameId);
      if (!predictions) return;

      const prediction = predictions.find(p => p.id === predictionId);
      if (!prediction) return;

      // Check if prediction was correct
      let isCorrect = false;
      if (prediction.predictedWinner && actualResult.winner) {
        isCorrect = prediction.predictedWinner === actualResult.winner;
      } else if (prediction.predictedOutcome && actualResult.outcome) {
        isCorrect = prediction.predictedOutcome === actualResult.outcome;
      }

      prediction.isCorrect = isCorrect;
      prediction.points = isCorrect ? Math.floor(prediction.confidence / 10) : 0;

      // Update spectator statistics
      const spectator = this.spectatorProfiles.get(prediction.spectatorId);
      if (spectator) {
        if (isCorrect) {
          spectator.statistics.predictionsCorrect++;
        }
        spectator.statistics.predictionsAccuracy = 
          spectator.statistics.predictionsTotal > 0 
            ? (spectator.statistics.predictionsCorrect / spectator.statistics.predictionsTotal) * 100 
            : 0;
      }

      logger.info('Prediction validated', {
        gameId,
        predictionId,
        spectatorId: prediction.spectatorId,
        isCorrect,
        points: prediction.points
      });

    } catch (error) {
      logger.error('Failed to validate prediction', { gameId, predictionId, error });
    }
  }

  /**
   * Start analytics collection
   */
  private startAnalyticsCollection(): void {
    // Update session durations every minute
    setInterval(() => {
      this.updateSessionDurations();
    }, 60000);

    // Calculate retention rates every 5 minutes
    setInterval(() => {
      this.calculateRetentionRates();
    }, 300000);
  }

  /**
   * Update session durations
   */
  private updateSessionDurations(): void {
    for (const [gameId, spectatorView] of this.spectatorViews) {
      let totalSessionTime = 0;
      for (const spectator of spectatorView.spectators.values()) {
        const sessionTime = Date.now() - spectator.joinedAt.getTime();
        spectator.sessionDuration = sessionTime;
        totalSessionTime += sessionTime;
      }

      if (spectatorView.spectators.size > 0) {
        spectatorView.analytics.averageSessionLength = totalSessionTime / spectatorView.spectators.size;
      }
    }
  }

  /**
   * Calculate retention rates
   */
  private calculateRetentionRates(): void {
    for (const [gameId, spectatorView] of this.spectatorViews) {
      // Calculate how many spectators watch >50% of game
      // This would require game duration tracking
      // For now, use session length as proxy
      let retainedSpectators = 0;
      const averageGameDuration = 900000; // 15 minutes in milliseconds

      for (const spectator of spectatorView.spectators.values()) {
        if (spectator.sessionDuration > averageGameDuration * 0.5) {
          retainedSpectators++;
        }
      }

      spectatorView.analytics.retentionRate = spectatorView.spectators.size > 0 
        ? (retainedSpectators / spectatorView.spectators.size) * 100 
        : 0;
    }
  }

  /**
   * Start cleanup routines
   */
  private startCleanupRoutines(): void {
    // Clean up ended games every 30 minutes
    setInterval(() => {
      this.cleanupEndedGames();
    }, 1800000);

    // Clean up old notifications every hour
    setInterval(() => {
      this.cleanupOldNotifications();
    }, 3600000);
  }

  /**
   * Clean up ended games
   */
  private cleanupEndedGames(): void {
    const cutoffTime = Date.now() - 3600000; // 1 hour ago

    for (const [gameId, spectatorView] of this.spectatorViews) {
      // Check if game has been inactive for an hour
      let isActive = false;
      for (const spectator of spectatorView.spectators.values()) {
        if (spectator.joinedAt.getTime() > cutoffTime) {
          isActive = true;
          break;
        }
      }

      if (!isActive && spectatorView.spectators.size === 0) {
        this.cleanupSpectatorView(gameId);
      }
    }
  }

  /**
   * Clean up spectator view
   */
  private cleanupSpectatorView(gameId: string): void {
    this.spectatorViews.delete(gameId);
    this.activePredictions.delete(gameId);
    this.activePolls.delete(gameId);
    this.spectatorGameMappings.delete(gameId);

    logger.info('Spectator view cleaned up', { gameId });
  }

  /**
   * Clean up old notifications
   */
  private cleanupOldNotifications(): void {
    const cutoffTime = Date.now() - 86400000; // 24 hours ago

    for (const [userId, notifications] of this.spectatorNotifications) {
      const recentNotifications = notifications.filter(
        notif => notif.timestamp.getTime() > cutoffTime
      );

      if (recentNotifications.length === 0) {
        this.spectatorNotifications.delete(userId);
      } else {
        this.spectatorNotifications.set(userId, recentNotifications);
      }
    }
  }

  /**
   * Get active spectators for game
   */
  public getActiveSpectators(gameId: string): SpectatorProfile[] {
    const spectatorView = this.spectatorViews.get(gameId);
    return spectatorView ? Array.from(spectatorView.spectators.values()) : [];
  }

  /**
   * Get spectator notifications
   */
  public getSpectatorNotifications(userId: string): SpectatorNotification[] {
    return this.spectatorNotifications.get(userId) || [];
  }

  /**
   * Mark notification as read
   */
  public markNotificationAsRead(userId: string, notificationId: string): void {
    const notifications = this.spectatorNotifications.get(userId);
    if (!notifications) return;

    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
    }
  }
}
