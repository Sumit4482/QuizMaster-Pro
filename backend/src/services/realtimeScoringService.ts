import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { GameStateSyncService } from './gameStateSyncService';
import {
  GameState,
  GamePlayer,
  PlayerAnswer,
  LeaderboardEntry,
  GameSyncEvent,
  GameError
} from '../sockets/types/game';
import { ScoreCalculation } from '../types/quiz';

interface ScoringConfig {
  basePointsMultiplier: number;
  timeBonusEnabled: boolean;
  timeBonusMultiplier: number;
  streakBonusEnabled: boolean;
  streakBonusMultiplier: number;
  difficultyBonusEnabled: boolean;
  difficultyBonusMultiplier: number;
  penaltyForWrongAnswer: number;
  perfectGameBonus: number;
  speedBonus: boolean;
}

interface PlayerScoreHistory {
  playerId: string;
  gameId: string;
  questionScores: Array<{
    questionIndex: number;
    baseScore: number;
    timeBonus: number;
    streakBonus: number;
    difficultyBonus: number;
    totalScore: number;
    timestamp: Date;
  }>;
  totalScore: number;
  averageScore: number;
  bestStreak: number;
  currentStreak: number;
}

interface LeaderboardChange {
  playerId: string;
  oldRank: number;
  newRank: number;
  scoreChange: number;
  timestamp: Date;
}

/**
 * Real-Time Scoring & Leaderboard System
 * Handles live score calculation, leaderboard updates, and performance tracking
 */
export class RealtimeScoringService extends EventEmitter {
  private static instance: RealtimeScoringService | null = null;
  private io: Server;
  private gameStateSync: GameStateSyncService;
  
  // Scoring data
  private gameScoreHistories: Map<string, Map<string, PlayerScoreHistory>> = new Map();
  private leaderboards: Map<string, LeaderboardEntry[]> = new Map();
  private scoringConfigs: Map<string, ScoringConfig> = new Map();
  private leaderboardUpdateTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Performance tracking
  private performanceMetrics: Map<string, Map<string, any>> = new Map();
  private rankingHistory: Map<string, LeaderboardChange[]> = new Map();
  
  // Configuration
  private readonly LEADERBOARD_UPDATE_INTERVAL = 1000; // 1 second
  private readonly SCORE_ANIMATION_DELAY = 500; // 500ms for score animations
  private readonly RANKING_HISTORY_LIMIT = 100;

  private constructor(io: Server, gameStateSync: GameStateSyncService) {
    super();
    this.io = io;
    this.gameStateSync = gameStateSync;
    this.setupEventListeners();
  }

  public static getInstance(
    io?: Server,
    gameStateSync?: GameStateSyncService
  ): RealtimeScoringService {
    if (!RealtimeScoringService.instance) {
      if (!io || !gameStateSync) {
        throw new Error('Socket.io and GameStateSyncService instances required for first initialization');
      }
      RealtimeScoringService.instance = new RealtimeScoringService(io, gameStateSync);
    }
    return RealtimeScoringService.instance;
  }

  // ====================
  // SCORING CALCULATION
  // ====================

  /**
   * Initialize scoring for a game
   */
  public initializeGameScoring(
    gameId: string,
    config?: Partial<ScoringConfig>
  ): void {
    const defaultConfig: ScoringConfig = {
      basePointsMultiplier: 1.0,
      timeBonusEnabled: true,
      timeBonusMultiplier: 0.5,
      streakBonusEnabled: true,
      streakBonusMultiplier: 0.2,
      difficultyBonusEnabled: true,
      difficultyBonusMultiplier: 0.3,
      penaltyForWrongAnswer: 0,
      perfectGameBonus: 1000,
      speedBonus: true
    };

    const finalConfig = { ...defaultConfig, ...config };
    this.scoringConfigs.set(gameId, finalConfig);
    this.gameScoreHistories.set(gameId, new Map());
    this.leaderboards.set(gameId, []);
    this.performanceMetrics.set(gameId, new Map());
    this.rankingHistory.set(gameId, []);

    // Start real-time leaderboard updates
    this.startLeaderboardUpdates(gameId);

    logger.info('Game scoring initialized', { gameId, config: finalConfig });
  }

  /**
   * Calculate score for a player answer
   */
  public calculateScore(
    gameId: string,
    playerId: string,
    answer: PlayerAnswer,
    questionDifficulty: number,
    maxTimeLimit: number,
    currentStreak: number
  ): ScoreCalculation {
    const config = this.scoringConfigs.get(gameId);
    if (!config) {
      throw new GameError('SCORING_CONFIG_NOT_FOUND', 'Scoring configuration not found', gameId, playerId);
    }

    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId);
    }

    const basePoints = gameState.quizConfig.pointsPerQuestion * config.basePointsMultiplier;
    let timeBonus = 0;
    let streakBonus = 0;
    let difficultyBonus = 0;
    let penalty = 0;

    if (answer.isCorrect) {
      // Calculate time bonus
      if (config.timeBonusEnabled && config.speedBonus) {
        const timeRatio = Math.max(0, (maxTimeLimit - answer.timeTaken) / maxTimeLimit);
        timeBonus = Math.floor(basePoints * config.timeBonusMultiplier * timeRatio);
      }

      // Calculate streak bonus
      if (config.streakBonusEnabled && currentStreak > 1) {
        const streakMultiplier = Math.min(currentStreak - 1, 5); // Cap at 5x bonus
        streakBonus = Math.floor(basePoints * config.streakBonusMultiplier * streakMultiplier);
      }

      // Calculate difficulty bonus
      if (config.difficultyBonusEnabled) {
        const difficultyMultiplier = questionDifficulty - 1; // 0-3 scale
        difficultyBonus = Math.floor(basePoints * config.difficultyBonusMultiplier * difficultyMultiplier);
      }
    } else {
      // Apply penalty for wrong answer
      penalty = Math.floor(basePoints * config.penaltyForWrongAnswer);
    }

    const totalPoints = Math.max(0, basePoints + timeBonus + streakBonus + difficultyBonus - penalty);

    const calculation: ScoreCalculation = {
      basePoints,
      timeBonus,
      streakBonus,
      difficultyBonus,
      penalty,
      totalPoints
    };

    // Update answer with calculated points
    answer.pointsEarned = totalPoints;
    answer.timeBonus = timeBonus;
    answer.streakBonus = streakBonus;

    logger.debug('Score calculated', {
      gameId,
      playerId,
      questionIndex: answer.questionIndex,
      isCorrect: answer.isCorrect,
      calculation
    });

    return calculation;
  }

  /**
   * Process score update for player
   */
  public async updatePlayerScore(
    gameId: string,
    playerId: string,
    answer: PlayerAnswer,
    scoreCalculation: ScoreCalculation
  ): Promise<void> {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) {
      throw new GameError('GAME_NOT_FOUND', 'Game not found', gameId);
    }

    const player = gameState.players.get(playerId);
    if (!player) {
      throw new GameError('PLAYER_NOT_FOUND', 'Player not found in game', gameId, playerId);
    }

    // Store previous rank for change detection
    const previousRank = player.rank;
    const previousScore = player.score;

    // Update player score
    const scoreChange = scoreCalculation.totalPoints;
    player.score += scoreChange;
    player.timeBonuses += scoreCalculation.timeBonus;
    player.streakBonuses += scoreCalculation.streakBonus;
    player.questionsAnswered++;
    
    if (answer.isCorrect) {
      player.correctAnswers++;
      player.currentStreak++;
      player.bestStreak = Math.max(player.bestStreak, player.currentStreak);
    } else {
      player.currentStreak = 0;
    }
    
    // Update last activity
    player.lastActivity = new Date();
    
    logger.info('Player score updated in memory', {
      gameId,
      playerId,
      previousScore,
      scoreChange,
      newScore: player.score,
      totalCorrect: player.correctAnswers,
      currentStreak: player.currentStreak
    });

    // Update performance metrics
    this.updatePlayerMetrics(gameId, playerId, answer, scoreCalculation);

    // Update score history
    this.updateScoreHistory(gameId, playerId, answer, scoreCalculation);

    // Recalculate leaderboard
    const leaderboard = this.calculateLeaderboard(gameId);
    this.leaderboards.set(gameId, leaderboard);

    // Track ranking changes
    const newRank = player.rank;
    if (newRank !== previousRank) {
      this.trackRankingChange(gameId, playerId, previousRank, newRank, scoreCalculation.totalPoints);
    }

    // Broadcast score update immediately
    await this.broadcastScoreUpdate(gameId, playerId, {
      scoreChange: scoreCalculation.totalPoints,
      newTotalScore: player.score,
      rank: player.rank,
      calculation: scoreCalculation
    });
    
    // Also emit to GameManager for database persistence
    this.emit('score:database_update', {
      gameId,
      playerId,
      scoreData: {
        score: player.score,
        correctAnswers: player.correctAnswers,
        questionsAnswered: player.questionsAnswered,
        currentStreak: player.currentStreak,
        bestStreak: player.bestStreak,
        timeBonuses: player.timeBonuses,
        streakBonuses: player.streakBonuses
      },
      answer,
      scoreCalculation
    });

    // Schedule leaderboard animation
    setTimeout(() => {
      this.broadcastLeaderboardUpdate(gameId);
    }, this.SCORE_ANIMATION_DELAY);

    logger.info('Player score updated', {
      gameId,
      playerId,
      scoreChange: scoreCalculation.totalPoints,
      newTotalScore: player.score,
      rankChange: newRank - previousRank,
      newRank
    });

    this.emit('score:updated', {
      gameId,
      playerId,
      scoreCalculation,
      previousScore,
      newScore: player.score,
      rankChange: newRank - previousRank
    });
  }

  // ====================
  // LEADERBOARD MANAGEMENT
  // ====================

  /**
   * Calculate current leaderboard
   */
  public calculateLeaderboard(gameId: string): LeaderboardEntry[] {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) return [];

    const entries: LeaderboardEntry[] = Array.from(gameState.players.values())
      .map(player => ({
        userId: player.userId,
        username: player.username,
        score: player.score,
        rank: 0, // Will be set after sorting
        accuracy: player.questionsAnswered > 0 
          ? (player.correctAnswers / player.questionsAnswered) * 100 
          : 0,
        averageTime: player.averageResponseTime,
        streak: player.currentStreak,
        questionsAnswered: player.questionsAnswered,
        lastActivity: player.lastActivity
      }))
      .sort((a, b) => this.compareLeaderboardEntries(a, b));

    // Assign ranks with tie handling
    entries.forEach((entry, index) => {
      if (index === 0) {
        entry.rank = 1;
      } else {
        const previous = entries[index - 1];
        entry.rank = this.isTie(entry, previous) ? previous.rank : index + 1;
      }
      
      // Update player rank
      const player = gameState.players.get(entry.userId);
      if (player) {
        player.rank = entry.rank;
      }
    });

    return entries;
  }

  /**
   * Compare leaderboard entries for sorting
   */
  private compareLeaderboardEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
    // Primary: Score (higher is better)
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    
    // Secondary: Accuracy (higher is better)
    if (b.accuracy !== a.accuracy) {
      return b.accuracy - a.accuracy;
    }
    
    // Tertiary: Average response time (lower is better)
    if (a.averageTime !== b.averageTime) {
      return a.averageTime - b.averageTime;
    }
    
    // Quaternary: Questions answered (more is better)
    if (b.questionsAnswered !== a.questionsAnswered) {
      return b.questionsAnswered - a.questionsAnswered;
    }
    
    // Final: Last activity (more recent is better)
    return b.lastActivity.getTime() - a.lastActivity.getTime();
  }

  /**
   * Check if two entries are tied
   */
  private isTie(a: LeaderboardEntry, b: LeaderboardEntry): boolean {
    return a.score === b.score && 
           a.accuracy === b.accuracy && 
           a.averageTime === b.averageTime &&
           a.questionsAnswered === b.questionsAnswered;
  }

  /**
   * Start real-time leaderboard updates
   */
  private startLeaderboardUpdates(gameId: string): void {
    const updateTimer = setInterval(() => {
      const gameState = this.gameStateSync.getGameState(gameId);
      if (!gameState || gameState.status === 'FINISHED' || gameState.status === 'CANCELLED') {
        this.stopLeaderboardUpdates(gameId);
        return;
      }

      // Recalculate and broadcast leaderboard
      const leaderboard = this.calculateLeaderboard(gameId);
      if (this.hasLeaderboardChanged(gameId, leaderboard)) {
        this.leaderboards.set(gameId, leaderboard);
        this.broadcastLeaderboardUpdate(gameId);
      }

    }, this.LEADERBOARD_UPDATE_INTERVAL);

    this.leaderboardUpdateTimers.set(gameId, updateTimer);
  }

  /**
   * Stop leaderboard updates for game
   */
  private stopLeaderboardUpdates(gameId: string): void {
    const timer = this.leaderboardUpdateTimers.get(gameId);
    if (timer) {
      clearInterval(timer);
      this.leaderboardUpdateTimers.delete(gameId);
    }
  }

  /**
   * Check if leaderboard has changed
   */
  private hasLeaderboardChanged(gameId: string, newLeaderboard: LeaderboardEntry[]): boolean {
    const currentLeaderboard = this.leaderboards.get(gameId);
    if (!currentLeaderboard || currentLeaderboard.length !== newLeaderboard.length) {
      return true;
    }

    return currentLeaderboard.some((entry, index) => {
      const newEntry = newLeaderboard[index];
      return entry.userId !== newEntry.userId || 
             entry.score !== newEntry.score || 
             entry.rank !== newEntry.rank;
    });
  }

  // ====================
  // BROADCASTING
  // ====================

  /**
   * Broadcast individual score update
   */
  private async broadcastScoreUpdate(
    gameId: string, 
    playerId: string, 
    scoreUpdate: any
  ): Promise<void> {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) return;

    const player = gameState.players.get(playerId);
    if (!player) return;

    // Send personal score update to the player
    if (player.socketId) {
      this.io.to(player.socketId).emit('score_update', {
        gameId,
        playerId,
        ...scoreUpdate,
        timestamp: new Date()
      });
    }

    // Broadcast score change event to all players
    const scoreEvent: GameSyncEvent = {
      type: 'score_update',
      gameId,
      roomId: gameState.roomId,
      data: {
        userId: playerId,
        username: player.username,
        scoreChange: scoreUpdate.scoreChange,
        newScore: scoreUpdate.newTotalScore,
        newRank: scoreUpdate.rank
      },
      timestamp: new Date(),
      version: gameState.version
    };

    this.io.to(gameState.roomId).emit('game_event', scoreEvent);
  }

  /**
   * Broadcast leaderboard update
   */
  private broadcastLeaderboardUpdate(gameId: string): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    const leaderboard = this.leaderboards.get(gameId);
    
    if (!gameState || !leaderboard || !Array.isArray(leaderboard)) {
      logger.warn('Invalid leaderboard data for broadcast', { 
        gameId, 
        hasGameState: !!gameState, 
        leaderboard: leaderboard 
      });
      return;
    }

    const leaderboardEvent: GameSyncEvent = {
      type: 'leaderboard_update',
      gameId,
      roomId: gameState.roomId,
      data: {
        leaderboard,
        timestamp: new Date()
      },
      timestamp: new Date(),
      version: gameState.version
    };

    this.io.to(gameState.roomId).emit('game_event', leaderboardEvent);

    // Send personalized leaderboard to each player
    gameState.players.forEach((player, playerId) => {
      if (player.socketId) {
        const personalizedData = {
          ...leaderboardEvent.data,
          myRank: player.rank,
          myScore: player.score,
          myAccuracy: player.questionsAnswered > 0 
            ? (player.correctAnswers / player.questionsAnswered) * 100 
            : 0
        };

        this.io.to(player.socketId).emit('leaderboard_personal', {
          ...leaderboardEvent,
          data: personalizedData
        });
      }
    });
  }

  // ====================
  // PERFORMANCE TRACKING
  // ====================

  /**
   * Update player performance metrics
   */
  private updatePlayerMetrics(
    gameId: string,
    playerId: string,
    answer: PlayerAnswer,
    scoreCalculation: ScoreCalculation
  ): void {
    let gameMetrics = this.performanceMetrics.get(gameId);
    if (!gameMetrics) {
      gameMetrics = new Map();
      this.performanceMetrics.set(gameId, gameMetrics);
    }

    let playerMetrics = gameMetrics.get(playerId);
    if (!playerMetrics) {
      playerMetrics = {
        totalAnswers: 0,
        correctAnswers: 0,
        totalTime: 0,
        totalScore: 0,
        bestStreak: 0,
        avgResponseTime: 0,
        totalTimeBonus: 0,
        totalStreakBonus: 0,
        questionTimes: [],
        scoreProgression: []
      };
      gameMetrics.set(playerId, playerMetrics);
    }

    // Update metrics
    playerMetrics.totalAnswers++;
    if (answer.isCorrect) {
      playerMetrics.correctAnswers++;
    }
    playerMetrics.totalTime += answer.timeTaken;
    playerMetrics.totalScore += scoreCalculation.totalPoints;
    playerMetrics.avgResponseTime = playerMetrics.totalTime / playerMetrics.totalAnswers;
    playerMetrics.totalTimeBonus += scoreCalculation.timeBonus;
    playerMetrics.totalStreakBonus += scoreCalculation.streakBonus;
    
    // Track question times for analysis
    playerMetrics.questionTimes.push({
      questionIndex: answer.questionIndex,
      timeTaken: answer.timeTaken,
      isCorrect: answer.isCorrect,
      timestamp: answer.submittedAt
    });

    // Track score progression
    playerMetrics.scoreProgression.push({
      questionIndex: answer.questionIndex,
      scoreGained: scoreCalculation.totalPoints,
      cumulativeScore: playerMetrics.totalScore,
      timestamp: answer.submittedAt
    });

    // Limit arrays to prevent memory issues
    if (playerMetrics.questionTimes.length > 100) {
      playerMetrics.questionTimes = playerMetrics.questionTimes.slice(-100);
    }
    if (playerMetrics.scoreProgression.length > 100) {
      playerMetrics.scoreProgression = playerMetrics.scoreProgression.slice(-100);
    }
  }

  /**
   * Update score history
   */
  private updateScoreHistory(
    gameId: string,
    playerId: string,
    answer: PlayerAnswer,
    scoreCalculation: ScoreCalculation
  ): void {
    let gameHistories = this.gameScoreHistories.get(gameId);
    if (!gameHistories) {
      gameHistories = new Map();
      this.gameScoreHistories.set(gameId, gameHistories);
    }

    let playerHistory = gameHistories.get(playerId);
    if (!playerHistory) {
      playerHistory = {
        playerId,
        gameId,
        questionScores: [],
        totalScore: 0,
        averageScore: 0,
        bestStreak: 0,
        currentStreak: 0
      };
      gameHistories.set(playerId, playerHistory);
    }

    // Add question score
    playerHistory.questionScores.push({
      questionIndex: answer.questionIndex,
      baseScore: scoreCalculation.basePoints,
      timeBonus: scoreCalculation.timeBonus,
      streakBonus: scoreCalculation.streakBonus,
      difficultyBonus: scoreCalculation.difficultyBonus,
      totalScore: scoreCalculation.totalPoints,
      timestamp: answer.submittedAt
    });

    // Update totals
    playerHistory.totalScore += scoreCalculation.totalPoints;
    playerHistory.averageScore = playerHistory.totalScore / playerHistory.questionScores.length;

    const gameState = this.gameStateSync.getGameState(gameId);
    if (gameState) {
      const player = gameState.players.get(playerId);
      if (player) {
        playerHistory.currentStreak = player.currentStreak;
        playerHistory.bestStreak = player.bestStreak;
      }
    }
  }

  /**
   * Track ranking changes
   */
  private trackRankingChange(
    gameId: string,
    playerId: string,
    oldRank: number,
    newRank: number,
    scoreChange: number
  ): void {
    let gameRankingHistory = this.rankingHistory.get(gameId);
    if (!gameRankingHistory) {
      gameRankingHistory = [];
      this.rankingHistory.set(gameId, gameRankingHistory);
    }

    const change: LeaderboardChange = {
      playerId,
      oldRank,
      newRank,
      scoreChange,
      timestamp: new Date()
    };

    gameRankingHistory.push(change);

    // Limit history size
    if (gameRankingHistory.length > this.RANKING_HISTORY_LIMIT) {
      gameRankingHistory.splice(0, gameRankingHistory.length - this.RANKING_HISTORY_LIMIT);
    }

    // Broadcast ranking change
    const gameState = this.gameStateSync.getGameState(gameId);
    if (gameState) {
      const player = gameState.players.get(playerId);
      if (player) {
        const rankingEvent: GameSyncEvent = {
          type: 'score_update',
          gameId,
          roomId: gameState.roomId,
          data: {
            userId: playerId,
            username: player.username,
            oldRank,
            newRank,
            rankChange: newRank - oldRank,
            scoreChange
          },
          timestamp: new Date(),
          version: gameState.version
        };

        this.io.to(gameState.roomId).emit('game_event', rankingEvent);
      }
    }
  }

  // ====================
  // UTILITIES & CLEANUP
  // ====================

  /**
   * Get leaderboard for game
   */
  public getLeaderboard(gameId: string): LeaderboardEntry[] {
    return this.leaderboards.get(gameId) || [];
  }

  /**
   * Get player performance metrics
   */
  public getPlayerMetrics(gameId: string, playerId: string): any {
    const gameMetrics = this.performanceMetrics.get(gameId);
    return gameMetrics?.get(playerId) || null;
  }

  /**
   * Get player score history
   */
  public getPlayerScoreHistory(gameId: string, playerId: string): PlayerScoreHistory | null {
    const gameHistories = this.gameScoreHistories.get(gameId);
    return gameHistories?.get(playerId) || null;
  }

  /**
   * Get game scoring statistics
   */
  public getGameScoringStats(gameId: string): any {
    const leaderboard = this.leaderboards.get(gameId) || [];
    const gameMetrics = this.performanceMetrics.get(gameId);
    const rankingHistory = this.rankingHistory.get(gameId) || [];

    if (leaderboard.length === 0) {
      return null;
    }

    const totalScore = leaderboard.reduce((sum, entry) => sum + entry.score, 0);
    const avgScore = totalScore / leaderboard.length;
    const topScore = leaderboard[0]?.score || 0;
    const avgAccuracy = leaderboard.reduce((sum, entry) => sum + entry.accuracy, 0) / leaderboard.length;

    return {
      gameId,
      totalPlayers: leaderboard.length,
      totalScore,
      averageScore: avgScore,
      topScore,
      averageAccuracy: avgAccuracy,
      totalRankingChanges: rankingHistory.length,
      leaderboard: leaderboard.slice(0, 10) // Top 10
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.gameStateSync.on('state:updated', ({ gameId, state }) => {
      if (state.status === 'FINISHED' || state.status === 'CANCELLED') {
        this.finalizeGameScoring(gameId);
      }
    });

    this.gameStateSync.on('state:unregistered', ({ gameId }) => {
      this.cleanupGameScoring(gameId);
    });
  }

  /**
   * Finalize scoring when game ends
   */
  private finalizeGameScoring(gameId: string): void {
    // Stop updates
    this.stopLeaderboardUpdates(gameId);

    // Calculate final leaderboard
    const finalLeaderboard = this.calculateLeaderboard(gameId);
    this.leaderboards.set(gameId, finalLeaderboard);

    // Broadcast final results
    this.broadcastLeaderboardUpdate(gameId);

    // Check for perfect game bonuses
    this.applyPerfectGameBonuses(gameId);

    logger.info('Game scoring finalized', { 
      gameId, 
      finalLeaderboard: finalLeaderboard.slice(0, 5) // Top 5
    });

    this.emit('scoring:finalized', { gameId, leaderboard: finalLeaderboard });
  }

  /**
   * Apply perfect game bonuses
   */
  private applyPerfectGameBonuses(gameId: string): void {
    const config = this.scoringConfigs.get(gameId);
    const gameState = this.gameStateSync.getGameState(gameId);
    
    if (!config || !gameState || config.perfectGameBonus <= 0) return;

    // Find players with perfect games
    gameState.players.forEach((player, playerId) => {
      if (player.questionsAnswered > 0 && 
          player.correctAnswers === player.questionsAnswered && 
          player.questionsAnswered === gameState.questions.length) {
        
        player.score += config.perfectGameBonus;
        
        logger.info('Perfect game bonus applied', {
          gameId,
          playerId,
          bonus: config.perfectGameBonus,
          newScore: player.score
        });

        // Broadcast bonus
        if (player.socketId) {
          this.io.to(player.socketId).emit('perfect_game_bonus', {
            bonus: config.perfectGameBonus,
            newTotalScore: player.score
          });
        }
      }
    });

    // Recalculate final leaderboard with bonuses
    const finalLeaderboard = this.calculateLeaderboard(gameId);
    this.leaderboards.set(gameId, finalLeaderboard);
    this.broadcastLeaderboardUpdate(gameId);
  }

  /**
   * Cleanup scoring data for game
   */
  private cleanupGameScoring(gameId: string): void {
    this.stopLeaderboardUpdates(gameId);
    
    this.scoringConfigs.delete(gameId);
    this.gameScoreHistories.delete(gameId);
    this.leaderboards.delete(gameId);
    this.performanceMetrics.delete(gameId);
    this.rankingHistory.delete(gameId);

    logger.info('Game scoring data cleaned up', { gameId });
  }

  /**
   * Shutdown service and cleanup
   */
  public shutdown(): void {
    // Stop all leaderboard update timers
    this.leaderboardUpdateTimers.forEach((timer) => clearInterval(timer));

    // Clear all data
    this.scoringConfigs.clear();
    this.gameScoreHistories.clear();
    this.leaderboards.clear();
    this.performanceMetrics.clear();
    this.rankingHistory.clear();
    this.leaderboardUpdateTimers.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.info('Realtime scoring service shutdown completed');
  }
}

