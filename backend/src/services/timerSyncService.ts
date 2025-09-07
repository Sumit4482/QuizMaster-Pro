import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { GameStateSyncService } from './gameStateSyncService';
import {
  GameState,
  GameTimer,
  ClientTimestamp,
  LatencyInfo,
  GameSyncEvent,
  GameError
} from '../sockets/types/game';

interface TimerInstance {
  gameId: string;
  timerId: string;
  type: 'question' | 'break' | 'game' | 'countdown';
  startTime: Date;
  duration: number; // milliseconds
  endTime: Date;
  isActive: boolean;
  isPaused: boolean;
  pausedAt?: Date;
  pausedDuration: number;
  warnings: number[]; // Warning thresholds in seconds
  warningsTriggered: Set<number>;
  serverTimer?: NodeJS.Timeout;
  syncInterval?: NodeJS.Timeout;
}

interface PlayerTimeSync {
  playerId: string;
  gameId: string;
  serverTime: number;
  clientTime: number;
  offset: number;
  roundTripTime: number;
  lastSync: Date;
  syncQuality: 'excellent' | 'good' | 'fair' | 'poor';
  compensationMs: number;
}

/**
 * Timer Synchronization & Management Service
 * Provides authoritative timing with network compensation and client synchronization
 */
export class TimerSyncService extends EventEmitter {
  private static instance: TimerSyncService | null = null;
  private io: Server;
  private gameStateSync: GameStateSyncService;
  
  // Timer management
  private activeTimers: Map<string, TimerInstance> = new Map();
  private playerSyncs: Map<string, PlayerTimeSync> = new Map();
  private syncTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Configuration
  private readonly SYNC_INTERVAL = 1000; // 1 second sync broadcasts
  private readonly TIME_SYNC_INTERVAL = 30000; // 30 seconds full sync
  private readonly MAX_SYNC_DRIFT = 500; // 500ms max drift before resync
  private readonly DEFAULT_WARNINGS = [30, 10, 5, 3, 1]; // Warning at these seconds remaining
  private readonly GRACE_PERIOD_MS = 2000; // 2 second grace period for submissions
  private readonly MAX_COMPENSATION_MS = 1000; // Maximum compensation for latency

  private constructor(io: Server, gameStateSync: GameStateSyncService) {
    super();
    this.io = io;
    this.gameStateSync = gameStateSync;
    this.setupSyncRoutines();
  }

  public static getInstance(
    io?: Server,
    gameStateSync?: GameStateSyncService
  ): TimerSyncService {
    if (!TimerSyncService.instance) {
      if (!io || !gameStateSync) {
        throw new Error('Socket.io and GameStateSyncService instances required for first initialization');
      }
      TimerSyncService.instance = new TimerSyncService(io, gameStateSync);
    }
    return TimerSyncService.instance;
  }

  // ====================
  // TIMER CREATION & MANAGEMENT
  // ====================

  /**
   * Create and start a new timer
   */
  public createTimer(
    gameId: string,
    type: 'question' | 'break' | 'game' | 'countdown',
    duration: number, // seconds
    warnings?: number[] // seconds
  ): string {
    const timerId = `${gameId}_${type}_${Date.now()}`;
    const now = new Date();
    const endTime = new Date(now.getTime() + duration * 1000);

    const timer: TimerInstance = {
      gameId,
      timerId,
      type,
      startTime: now,
      duration: duration * 1000,
      endTime,
      isActive: true,
      isPaused: false,
      pausedDuration: 0,
      warnings: warnings || this.DEFAULT_WARNINGS,
      warningsTriggered: new Set()
    };

    this.activeTimers.set(timerId, timer);

    // Start server-side timer
    this.startServerTimer(timer);

    // Start sync broadcasts
    this.startTimerSync(timerId);

    // Update game state with timer
    this.updateGameTimer(gameId, timer);

    // Broadcast timer start
    this.broadcastTimerEvent(gameId, 'timer_started', {
      timerId,
      type,
      duration: duration * 1000,
      startTime: now,
      endTime,
      warnings: timer.warnings
    });

    logger.info('Timer created and started', {
      gameId,
      timerId,
      type,
      duration,
      endTime: endTime.toISOString()
    });

    return timerId;
  }

  /**
   * Pause a timer
   */
  public pauseTimer(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer || !timer.isActive || timer.isPaused) {
      return;
    }

    timer.isPaused = true;
    timer.pausedAt = new Date();

    // Clear server timer
    if (timer.serverTimer) {
      clearTimeout(timer.serverTimer);
      timer.serverTimer = undefined;
    }

    // Stop sync broadcasts
    this.stopTimerSync(timerId);

    // Broadcast pause event
    this.broadcastTimerEvent(timer.gameId, 'timer_paused', {
      timerId,
      pausedAt: timer.pausedAt
    });

    logger.info('Timer paused', { gameId: timer.gameId, timerId });
  }

  /**
   * Resume a paused timer
   */
  public resumeTimer(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer || !timer.isActive || !timer.isPaused || !timer.pausedAt) {
      return;
    }

    // Calculate paused duration
    const pauseDuration = Date.now() - timer.pausedAt.getTime();
    timer.pausedDuration += pauseDuration;

    // Adjust end time
    timer.endTime = new Date(timer.endTime.getTime() + pauseDuration);

    timer.isPaused = false;
    timer.pausedAt = undefined;

    // Restart server timer
    const remainingTime = timer.endTime.getTime() - Date.now();
    if (remainingTime > 0) {
      this.startServerTimer(timer);
      this.startTimerSync(timerId);
    } else {
      // Timer already expired during pause
      this.completeTimer(timerId);
      return;
    }

    // Update game state
    this.updateGameTimer(timer.gameId, timer);

    // Broadcast resume event
    this.broadcastTimerEvent(timer.gameId, 'timer_resumed', {
      timerId,
      resumedAt: new Date(),
      newEndTime: timer.endTime,
      pauseDuration
    });

    logger.info('Timer resumed', { 
      gameId: timer.gameId, 
      timerId,
      pausedFor: pauseDuration,
      newEndTime: timer.endTime.toISOString()
    });
  }

  /**
   * Extend a timer
   */
  public extendTimer(timerId: string, extensionSeconds: number): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer || !timer.isActive) {
      return;
    }

    const extensionMs = extensionSeconds * 1000;
    const oldEndTime = timer.endTime;
    timer.endTime = new Date(timer.endTime.getTime() + extensionMs);
    timer.duration += extensionMs;

    // Update server timer if not paused
    if (!timer.isPaused) {
      if (timer.serverTimer) {
        clearTimeout(timer.serverTimer);
      }
      this.startServerTimer(timer);
    }

    // Update game state
    this.updateGameTimer(timer.gameId, timer);

    // Broadcast extension event
    this.broadcastTimerEvent(timer.gameId, 'timer_extended', {
      timerId,
      extensionSeconds,
      oldEndTime,
      newEndTime: timer.endTime
    });

    logger.info('Timer extended', {
      gameId: timer.gameId,
      timerId,
      extensionSeconds,
      newEndTime: timer.endTime.toISOString()
    });
  }

  /**
   * Complete/stop a timer
   */
  public completeTimer(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      return;
    }

    timer.isActive = false;

    // Clear server timer
    if (timer.serverTimer) {
      clearTimeout(timer.serverTimer);
      timer.serverTimer = undefined;
    }

    // Stop sync
    this.stopTimerSync(timerId);

    // Broadcast completion
    this.broadcastTimerEvent(timer.gameId, 'timer_completed', {
      timerId,
      type: timer.type,
      completedAt: new Date()
    });

    logger.info('Timer completed', { gameId: timer.gameId, timerId, type: timer.type });

    this.emit('timer:completed', { timerId, timer });

    // Remove from active timers after delay (for cleanup)
    setTimeout(() => {
      this.activeTimers.delete(timerId);
    }, 5000);
  }

  // ====================
  // TIME SYNCHRONIZATION
  // ====================

  /**
   * Sync time with client
   */
  public syncTimeWithClient(
    playerId: string,
    clientTime: number,
    gameId?: string
  ): ClientTimestamp {
    const serverTime = Date.now();
    const requestTime = Date.now(); // Time when we process this request

    // Calculate round trip time (approximate)
    const roundTripTime = requestTime - clientTime;
    const offset = serverTime - clientTime - (roundTripTime / 2);

    const clientTimestamp: ClientTimestamp = {
      clientTime,
      serverTime,
      roundTripTime,
      offset
    };

    // Store sync info for player
    const existingSync = this.playerSyncs.get(playerId);
    const syncQuality = this.calculateSyncQuality(roundTripTime);
    const compensationMs = Math.min(roundTripTime / 2, this.MAX_COMPENSATION_MS);

    const playerSync: PlayerTimeSync = {
      playerId,
      gameId: gameId || existingSync?.gameId || '',
      serverTime,
      clientTime,
      offset,
      roundTripTime,
      lastSync: new Date(),
      syncQuality,
      compensationMs
    };

    this.playerSyncs.set(playerId, playerSync);

    // Update game state sync service with latency info
    if (gameId) {
      this.gameStateSync.updatePlayerLatency(playerId, roundTripTime);
    }

    logger.debug('Time synced with client', {
      playerId,
      gameId,
      offset,
      roundTripTime,
      syncQuality,
      compensationMs
    });

    return clientTimestamp;
  }

  /**
   * Calculate sync quality based on round trip time
   */
  private calculateSyncQuality(roundTripTime: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (roundTripTime < 50) return 'excellent';
    if (roundTripTime < 100) return 'good';
    if (roundTripTime < 200) return 'fair';
    return 'poor';
  }

  /**
   * Get compensated time for player
   */
  public getCompensatedTime(playerId: string, clientTime?: number): number {
    const playerSync = this.playerSyncs.get(playerId);
    if (!playerSync) {
      return clientTime || Date.now();
    }

    const serverTime = Date.now();
    
    // Apply offset compensation
    if (clientTime) {
      return clientTime + playerSync.offset + playerSync.compensationMs;
    }
    
    return serverTime;
  }

  /**
   * Check if client time is within acceptable range
   */
  public isTimeValid(playerId: string, clientTime: number, tolerance: number = 1000): boolean {
    const playerSync = this.playerSyncs.get(playerId);
    if (!playerSync) {
      return true; // No sync data, assume valid
    }

    const expectedServerTime = clientTime + playerSync.offset;
    const actualServerTime = Date.now();
    const drift = Math.abs(actualServerTime - expectedServerTime);

    return drift <= tolerance;
  }

  // ====================
  // TIMER SYNCHRONIZATION
  // ====================

  /**
   * Start timer synchronization broadcasts
   */
  private startTimerSync(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer) return;

    const syncInterval = setInterval(() => {
      if (!timer.isActive || timer.isPaused) {
        this.stopTimerSync(timerId);
        return;
      }

      this.broadcastTimerSync(timerId);
      this.checkTimerWarnings(timer);
    }, this.SYNC_INTERVAL);

    this.syncTimers.set(timerId, syncInterval);
  }

  /**
   * Stop timer synchronization
   */
  private stopTimerSync(timerId: string): void {
    const syncInterval = this.syncTimers.get(timerId);
    if (syncInterval) {
      clearInterval(syncInterval);
      this.syncTimers.delete(timerId);
    }
  }

  /**
   * Broadcast timer synchronization
   */
  private broadcastTimerSync(timerId: string): void {
    const timer = this.activeTimers.get(timerId);
    if (!timer || !timer.isActive || timer.isPaused) {
      return;
    }

    const now = Date.now();
    const timeRemaining = Math.max(0, timer.endTime.getTime() - now);
    const progress = 1 - (timeRemaining / timer.duration);

    const syncData = {
      timerId,
      type: timer.type,
      serverTime: now,
      timeRemaining,
      totalDuration: timer.duration,
      progress: Math.min(1, Math.max(0, progress)),
      endTime: timer.endTime,
      isActive: timer.isActive,
      isPaused: timer.isPaused
    };

    // Broadcast to all players in game
    const gameState = this.gameStateSync.getGameState(timer.gameId);
    if (gameState) {
      this.io.to(gameState.roomId).emit('timer_sync', syncData);
    }

    // Send personalized sync to each player with compensation
    if (gameState) {
      gameState.players.forEach((player, playerId) => {
        if (player.socketId) {
          const playerSync = this.playerSyncs.get(playerId);
          const personalizedSync = {
            ...syncData,
            compensationMs: playerSync?.compensationMs || 0,
            syncQuality: playerSync?.syncQuality || 'fair',
            clientOffset: playerSync?.offset || 0
          };

          this.io.to(player.socketId).emit('timer_sync_personal', personalizedSync);
        }
      });
    }
  }

  /**
   * Check and trigger timer warnings
   */
  private checkTimerWarnings(timer: TimerInstance): void {
    const timeRemaining = Math.max(0, timer.endTime.getTime() - Date.now());
    const secondsRemaining = Math.ceil(timeRemaining / 1000);

    timer.warnings.forEach(warningSeconds => {
      if (secondsRemaining <= warningSeconds && !timer.warningsTriggered.has(warningSeconds)) {
        timer.warningsTriggered.add(warningSeconds);

        this.broadcastTimerEvent(timer.gameId, 'timer_warning', {
          timerId: timer.timerId,
          warningSeconds,
          timeRemaining: timeRemaining,
          secondsRemaining
        });

        logger.debug('Timer warning triggered', {
          gameId: timer.gameId,
          timerId: timer.timerId,
          warningSeconds,
          secondsRemaining
        });
      }
    });
  }

  // ====================
  // SERVER TIMER MANAGEMENT
  // ====================

  /**
   * Start server-side timer
   */
  private startServerTimer(timer: TimerInstance): void {
    const delay = timer.endTime.getTime() - Date.now();
    
    if (delay <= 0) {
      // Timer already expired
      this.completeTimer(timer.timerId);
      return;
    }

    timer.serverTimer = setTimeout(() => {
      this.completeTimer(timer.timerId);
    }, delay);
  }

  /**
   * Update game state with timer
   */
  private updateGameTimer(gameId: string, timer: TimerInstance): void {
    const now = Date.now();
    const timeRemaining = Math.max(0, timer.endTime.getTime() - now);

    const gameTimer: GameTimer = {
      startTime: timer.startTime,
      duration: timer.duration,
      timeRemaining,
      isRunning: timer.isActive && !timer.isPaused,
      isPaused: timer.isPaused,
      pausedAt: timer.pausedAt,
      warnings: timer.warnings,
      serverTime: now
    };

    // Update game state through sync service
    this.gameStateSync.updateGameState(gameId, {
      masterTimer: gameTimer
    });
  }

  // ====================
  // EVENT BROADCASTING
  // ====================

  /**
   * Broadcast timer event
   */
  private broadcastTimerEvent(gameId: string, eventType: string, data: any): void {
    const gameState = this.gameStateSync.getGameState(gameId);
    if (!gameState) return;

    const timerEvent: GameSyncEvent = {
      type: eventType as any,
      gameId,
      roomId: gameState.roomId,
      data,
      timestamp: new Date(),
      version: gameState.version
    };

    this.io.to(gameState.roomId).emit('game_event', timerEvent);

    this.emit('timer:event', { gameId, eventType, data });
  }

  // ====================
  // VALIDATION & UTILITIES
  // ====================

  /**
   * Validate submission timing
   */
  public validateSubmissionTiming(
    timerId: string,
    playerId: string,
    submissionTime: Date,
    allowGracePeriod: boolean = true
  ): { isValid: boolean; reason?: string; compensatedTime?: Date } {
    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      return { isValid: false, reason: 'Timer not found' };
    }

    const playerSync = this.playerSyncs.get(playerId);
    const compensation = playerSync?.compensationMs || 0;
    
    // Apply network compensation
    const compensatedTime = new Date(submissionTime.getTime() - compensation);
    
    // Check if submission is before timer end
    if (compensatedTime <= timer.endTime) {
      return { isValid: true, compensatedTime };
    }

    // Check grace period
    if (allowGracePeriod) {
      const graceEndTime = new Date(timer.endTime.getTime() + this.GRACE_PERIOD_MS);
      if (compensatedTime <= graceEndTime) {
        return { isValid: true, compensatedTime, reason: 'Within grace period' };
      }
    }

    const lateness = compensatedTime.getTime() - timer.endTime.getTime();
    return { 
      isValid: false, 
      reason: `Submission ${lateness}ms after deadline`,
      compensatedTime 
    };
  }

  /**
   * Get active timer for game
   */
  public getActiveTimer(gameId: string, type?: string): TimerInstance | null {
    for (const timer of this.activeTimers.values()) {
      if (timer.gameId === gameId && timer.isActive && (!type || timer.type === type)) {
        return timer;
      }
    }
    return null;
  }

  /**
   * Get timer status
   */
  public getTimerStatus(timerId: string): any {
    const timer = this.activeTimers.get(timerId);
    if (!timer) return null;

    const now = Date.now();
    const timeRemaining = Math.max(0, timer.endTime.getTime() - now);
    const progress = 1 - (timeRemaining / timer.duration);

    return {
      timerId,
      gameId: timer.gameId,
      type: timer.type,
      startTime: timer.startTime,
      endTime: timer.endTime,
      duration: timer.duration,
      timeRemaining,
      progress: Math.min(1, Math.max(0, progress)),
      isActive: timer.isActive,
      isPaused: timer.isPaused,
      pausedDuration: timer.pausedDuration,
      warnings: timer.warnings,
      warningsTriggered: Array.from(timer.warningsTriggered)
    };
  }

  // ====================
  // SETUP & CLEANUP
  // ====================

  /**
   * Setup sync routines
   */
  private setupSyncRoutines(): void {
    // Periodic full time sync with all clients
    setInterval(() => {
      this.performFullTimeSync();
    }, this.TIME_SYNC_INTERVAL);

    // Cleanup old player syncs
    setInterval(() => {
      this.cleanupOldSyncs();
    }, 60000); // Every minute
  }

  /**
   * Perform full time synchronization
   */
  private performFullTimeSync(): void {
    this.playerSyncs.forEach((playerSync, playerId) => {
      // Check if sync is getting stale
      const timeSinceLastSync = Date.now() - playerSync.lastSync.getTime();
      if (timeSinceLastSync > this.TIME_SYNC_INTERVAL * 2) {
        // Request resync from client
        const gameState = this.gameStateSync.getGameState(playerSync.gameId);
        if (gameState) {
          const player = gameState.players.get(playerId);
          if (player && player.socketId) {
            this.io.to(player.socketId).emit('time_sync_request', {
              serverTime: Date.now(),
              lastSync: playerSync.lastSync
            });
          }
        }
      }
    });
  }

  /**
   * Cleanup old sync data
   */
  private cleanupOldSyncs(): void {
    const cutoffTime = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    
    for (const [playerId, playerSync] of this.playerSyncs.entries()) {
      if (playerSync.lastSync.getTime() < cutoffTime) {
        this.playerSyncs.delete(playerId);
      }
    }
  }

  /**
   * Cleanup timers for game
   */
  public cleanupGameTimers(gameId: string): void {
    // Stop and remove all timers for game
    for (const [timerId, timer] of this.activeTimers.entries()) {
      if (timer.gameId === gameId) {
        this.completeTimer(timerId);
      }
    }

    // Remove player syncs for game
    for (const [playerId, playerSync] of this.playerSyncs.entries()) {
      if (playerSync.gameId === gameId) {
        this.playerSyncs.delete(playerId);
      }
    }

    logger.info('Game timers cleaned up', { gameId });
  }

  /**
   * Get sync statistics
   */
  public getSyncStats(): any {
    const activeTimersCount = this.activeTimers.size;
    const playerSyncsCount = this.playerSyncs.size;
    const syncQualityStats = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0
    };

    this.playerSyncs.forEach(playerSync => {
      syncQualityStats[playerSync.syncQuality]++;
    });

    return {
      activeTimers: activeTimersCount,
      playerSyncs: playerSyncsCount,
      syncQuality: syncQualityStats,
      avgRoundTripTime: this.calculateAverageRoundTripTime()
    };
  }

  /**
   * Calculate average round trip time
   */
  private calculateAverageRoundTripTime(): number {
    const syncs = Array.from(this.playerSyncs.values());
    if (syncs.length === 0) return 0;
    
    const totalRtt = syncs.reduce((sum, sync) => sum + sync.roundTripTime, 0);
    return Math.round(totalRtt / syncs.length);
  }

  /**
   * Shutdown service
   */
  public shutdown(): void {
    // Complete all active timers
    this.activeTimers.forEach((timer) => {
      this.completeTimer(timer.timerId);
    });

    // Clear all sync intervals
    this.syncTimers.forEach((interval) => {
      clearInterval(interval);
    });

    // Clear all data
    this.activeTimers.clear();
    this.playerSyncs.clear();
    this.syncTimers.clear();

    // Remove all listeners
    this.removeAllListeners();

    logger.info('Timer sync service shutdown completed');
  }
}

