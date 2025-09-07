import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { 
  GameState, 
  GameSyncEvent, 
  GameStatus, 
  PlayerStatus,
  GameError,
  ClientTimestamp,
  LatencyInfo
} from '../sockets/types/game';

/**
 * Enhanced Game State Synchronization Service
 * Provides authoritative server-side game state management with
 * real-time synchronization, conflict resolution, and state validation
 */
export class GameStateSyncService extends EventEmitter {
  private static instance: GameStateSyncService | null = null;
  private io: Server;
  private gameStates: Map<string, GameState> = new Map();
  private gameVersions: Map<string, number> = new Map();
  private playerLatency: Map<string, LatencyInfo> = new Map();
  private syncTimers: Map<string, NodeJS.Timeout> = new Map();
  private stateSnapshots: Map<string, GameState[]> = new Map(); // For rollback
  private networkCompensation: Map<string, number> = new Map();
  
  // Configuration
  private readonly SYNC_INTERVAL = 1000; // 1 second
  private readonly STATE_SNAPSHOT_INTERVAL = 5000; // 5 seconds
  private readonly MAX_SNAPSHOTS = 10;
  private readonly LATENCY_COMPENSATION_THRESHOLD = 200; // ms
  private readonly CONFLICT_RESOLUTION_WINDOW = 2000; // ms

  private constructor(io: Server) {
    super();
    this.io = io;
    this.startSyncRoutines();
  }

  public static getInstance(io?: Server): GameStateSyncService {
    if (!GameStateSyncService.instance) {
      if (!io) {
        throw new Error('Socket.io instance required for first initialization');
      }
      GameStateSyncService.instance = new GameStateSyncService(io);
    }
    return GameStateSyncService.instance;
  }

  // ====================
  // STATE SYNCHRONIZATION
  // ====================

  /**
   * Register a game state for synchronization
   */
  public registerGameState(gameState: GameState): void {
    this.gameStates.set(gameState.id, { ...gameState });
    this.gameVersions.set(gameState.id, 1);
    this.stateSnapshots.set(gameState.id, []);
    
    // Start sync routines for this game
    this.startGameSyncTimer(gameState.id);
    this.startStateSnapshotTimer(gameState.id);
    
    logger.info('Game state registered for sync', { 
      gameId: gameState.id, 
      roomId: gameState.roomId 
    });
  }

  /**
   * Update game state with conflict resolution
   */
  public updateGameState(
    gameId: string, 
    updates: Partial<GameState>, 
    clientVersion?: number,
    playerId?: string
  ): GameState {
    const currentState = this.gameStates.get(gameId);
    if (!currentState) {
      throw new GameError('GAME_NOT_FOUND', 'Game state not found', gameId, playerId);
    }

    const currentVersion = this.gameVersions.get(gameId) || 1;

    // Handle version conflicts (optimistic concurrency control)
    if (clientVersion && clientVersion < currentVersion) {
      logger.warn('State update conflict detected', {
        gameId,
        clientVersion,
        currentVersion,
        playerId
      });

      // Send state resync to client
      this.sendStateResync(gameId, playerId);
      throw new GameError('STATE_CONFLICT', 'State version conflict', gameId, playerId);
    }

    // Validate state update
    const validation = this.validateStateUpdate(currentState, updates, playerId);
    if (!validation.isValid) {
      throw new GameError('INVALID_STATE_UPDATE', validation.error || 'Invalid state update', gameId, playerId);
    }

    // Apply updates atomically
    const newState: GameState = {
      ...currentState,
      ...updates,
      version: currentVersion + 1,
      updatedAt: new Date()
    };

    // Store updated state
    this.gameStates.set(gameId, newState);
    this.gameVersions.set(gameId, newState.version);

    // Broadcast state sync to all players
    this.broadcastStateUpdate(gameId, updates, newState.version);

    logger.debug('Game state updated', {
      gameId,
      version: newState.version,
      updates: Object.keys(updates),
      playerId
    });

    this.emit('state:updated', { gameId, state: newState, updates, playerId });
    return newState;
  }

  /**
   * Get current game state
   */
  public getGameState(gameId: string): GameState | null {
    return this.gameStates.get(gameId) || null;
  }

  /**
   * Get game state for specific player (with appropriate filtering)
   */
  public getGameStateForPlayer(gameId: string, playerId: string): Partial<GameState> | null {
    const state = this.gameStates.get(gameId);
    if (!state) return null;

  // Filter sensitive information based on game status
  const playerState: Partial<GameState> = {
    id: state.id,
    roomId: state.roomId,
    status: state.status,
    currentQuestionIndex: state.currentQuestionIndex,
    masterTimer: state.masterTimer,
    leaderboard: state.leaderboard,
    players: this.sanitizePlayersMapForClient(state.players, playerId),
    settings: state.settings,
    version: state.version,
    updatedAt: state.updatedAt
  };

  // Include current question without answers if in progress
  if (state.currentQuestion && state.status === GameStatus.IN_PROGRESS) {
    playerState.currentQuestion = {
      ...state.currentQuestion,
      correctAnswer: undefined, // Hide correct answer
      playerAnswers: new Map()  // Hide other players' answers
    };
  }

    return playerState;
  }

  // ====================
  // CONFLICT RESOLUTION
  // ====================

  /**
   * Validate state update before applying
   */
  private validateStateUpdate(
    currentState: GameState, 
    updates: Partial<GameState>, 
    playerId?: string
  ): { isValid: boolean; error?: string } {
    // Validate game status transitions
    if (updates.status && !this.isValidStatusTransition(currentState.status, updates.status)) {
      return { 
        isValid: false, 
        error: `Invalid status transition from ${currentState.status} to ${updates.status}` 
      };
    }

    // Validate player permissions for updates
    if (playerId) {
      const player = currentState.players.get(playerId);
      if (!player) {
        return { isValid: false, error: 'Player not found in game' };
      }

      // Check if player can make certain updates
      if (updates.status && !player.isHost && 
          ['PAUSED', 'FINISHED', 'CANCELLED'].includes(updates.status)) {
        return { isValid: false, error: 'Insufficient permissions for status change' };
      }
    }

    // Validate question index consistency
    if (updates.currentQuestionIndex !== undefined) {
      if (updates.currentQuestionIndex < -1 || 
          updates.currentQuestionIndex >= currentState.questions.length) {
        return { isValid: false, error: 'Invalid question index' };
      }
    }

    // Validate timer updates
    if (updates.masterTimer) {
      if (updates.masterTimer.duration < 0) {
        return { isValid: false, error: 'Invalid timer duration' };
      }
    }

    return { isValid: true };
  }

  /**
   * Check if status transition is valid
   */
  private isValidStatusTransition(current: GameStatus, next: GameStatus): boolean {
    const validTransitions: Record<GameStatus, GameStatus[]> = {
      [GameStatus.WAITING]: [GameStatus.STARTING, GameStatus.CANCELLED],
      [GameStatus.STARTING]: [GameStatus.IN_PROGRESS, GameStatus.CANCELLED],
      [GameStatus.IN_PROGRESS]: [GameStatus.PAUSED, GameStatus.QUESTION_BREAK, GameStatus.FINISHED, GameStatus.CANCELLED],
      [GameStatus.PAUSED]: [GameStatus.IN_PROGRESS, GameStatus.FINISHED, GameStatus.CANCELLED],
      [GameStatus.QUESTION_BREAK]: [GameStatus.IN_PROGRESS, GameStatus.FINISHED, GameStatus.CANCELLED],
      [GameStatus.FINISHED]: [], // Final state
      [GameStatus.CANCELLED]: [] // Final state
    };

    return validTransitions[current].includes(next);
  }

  /**
   * Send state resynchronization to specific player
   */
  private sendStateResync(gameId: string, playerId?: string): void {
    const state = this.gameStates.get(gameId);
    if (!state) return;

    const syncEvent: GameSyncEvent = {
      type: 'game_state',
      gameId,
      roomId: state.roomId,
      data: {
        fullState: playerId ? this.getGameStateForPlayer(gameId, playerId) : state,
        resync: true,
        timestamp: new Date()
      },
      timestamp: new Date(),
      version: state.version
    };

    if (playerId) {
      // Send to specific player
      const player = state.players.get(playerId);
      if (player && player.socketId) {
        this.io.to(player.socketId).emit('game_sync', syncEvent);
      }
    } else {
      // Send to all players in room
      this.io.to(state.roomId).emit('game_sync', syncEvent);
    }

    logger.info('State resync sent', { gameId, playerId, version: state.version });
  }

  // ====================
  // NETWORK COMPENSATION
  // ====================

  /**
   * Update player latency information
   */
  public updatePlayerLatency(playerId: string, latency: number): void {
    const existing = this.playerLatency.get(playerId);
    
    const latencyInfo: LatencyInfo = {
      userId: playerId,
      averageLatency: existing ? (existing.averageLatency * 0.8 + latency * 0.2) : latency,
      lastPing: new Date(),
      quality: this.calculateConnectionQuality(latency)
    };

    this.playerLatency.set(playerId, latencyInfo);
    
    // Update network compensation
    this.networkCompensation.set(playerId, Math.min(latency, this.LATENCY_COMPENSATION_THRESHOLD));
  }

  /**
   * Calculate connection quality based on latency
   */
  private calculateConnectionQuality(latency: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (latency < 50) return 'excellent';
    if (latency < 100) return 'good';
    if (latency < 200) return 'fair';
    return 'poor';
  }

  /**
   * Get network compensation for player
   */
  public getNetworkCompensation(playerId: string): number {
    return this.networkCompensation.get(playerId) || 0;
  }

  // ====================
  // STATE BROADCASTING
  // ====================

  /**
   * Broadcast state update to all players
   */
  private broadcastStateUpdate(
    gameId: string, 
    updates: Partial<GameState>, 
    version: number
  ): void {
    const state = this.gameStates.get(gameId);
    if (!state) return;

    const syncEvent: GameSyncEvent = {
      type: 'game_state',
      gameId,
      roomId: state.roomId,
      data: {
        updates,
        version,
        timestamp: new Date()
      },
      timestamp: new Date(),
      version
    };

    // Send updates to all players in the room
    this.io.to(state.roomId).emit('game_sync', syncEvent);

    // Send personalized state to each player
    state.players.forEach((player, playerId) => {
      if (player.socketId) {
        const playerSpecificState = this.getGameStateForPlayer(gameId, playerId);
        const playerSyncEvent: GameSyncEvent = {
          ...syncEvent,
          data: {
            ...syncEvent.data,
            playerState: playerSpecificState
          }
        };
        
        this.io.to(player.socketId).emit('game_sync_personal', playerSyncEvent);
      }
    });
  }

  /**
   * Broadcast timer synchronization
   */
  public broadcastTimerSync(gameId: string): void {
    const state = this.gameStates.get(gameId);
    if (!state || !state.masterTimer) return;

    const serverTime = Date.now();
    const timerData = {
      ...state.masterTimer,
      serverTime,
      timeRemaining: Math.max(0, state.masterTimer.duration - (serverTime - state.masterTimer.startTime.getTime()))
    };

    const syncEvent: GameSyncEvent = {
      type: 'timer_sync',
      gameId,
      roomId: state.roomId,
      data: timerData,
      timestamp: new Date(),
      version: state.version
    };

    this.io.to(state.roomId).emit('game_sync', syncEvent);
  }

  // ====================
  // STATE RECOVERY
  // ====================

  /**
   * Create state snapshot for recovery
   */
  private createStateSnapshot(gameId: string): void {
    const state = this.gameStates.get(gameId);
    if (!state) return;

    let snapshots = this.stateSnapshots.get(gameId) || [];
    
    // Add current state as snapshot
    snapshots.push({ ...state });
    
    // Limit snapshot count
    if (snapshots.length > this.MAX_SNAPSHOTS) {
      snapshots = snapshots.slice(-this.MAX_SNAPSHOTS);
    }
    
    this.stateSnapshots.set(gameId, snapshots);
    
    logger.debug('State snapshot created', { 
      gameId, 
      version: state.version,
      snapshotCount: snapshots.length 
    });
  }

  /**
   * Restore state from snapshot
   */
  public restoreFromSnapshot(gameId: string, snapshotIndex?: number): GameState | null {
    const snapshots = this.stateSnapshots.get(gameId);
    if (!snapshots || snapshots.length === 0) return null;

    const index = snapshotIndex !== undefined ? snapshotIndex : snapshots.length - 1;
    const snapshot = snapshots[index];
    
    if (!snapshot) return null;

    // Restore state
    this.gameStates.set(gameId, { ...snapshot });
    this.gameVersions.set(gameId, snapshot.version);

    // Broadcast restored state
    this.sendStateResync(gameId);

    logger.warn('State restored from snapshot', { 
      gameId, 
      version: snapshot.version,
      snapshotIndex: index 
    });

    this.emit('state:restored', { gameId, state: snapshot, snapshotIndex: index });
    return snapshot;
  }

  // ====================
  // UTILITIES
  // ====================

  /**
   * Sanitize players data for client
   */
  private sanitizePlayersForClient(
    players: Map<string, any>, 
    requestingPlayerId: string
  ): any[] {
    const sanitizedPlayers: any[] = [];
    
    players.forEach((player, playerId) => {
      const sanitizedPlayer: any = {
        userId: player.userId,
        username: player.username,
        status: player.status,
        score: player.score,
        rank: player.rank,
        questionsAnswered: player.questionsAnswered,
        correctAnswers: player.correctAnswers,
        currentStreak: player.currentStreak,
        bestStreak: player.bestStreak,
        averageResponseTime: player.averageResponseTime,
        isHost: player.isHost,
        canAnswer: player.canAnswer,
        lastActivity: player.lastActivity,
        latency: this.playerLatency.get(playerId)?.averageLatency || 0,
        connectionQuality: this.playerLatency.get(playerId)?.quality || 'fair',
        // Initialize optional fields
        answers: [],
        timeBonuses: 0,
        streakBonuses: 0,
        hintsUsed: 0
      };
      
      // Include additional info for the requesting player
      if (playerId === requestingPlayerId) {
        sanitizedPlayer.answers = Array.from(player.answers?.entries() || []);
        sanitizedPlayer.timeBonuses = player.timeBonuses || 0;
        sanitizedPlayer.streakBonuses = player.streakBonuses || 0;
        sanitizedPlayer.hintsUsed = player.hintsUsed || 0;
      }
      
      sanitizedPlayers.push(sanitizedPlayer);
    });
    
    return sanitizedPlayers;
  }

  /**
   * Sanitize players data for client as Map
   */
  private sanitizePlayersMapForClient(
    players: Map<string, any>, 
    requestingPlayerId: string
  ): Map<string, any> {
    const sanitizedPlayersMap = new Map<string, any>();
    
    players.forEach((player, playerId) => {
      const sanitizedPlayer: any = {
        userId: player.userId,
        username: player.username,
        status: player.status,
        score: player.score,
        rank: player.rank,
        questionsAnswered: player.questionsAnswered,
        correctAnswers: player.correctAnswers,
        currentStreak: player.currentStreak,
        bestStreak: player.bestStreak,
        averageResponseTime: player.averageResponseTime,
        isHost: player.isHost,
        canAnswer: player.canAnswer,
        lastActivity: player.lastActivity,
        latency: this.playerLatency.get(playerId)?.averageLatency || 0,
        connectionQuality: this.playerLatency.get(playerId)?.quality || 'fair',
        // Initialize optional fields
        answers: new Map(),
        timeBonuses: player.timeBonuses || 0,
        streakBonuses: player.streakBonuses || 0,
        hintsUsed: player.hintsUsed || 0
      };
      
      // Include additional info for the requesting player
      if (playerId === requestingPlayerId) {
        sanitizedPlayer.answers = player.answers || new Map();
      }
      
      sanitizedPlayersMap.set(playerId, sanitizedPlayer);
    });
    
    return sanitizedPlayersMap;
  }

  /**
   * Start sync routines
   */
  private startSyncRoutines(): void {
    // Global latency monitoring
    setInterval(() => {
      this.playerLatency.forEach((latencyInfo, playerId) => {
        const timeSinceLastPing = Date.now() - latencyInfo.lastPing.getTime();
        
        // Remove stale entries
        if (timeSinceLastPing > 30000) { // 30 seconds
          this.playerLatency.delete(playerId);
          this.networkCompensation.delete(playerId);
        }
      });
    }, 10000); // Every 10 seconds
  }

  /**
   * Start sync timer for specific game
   */
  private startGameSyncTimer(gameId: string): void {
    const syncTimer = setInterval(() => {
      this.broadcastTimerSync(gameId);
    }, this.SYNC_INTERVAL);
    
    this.syncTimers.set(gameId, syncTimer);
  }

  /**
   * Start state snapshot timer for specific game
   */
  private startStateSnapshotTimer(gameId: string): void {
    const snapshotTimer = setInterval(() => {
      this.createStateSnapshot(gameId);
    }, this.STATE_SNAPSHOT_INTERVAL);
    
    this.syncTimers.set(`${gameId}_snapshot`, snapshotTimer);
  }

  /**
   * Unregister game state and cleanup
   */
  public unregisterGameState(gameId: string): void {
    // Clear timers
    const syncTimer = this.syncTimers.get(gameId);
    if (syncTimer) {
      clearInterval(syncTimer);
      this.syncTimers.delete(gameId);
    }
    
    const snapshotTimer = this.syncTimers.get(`${gameId}_snapshot`);
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
      this.syncTimers.delete(`${gameId}_snapshot`);
    }
    
    // Clear state data
    this.gameStates.delete(gameId);
    this.gameVersions.delete(gameId);
    this.stateSnapshots.delete(gameId);
    
    logger.info('Game state unregistered', { gameId });
    this.emit('state:unregistered', { gameId });
  }

  /**
   * Get all active game states
   */
  public getAllGameStates(): Map<string, GameState> {
    return new Map(this.gameStates);
  }

  /**
   * Get sync statistics
   */
  public getSyncStats(): any {
    return {
      activeGames: this.gameStates.size,
      activeTimers: this.syncTimers.size,
      trackedPlayers: this.playerLatency.size,
      totalSnapshots: Array.from(this.stateSnapshots.values()).reduce((sum, snapshots) => sum + snapshots.length, 0)
    };
  }

  /**
   * Shutdown service and cleanup
   */
  public shutdown(): void {
    // Clear all timers
    this.syncTimers.forEach((timer, key) => {
      clearInterval(timer);
    });
    
    // Clear all data
    this.gameStates.clear();
    this.gameVersions.clear();
    this.playerLatency.clear();
    this.syncTimers.clear();
    this.stateSnapshots.clear();
    this.networkCompensation.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('Game state sync service shutdown completed');
  }
}

