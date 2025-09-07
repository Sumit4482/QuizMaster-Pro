/**
 * Phase 2.3: Game Mode Service
 * Advanced game mode management and orchestration
 */

import { EventEmitter } from 'events';
import { logger } from '@/config/logger';
import {
  GameMode,
  GameModeConfig,
  GameModeStatus,
  GameModeState,
  GameModePlayerState,
  GameModeTeam,
  TournamentBracket,
  TournamentRound,
  TournamentMatch,
  GameModeResults,
  GameModeWinner,
  GameModePlayerResult,
  GameModeTeamResult,
  GameHighlight,
  EliminationReason,
  ClassicModeConfig,
  SpeedRoundModeConfig,
  EliminationModeConfig,
  TeamBattleModeConfig,
  TournamentModeConfig,
  SurvivalModeConfig,
  BlitzModeConfig,
  CustomModeConfig,
  GameModeError,
  GameModeErrorCode,
  GameModeServiceConfig
} from '@/types/gameModes';

export class GameModeService extends EventEmitter {
  private static instance: GameModeService | null = null;
  private config: GameModeServiceConfig;
  
  // Active game mode states
  private gameModeStates: Map<string, GameModeState> = new Map();
  
  // Game mode configurations
  private modeConfigs: Map<GameMode, GameModeConfig> = new Map();
  
  // Custom game mode definitions
  private customModes: Map<string, CustomModeConfig> = new Map();
  
  // Game mode voting sessions
  private votingSessions: Map<string, { votes: Map<string, GameMode>; endTime: Date }> = new Map();

  private constructor(config: GameModeServiceConfig) {
    super();
    this.config = config;
    this.initializeService();
  }

  public static getInstance(config?: GameModeServiceConfig): GameModeService {
    if (!GameModeService.instance) {
      if (!config) {
        throw new Error('GameModeService must be initialized with config');
      }
      GameModeService.instance = new GameModeService(config);
    }
    return GameModeService.instance;
  }

  /**
   * Initialize the game mode service
   */
  private async initializeService(): Promise<void> {
    try {
      // Load default game mode configurations
      this.loadDefaultConfigurations();
      
      // Start mode rotation if enabled
      if (this.config.modeRotation.enabled) {
        this.startModeRotation();
      }
      
      // Start cleanup routines
      this.startCleanupRoutines();
      
      logger.info('GameModeService initialized successfully', {
        enabledModes: this.config.enabledModes,
        modeRotation: this.config.modeRotation.enabled
      });
    } catch (error) {
      logger.error('Failed to initialize GameModeService', { error });
      throw error;
    }
  }

  // ==========================================
  // GAME MODE INITIALIZATION
  // ==========================================

  /**
   * Initialize game mode for a room
   */
  public async initializeGameMode(
    gameId: string,
    roomId: string,
    mode: GameMode,
    config?: Partial<GameModeConfig>,
    playerIds: string[] = []
  ): Promise<GameModeState> {
    try {
      if (!this.config.enabledModes.includes(mode)) {
        throw new GameModeError(
          GameModeErrorCode.MODE_NOT_SUPPORTED,
          `Game mode ${mode} is not supported`
        );
      }

      // Get base configuration
      const baseConfig = this.modeConfigs.get(mode);
      if (!baseConfig) {
        throw new GameModeError(
          GameModeErrorCode.INVALID_MODE,
          `Configuration not found for mode ${mode}`
        );
      }

      // Merge with custom configuration
      const finalConfig = { ...baseConfig, ...config };

      // Validate player count
      if (playerIds.length < finalConfig.minPlayers) {
        throw new GameModeError(
          GameModeErrorCode.INSUFFICIENT_PLAYERS,
          `Minimum ${finalConfig.minPlayers} players required for ${mode}`
        );
      }

      if (playerIds.length > finalConfig.maxPlayers) {
        throw new GameModeError(
          GameModeErrorCode.TOO_MANY_PLAYERS,
          `Maximum ${finalConfig.maxPlayers} players allowed for ${mode}`
        );
      }

      // Initialize player states
      const playerStates = new Map<string, GameModePlayerState>();
      for (const playerId of playerIds) {
        playerStates.set(playerId, {
          userId: playerId,
          status: 'waiting',
          lives: this.getInitialLives(mode, finalConfig),
          rank: 0,
          modeSpecificData: {}
        });
      }

      // Initialize teams if applicable
      let teams: Map<string, GameModeTeam> | undefined;
      if (finalConfig.supportsTeams && mode === GameMode.TEAM_BATTLE) {
        teams = await this.initializeTeams(playerIds, finalConfig as TeamBattleModeConfig);
      }

      // Initialize tournament bracket if applicable
      let bracket: TournamentBracket | undefined;
      if (mode === GameMode.TOURNAMENT) {
        bracket = await this.initializeTournamentBracket(
          playerIds,
          finalConfig as TournamentModeConfig
        );
      }

      // Create game mode state
      const gameModeState: GameModeState = {
        gameId,
        roomId,
        mode,
        config: finalConfig,
        status: GameModeStatus.WAITING,
        currentPhase: 'preparation',
        phaseStartTime: new Date(),
        totalPhases: this.getTotalPhases(mode, finalConfig),
        completedPhases: 0,
        playerStates,
        teams,
        bracket,
        modeSpecificData: this.initializeModeSpecificData(mode, finalConfig),
        statistics: {
          startTime: new Date(),
          totalPlayers: playerIds.length,
          playersEliminated: 0,
          questionsAsked: 0,
          averageResponseTime: 0,
          powerUpsUsed: 0,
          chatMessages: 0,
          spectatorMinutes: 0,
          modeSpecificStats: {}
        }
      };

      // Store the state
      this.gameModeStates.set(gameId, gameModeState);

      // Emit initialization event
      this.emit('game_mode:initialized', gameModeState);

      logger.info('Game mode initialized', {
        gameId,
        roomId,
        mode,
        playerCount: playerIds.length,
        config: finalConfig.name
      });

      return gameModeState;

    } catch (error) {
      logger.error('Failed to initialize game mode', { gameId, roomId, mode, error });
      throw error;
    }
  }

  /**
   * Start game mode
   */
  public async startGameMode(gameId: string): Promise<void> {
    try {
      const state = this.gameModeStates.get(gameId);
      if (!state) {
        throw new GameModeError(GameModeErrorCode.INVALID_MODE, 'Game mode state not found');
      }

      if (state.status !== GameModeStatus.WAITING) {
        throw new GameModeError(
          GameModeErrorCode.GAME_ALREADY_STARTED,
          'Game mode already started or finished'
        );
      }

      // Update status and start first phase
      state.status = GameModeStatus.IN_PROGRESS;
      state.statistics.startTime = new Date();

      // Set all players to active
      for (const [playerId, playerState] of state.playerStates) {
        playerState.status = 'active';
      }

      // Start mode-specific logic
      await this.startModeSpecificLogic(state);

      // Emit start event
      this.emit('game_mode:started', {
        gameId,
        mode: state.mode,
        config: state.config,
        playerCount: state.playerStates.size
      });

      logger.info('Game mode started', {
        gameId,
        mode: state.mode,
        playerCount: state.playerStates.size
      });

    } catch (error) {
      logger.error('Failed to start game mode', { gameId, error });
      throw error;
    }
  }

  // ==========================================
  // GAME MODE SPECIFIC LOGIC
  // ==========================================

  /**
   * Start mode-specific logic
   */
  private async startModeSpecificLogic(state: GameModeState): Promise<void> {
    switch (state.mode) {
      case GameMode.CLASSIC:
        await this.startClassicMode(state);
        break;
      
      case GameMode.SPEED_ROUND:
        await this.startSpeedRoundMode(state);
        break;
      
      case GameMode.ELIMINATION:
        await this.startEliminationMode(state);
        break;
      
      case GameMode.TEAM_BATTLE:
        await this.startTeamBattleMode(state);
        break;
      
      case GameMode.TOURNAMENT:
        await this.startTournamentMode(state);
        break;
      
      case GameMode.SURVIVAL:
        await this.startSurvivalMode(state);
        break;
      
      case GameMode.BLITZ:
        await this.startBlitzMode(state);
        break;
      
      case GameMode.CUSTOM:
        await this.startCustomMode(state);
        break;
    }
  }

  /**
   * Start classic mode
   */
  private async startClassicMode(state: GameModeState): Promise<void> {
    state.currentPhase = 'gameplay';
    state.phaseStartTime = new Date();
    
    // Classic mode is straightforward - just start the quiz
    this.emit('game_mode:phase_changed', state.gameId, 'gameplay', {
      message: 'Quiz started! Answer questions to earn points.',
      showLeaderboard: (state.config as ClassicModeConfig).advanced.showLeaderboardDuringGame
    });
  }

  /**
   * Start speed round mode
   */
  private async startSpeedRoundMode(state: GameModeState): Promise<void> {
    const config = state.config as SpeedRoundModeConfig;
    
    state.currentPhase = 'speed_preparation';
    state.phaseStartTime = new Date();
    
    // Store speed multiplier in mode data
    state.modeSpecificData.speedMultiplier = config.advanced.speedMultiplier;
    state.modeSpecificData.progressiveSpeed = config.advanced.progressiveSpeed;
    
    this.emit('game_mode:phase_changed', state.gameId, 'speed_preparation', {
      message: 'Get ready for speed round! Questions will have reduced time limits.',
      speedMultiplier: config.advanced.speedMultiplier,
      warningThreshold: config.advanced.warningThreshold
    });
    
    // Start actual speed round after preparation
    setTimeout(() => {
      state.currentPhase = 'speed_gameplay';
      this.emit('game_mode:phase_changed', state.gameId, 'speed_gameplay', {
        message: 'Speed round started! Answer quickly!',
        speedBonusActive: true
      });
    }, config.timing.preparationTime * 1000);
  }

  /**
   * Start elimination mode
   */
  private async startEliminationMode(state: GameModeState): Promise<void> {
    const config = state.config as EliminationModeConfig;
    
    state.currentPhase = 'elimination_grace';
    state.phaseStartTime = new Date();
    
    // Store elimination settings
    state.modeSpecificData.eliminationCriteria = config.advanced.eliminationCriteria;
    state.modeSpecificData.playersEliminatedPerRound = config.advanced.playersEliminatedPerRound;
    state.modeSpecificData.gracePeriodQuestions = config.advanced.gracePeriod;
    state.modeSpecificData.questionsAnswered = 0;
    
    this.emit('game_mode:phase_changed', state.gameId, 'elimination_grace', {
      message: `Grace period: ${config.advanced.gracePeriod} questions before elimination begins.`,
      eliminationCriteria: config.advanced.eliminationCriteria,
      playersEliminatedPerRound: config.advanced.playersEliminatedPerRound
    });
  }

  /**
   * Start team battle mode
   */
  private async startTeamBattleMode(state: GameModeState): Promise<void> {
    const config = state.config as TeamBattleModeConfig;
    
    if (!state.teams) {
      throw new GameModeError(
        GameModeErrorCode.TEAM_FORMATION_FAILED,
        'Teams not initialized for team battle mode'
      );
    }
    
    state.currentPhase = 'team_preparation';
    state.phaseStartTime = new Date();
    
    // Allow team members to strategize
    this.emit('game_mode:phase_changed', state.gameId, 'team_preparation', {
      message: 'Team formation complete! Coordinate with your teammates.',
      teams: Array.from(state.teams.values()),
      allowTeamChat: config.advanced.allowTeamChat,
      scoringMethod: config.advanced.scoringMethod
    });
    
    setTimeout(() => {
      state.currentPhase = 'team_battle';
      this.emit('game_mode:phase_changed', state.gameId, 'team_battle', {
        message: 'Team battle begins! Work together to achieve victory.',
        teamLives: config.advanced.teamLives
      });
    }, config.timing.preparationTime * 1000);
  }

  /**
   * Start tournament mode
   */
  private async startTournamentMode(state: GameModeState): Promise<void> {
    const config = state.config as TournamentModeConfig;
    
    if (!state.bracket) {
      throw new GameModeError(
        GameModeErrorCode.BRACKET_GENERATION_FAILED,
        'Tournament bracket not initialized'
      );
    }
    
    state.currentPhase = 'tournament_round_1';
    state.phaseStartTime = new Date();
    
    // Start first round matches
    const firstRound = state.bracket.rounds[0];
    for (const match of firstRound.matches) {
      match.status = 'in_progress';
      match.startTime = new Date();
    }
    
    this.emit('game_mode:bracket_updated', state.gameId, state.bracket);
    this.emit('game_mode:phase_changed', state.gameId, 'tournament_round_1', {
      message: 'Tournament begins! Check your bracket position.',
      bracket: state.bracket,
      currentRound: 1,
      totalRounds: state.bracket.rounds.length
    });
  }

  /**
   * Start survival mode
   */
  private async startSurvivalMode(state: GameModeState): Promise<void> {
    const config = state.config as SurvivalModeConfig;
    
    state.currentPhase = 'survival_round_1';
    state.phaseStartTime = new Date();
    
    // Set initial lives for all players
    for (const playerState of state.playerStates.values()) {
      playerState.lives = config.advanced.livesPerPlayer;
    }
    
    state.modeSpecificData.currentRound = 1;
    state.modeSpecificData.safeRoundsRemaining = config.advanced.safeRounds;
    state.modeSpecificData.eliminationRate = config.advanced.eliminationRate;
    
    this.emit('game_mode:phase_changed', state.gameId, 'survival_round_1', {
      message: `Survival mode begins! You have ${config.advanced.livesPerPlayer} lives.`,
      lives: config.advanced.livesPerPlayer,
      safeRounds: config.advanced.safeRounds,
      eliminationRate: config.advanced.eliminationRate
    });
  }

  /**
   * Start blitz mode
   */
  private async startBlitzMode(state: GameModeState): Promise<void> {
    const config = state.config as BlitzModeConfig;
    
    state.currentPhase = 'blitz_gameplay';
    state.phaseStartTime = new Date();
    
    // Initialize combo tracking for each player
    for (const [playerId, playerState] of state.playerStates) {
      playerState.modeSpecificData.comboCount = 0;
      playerState.modeSpecificData.maxCombo = 0;
      playerState.modeSpecificData.currentMultiplier = 1;
    }
    
    state.modeSpecificData.questionsPerMinute = config.advanced.questionsPerMinute;
    state.modeSpecificData.instantResults = config.advanced.instantResults;
    
    this.emit('game_mode:phase_changed', state.gameId, 'blitz_gameplay', {
      message: 'Blitz mode activated! Rapid-fire questions incoming!',
      questionsPerMinute: config.advanced.questionsPerMinute,
      comboSystem: {
        chainingBonus: config.advanced.chainingBonus,
        comboMultiplier: config.advanced.comboMultiplier,
        maxMultiplier: config.advanced.maxComboMultiplier
      }
    });
  }

  /**
   * Start custom mode
   */
  private async startCustomMode(state: GameModeState): Promise<void> {
    const config = state.config as CustomModeConfig;
    
    state.currentPhase = 'custom_gameplay';
    state.phaseStartTime = new Date();
    
    // Apply custom rules and modifiers
    for (const rule of config.advanced.customRules) {
      await this.applyCustomRule(state, rule);
    }
    
    for (const modifier of config.advanced.modifiers) {
      await this.applyGameModeModifier(state, modifier);
    }
    
    this.emit('game_mode:phase_changed', state.gameId, 'custom_gameplay', {
      message: 'Custom game mode active!',
      customRules: config.advanced.customRules.map(r => ({
        name: r.name,
        description: r.description
      })),
      modifiers: config.advanced.modifiers.map(m => ({
        name: m.name,
        description: m.description
      }))
    });
  }

  // ==========================================
  // GAME MODE EVENTS
  // ==========================================

  /**
   * Handle question answered event
   */
  public async handleQuestionAnswered(
    gameId: string,
    playerId: string,
    questionIndex: number,
    isCorrect: boolean,
    responseTime: number
  ): Promise<void> {
    try {
      const state = this.gameModeStates.get(gameId);
      if (!state) return;

      const playerState = state.playerStates.get(playerId);
      if (!playerState || playerState.status !== 'active') return;

      // Update statistics
      state.statistics.questionsAsked++;
      state.statistics.averageResponseTime = 
        (state.statistics.averageResponseTime + responseTime) / 2;

      // Handle mode-specific logic
      switch (state.mode) {
        case GameMode.ELIMINATION:
          await this.handleEliminationAnswer(state, playerId, isCorrect, responseTime);
          break;
        
        case GameMode.SURVIVAL:
          await this.handleSurvivalAnswer(state, playerId, isCorrect);
          break;
        
        case GameMode.BLITZ:
          await this.handleBlitzAnswer(state, playerId, isCorrect, responseTime);
          break;
        
        case GameMode.TEAM_BATTLE:
          await this.handleTeamBattleAnswer(state, playerId, isCorrect);
          break;
      }

      // Check for phase transitions or game end
      await this.checkPhaseTransition(state);

    } catch (error) {
      logger.error('Failed to handle question answered', { gameId, playerId, error });
    }
  }

  /**
   * Handle elimination mode answer
   */
  private async handleEliminationAnswer(
    state: GameModeState,
    playerId: string,
    isCorrect: boolean,
    responseTime: number
  ): Promise<void> {
    const config = state.config as EliminationModeConfig;
    
    // Increment questions answered
    state.modeSpecificData.questionsAnswered = (state.modeSpecificData.questionsAnswered || 0) + 1;
    
    // Check if grace period is over
    if (state.modeSpecificData.questionsAnswered <= config.advanced.gracePeriod) {
      return; // Still in grace period
    }
    
    // Apply elimination logic
    if (!isCorrect && config.advanced.eliminationCriteria === 'wrong_answer') {
      await this.eliminatePlayer(state, playerId, EliminationReason.WRONG_ANSWER);
    } else if (config.advanced.eliminationCriteria === 'slowest_time') {
      // Store response time for comparison
      const playerState = state.playerStates.get(playerId)!;
      playerState.modeSpecificData.lastResponseTime = responseTime;
      
      // After all players have answered, eliminate the slowest
      await this.checkEliminationBySlowestTime(state);
    }
  }

  /**
   * Handle survival mode answer
   */
  private async handleSurvivalAnswer(
    state: GameModeState,
    playerId: string,
    isCorrect: boolean
  ): Promise<void> {
    const config = state.config as SurvivalModeConfig;
    const playerState = state.playerStates.get(playerId)!;
    
    if (!isCorrect) {
      playerState.lives--;
      
      if (playerState.lives <= 0) {
        await this.eliminatePlayer(state, playerId, EliminationReason.WRONG_ANSWER);
      }
    }
  }

  /**
   * Handle blitz mode answer
   */
  private async handleBlitzAnswer(
    state: GameModeState,
    playerId: string,
    isCorrect: boolean,
    responseTime: number
  ): Promise<void> {
    const config = state.config as BlitzModeConfig;
    const playerState = state.playerStates.get(playerId)!;
    
    if (isCorrect) {
      // Increase combo
      playerState.modeSpecificData.comboCount++;
      playerState.modeSpecificData.maxCombo = Math.max(
        playerState.modeSpecificData.maxCombo,
        playerState.modeSpecificData.comboCount
      );
      
      // Calculate multiplier
      if (config.advanced.chainingBonus) {
        playerState.modeSpecificData.currentMultiplier = Math.min(
          config.advanced.maxComboMultiplier,
          1 + (playerState.modeSpecificData.comboCount * config.advanced.comboMultiplier)
        );
      }
    } else if (config.advanced.resetOnWrong) {
      // Reset combo on wrong answer
      playerState.modeSpecificData.comboCount = 0;
      playerState.modeSpecificData.currentMultiplier = 1;
    }
    
    // Emit combo update
    this.emit('game_mode:player_combo_updated', {
      gameId: state.gameId,
      playerId,
      comboCount: playerState.modeSpecificData.comboCount,
      multiplier: playerState.modeSpecificData.currentMultiplier
    });
  }

  /**
   * Handle team battle answer
   */
  private async handleTeamBattleAnswer(
    state: GameModeState,
    playerId: string,
    isCorrect: boolean
  ): Promise<void> {
    const config = state.config as TeamBattleModeConfig;
    const playerState = state.playerStates.get(playerId)!;
    
    if (!playerState.teamId || !state.teams) return;
    
    const team = state.teams.get(playerState.teamId)!;
    
    // Update team score based on scoring method
    switch (config.advanced.scoringMethod) {
      case 'individual_sum':
        // Scores are summed automatically
        break;
      
      case 'team_average':
        // Calculate average when needed
        break;
      
      case 'best_player':
        // Track best player score per team
        break;
      
      case 'majority_vote':
        // Handle voting logic
        break;
    }
    
    // Update team lives if wrong answer
    if (!isCorrect && config.advanced.teamLives > 0) {
      team.lives--;
      if (team.lives <= 0) {
        // Eliminate entire team
        for (const teamPlayerId of team.playerIds) {
          await this.eliminatePlayer(state, teamPlayerId, EliminationReason.WRONG_ANSWER);
        }
        team.isActive = false;
      }
    }
  }

  // ==========================================
  // ELIMINATION AND SCORING
  // ==========================================

  /**
   * Eliminate player
   */
  private async eliminatePlayer(
    state: GameModeState,
    playerId: string,
    reason: EliminationReason
  ): Promise<void> {
    const playerState = state.playerStates.get(playerId);
    if (!playerState || playerState.status === 'eliminated') return;

    playerState.status = 'eliminated';
    playerState.eliminatedAt = new Date();
    playerState.eliminationReason = reason;
    
    state.statistics.playersEliminated++;

    // Calculate elimination rank
    const remainingPlayers = Array.from(state.playerStates.values())
      .filter(p => p.status === 'active').length;
    playerState.rank = remainingPlayers + 1;

    // Emit elimination event
    this.emit('game_mode:player_eliminated', state.gameId, playerId, reason);

    // Create game highlight
    const highlight: GameHighlight = {
      id: `elimination_${Date.now()}`,
      type: 'elimination',
      timestamp: new Date(),
      playerIds: [playerId],
      description: `Player eliminated: ${reason}`,
      metadata: { reason, rank: playerState.rank }
    };

    state.modeSpecificData.highlights = state.modeSpecificData.highlights || [];
    state.modeSpecificData.highlights.push(highlight);

    logger.info('Player eliminated', {
      gameId: state.gameId,
      playerId,
      reason,
      rank: playerState.rank
    });

    // Check if game should end
    await this.checkGameEnd(state);
  }

  /**
   * Check for game end conditions
   */
  private async checkGameEnd(state: GameModeState): Promise<void> {
    const activePlayers = Array.from(state.playerStates.values())
      .filter(p => p.status === 'active');

    let shouldEnd = false;
    let endReason = '';

    switch (state.mode) {
      case GameMode.ELIMINATION:
        const config = state.config as EliminationModeConfig;
        if (activePlayers.length <= config.advanced.finalShowdownPlayers) {
          shouldEnd = true;
          endReason = 'Final showdown reached';
        }
        break;
      
      case GameMode.SURVIVAL:
        if (activePlayers.length <= 1) {
          shouldEnd = true;
          endReason = 'Last survivor standing';
        }
        break;
      
      case GameMode.TEAM_BATTLE:
        if (state.teams) {
          const activeTeams = Array.from(state.teams.values())
            .filter(t => t.isActive);
          if (activeTeams.length <= 1) {
            shouldEnd = true;
            endReason = 'Only one team remaining';
          }
        }
        break;
    }

    if (shouldEnd) {
      await this.endGameMode(state.gameId, endReason);
    }
  }

  /**
   * End game mode
   */
  public async endGameMode(gameId: string, reason: string = 'Game completed'): Promise<GameModeResults> {
    try {
      const state = this.gameModeStates.get(gameId);
      if (!state) {
        throw new GameModeError(GameModeErrorCode.INVALID_MODE, 'Game mode state not found');
      }

      state.status = GameModeStatus.FINISHED;
      state.statistics.endTime = new Date();

      // Calculate final results
      const results = await this.calculateGameModeResults(state);

      // Emit completion event
      this.emit('game_mode:completed', gameId, results);

      logger.info('Game mode completed', {
        gameId,
        mode: state.mode,
        reason,
        winners: results.winners.length,
        duration: state.statistics.endTime.getTime() - state.statistics.startTime.getTime()
      });

      return results;

    } catch (error) {
      logger.error('Failed to end game mode', { gameId, reason, error });
      throw error;
    }
  }

  /**
   * Calculate game mode results
   */
  private async calculateGameModeResults(state: GameModeState): Promise<GameModeResults> {
    const playerResults: GameModePlayerResult[] = [];
    const teamResults: GameModeTeamResult[] = [];
    const winners: GameModeWinner[] = [];

    // Calculate player results
    for (const [playerId, playerState] of state.playerStates) {
      const result: GameModePlayerResult = {
        userId: playerId,
        finalRank: playerState.rank,
        score: 0, // Would be calculated from actual game scoring
        questionsAnswered: 0, // From game statistics
        correctAnswers: 0, // From game statistics
        averageResponseTime: 0, // From game statistics
        powerUpsUsed: 0, // From power-up service
        eliminated: playerState.status === 'eliminated',
        eliminationRound: playerState.eliminatedAt ? 
          Math.floor((playerState.eliminatedAt.getTime() - state.statistics.startTime.getTime()) / 60000) : 
          undefined,
        achievements: [],
        modeSpecificResults: playerState.modeSpecificData
      };
      
      playerResults.push(result);
    }

    // Sort by rank and identify winners
    playerResults.sort((a, b) => a.finalRank - b.finalRank);
    
    // Top 3 players are winners
    for (let i = 0; i < Math.min(3, playerResults.length); i++) {
      const player = playerResults[i];
      winners.push({
        userId: player.userId,
        username: '', // Would be filled from user data
        rank: player.finalRank,
        score: player.score,
        teamId: state.playerStates.get(player.userId)?.teamId
      });
    }

    // Calculate team results if applicable
    if (state.teams) {
      for (const [teamId, team] of state.teams) {
        const teamPlayerResults = playerResults.filter(p => 
          state.playerStates.get(p.userId)?.teamId === teamId
        );
        
        const teamResult: GameModeTeamResult = {
          teamId,
          teamName: team.name,
          finalRank: 0, // Calculate based on team performance
          totalScore: teamPlayerResults.reduce((sum, p) => sum + p.score, 0),
          averageScore: teamPlayerResults.length > 0 ? 
            teamPlayerResults.reduce((sum, p) => sum + p.score, 0) / teamPlayerResults.length : 0,
          playerCount: team.playerIds.length,
          eliminated: !team.isActive,
          achievements: []
        };
        
        teamResults.push(teamResult);
      }
      
      teamResults.sort((a, b) => b.totalScore - a.totalScore);
      
      // Update team ranks
      teamResults.forEach((team, index) => {
        team.finalRank = index + 1;
      });
    }

    return {
      gameId: state.gameId,
      mode: state.mode,
      winners,
      playerResults,
      teamResults: teamResults.length > 0 ? teamResults : undefined,
      statistics: state.statistics,
      achievements: [], // Would be calculated based on performance
      highlights: state.modeSpecificData.highlights || []
    };
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Load default game mode configurations
   */
  private loadDefaultConfigurations(): void {
    // Classic Mode
    const classicConfig: ClassicModeConfig = {
      mode: GameMode.CLASSIC,
      name: 'Classic Quiz',
      description: 'Traditional quiz gameplay',
      minPlayers: 1,
      maxPlayers: 50,
      supportsSpectators: true,
      supportsPowerUps: true,
      supportsTeams: false,
      estimatedDurationMinutes: 15,
      scoring: {
        basePoints: 100,
        timeBonusEnabled: true,
        streakBonusEnabled: true,
        difficultyMultiplier: true,
        eliminationPenalty: 0,
        perfectGameBonus: 1000
      },
      timing: {
        questionTimeLimit: 30,
        intermissionTime: 5,
        preparationTime: 10,
        finalResultsTime: 30
      },
      flow: {
        allowLatejoin: true,
        allowReconnection: true,
        allowSpectatorPromote: true,
        autoStart: false,
        pauseOnDisconnect: false,
        endOnPlayerCount: null
      },
      advanced: {
        showLeaderboardDuringGame: true,
        allowAnswerChanges: false,
        showCorrectAnswersImmediately: true
      }
    };

    // Add other mode configurations...
    this.modeConfigs.set(GameMode.CLASSIC, classicConfig);

    logger.info('Default game mode configurations loaded', {
      modes: Array.from(this.modeConfigs.keys())
    });
  }

  /**
   * Get initial lives for game mode
   */
  private getInitialLives(mode: GameMode, config: GameModeConfig): number {
    switch (mode) {
      case GameMode.SURVIVAL:
        return (config as SurvivalModeConfig).advanced?.livesPerPlayer || 3;
      case GameMode.ELIMINATION:
        return 1; // Single elimination
      default:
        return 1;
    }
  }

  /**
   * Get total phases for game mode
   */
  private getTotalPhases(mode: GameMode, config: GameModeConfig): number {
    switch (mode) {
      case GameMode.TOURNAMENT:
        const tournamentConfig = config as TournamentModeConfig;
        return Math.ceil(Math.log2(config.maxPlayers)); // Number of tournament rounds
      case GameMode.ELIMINATION:
      case GameMode.SURVIVAL:
        return 10; // Estimated number of rounds
      default:
        return 1;
    }
  }

  /**
   * Initialize mode-specific data
   */
  private initializeModeSpecificData(mode: GameMode, config: GameModeConfig): Record<string, any> {
    const data: Record<string, any> = {
      highlights: []
    };

    switch (mode) {
      case GameMode.ELIMINATION:
        data.questionsAnswered = 0;
        data.eliminationPhaseActive = false;
        break;
      
      case GameMode.SURVIVAL:
        data.currentRound = 1;
        data.safeRoundsRemaining = (config as SurvivalModeConfig).advanced?.safeRounds || 0;
        break;
      
      case GameMode.BLITZ:
        data.questionsPerMinute = (config as BlitzModeConfig).advanced?.questionsPerMinute || 6;
        break;
    }

    return data;
  }

  /**
   * Initialize teams for team battle mode
   */
  private async initializeTeams(
    playerIds: string[],
    config: TeamBattleModeConfig
  ): Promise<Map<string, GameModeTeam>> {
    const teams = new Map<string, GameModeTeam>();
    const teamColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    
    const playersPerTeam = Math.ceil(playerIds.length / config.advanced.teamsCount);
    
    for (let i = 0; i < config.advanced.teamsCount; i++) {
      const teamId = `team_${i + 1}`;
      const startIdx = i * playersPerTeam;
      const endIdx = Math.min(startIdx + playersPerTeam, playerIds.length);
      const teamPlayerIds = playerIds.slice(startIdx, endIdx);
      
      if (teamPlayerIds.length === 0) break;
      
      const team: GameModeTeam = {
        id: teamId,
        name: `Team ${i + 1}`,
        playerIds: teamPlayerIds,
        color: teamColors[i % teamColors.length],
        score: 0,
        lives: config.advanced.teamLives || 3,
        isActive: true,
        modeSpecificData: {}
      };
      
      teams.set(teamId, team);
      
      // Update player states with team assignment
      for (const playerId of teamPlayerIds) {
        const playerState = this.gameModeStates.get('')?.playerStates.get(playerId);
        if (playerState) {
          playerState.teamId = teamId;
        }
      }
    }
    
    return teams;
  }

  /**
   * Initialize tournament bracket
   */
  private async initializeTournamentBracket(
    playerIds: string[],
    config: TournamentModeConfig
  ): Promise<TournamentBracket> {
    const bracket: TournamentBracket = {
      id: `bracket_${Date.now()}`,
      type: config.advanced.bracketType,
      rounds: [],
      currentRound: 0,
      isComplete: false
    };
    
    // Generate bracket rounds (simplified single elimination)
    let currentPlayers = [...playerIds];
    let roundNumber = 1;
    
    while (currentPlayers.length > 1) {
      const matches: TournamentMatch[] = [];
      const nextRoundPlayers: string[] = [];
      
      for (let i = 0; i < currentPlayers.length; i += config.advanced.playersPerMatch) {
        const matchPlayers = currentPlayers.slice(i, i + config.advanced.playersPerMatch);
        
        const match: TournamentMatch = {
          id: `match_${roundNumber}_${matches.length + 1}`,
          roundNumber,
          matchNumber: matches.length + 1,
          playerIds: matchPlayers,
          scores: {},
          status: 'waiting'
        };
        
        matches.push(match);
        // Winner will advance (placeholder)
        if (matchPlayers.length > 0) {
          nextRoundPlayers.push(matchPlayers[0]); // Placeholder winner
        }
      }
      
      const round: TournamentRound = {
        roundNumber,
        matches,
        isComplete: false
      };
      
      bracket.rounds.push(round);
      currentPlayers = nextRoundPlayers;
      roundNumber++;
    }
    
    return bracket;
  }

  /**
   * Apply custom rule
   */
  private async applyCustomRule(state: GameModeState, rule: any): Promise<void> {
    // Implementation would depend on the specific rule type
    logger.info('Applying custom rule', {
      gameId: state.gameId,
      ruleName: rule.name,
      ruleType: rule.type
    });
  }

  /**
   * Apply game mode modifier
   */
  private async applyGameModeModifier(state: GameModeState, modifier: any): Promise<void> {
    // Implementation would depend on the specific modifier
    logger.info('Applying game mode modifier', {
      gameId: state.gameId,
      modifierName: modifier.name,
      modifierType: modifier.type
    });
  }

  /**
   * Check for phase transition
   */
  private async checkPhaseTransition(state: GameModeState): Promise<void> {
    // Mode-specific phase transition logic
    switch (state.mode) {
      case GameMode.ELIMINATION:
        await this.checkEliminationPhaseTransition(state);
        break;
      
      case GameMode.TOURNAMENT:
        await this.checkTournamentPhaseTransition(state);
        break;
    }
  }

  /**
   * Check elimination phase transition
   */
  private async checkEliminationPhaseTransition(state: GameModeState): Promise<void> {
    const config = state.config as EliminationModeConfig;
    
    if (state.currentPhase === 'elimination_grace' && 
        state.modeSpecificData.questionsAnswered >= config.advanced.gracePeriod) {
      state.currentPhase = 'elimination_active';
      state.modeSpecificData.eliminationPhaseActive = true;
      
      this.emit('game_mode:phase_changed', state.gameId, 'elimination_active', {
        message: 'Grace period over! Elimination phase begins.',
        eliminationCriteria: config.advanced.eliminationCriteria
      });
    }
  }

  /**
   * Check tournament phase transition
   */
  private async checkTournamentPhaseTransition(state: GameModeState): Promise<void> {
    if (!state.bracket) return;
    
    const currentRound = state.bracket.rounds[state.bracket.currentRound];
    if (!currentRound) return;
    
    // Check if all matches in current round are complete
    const allMatchesComplete = currentRound.matches.every(match => 
      match.status === 'completed'
    );
    
    if (allMatchesComplete && state.bracket.currentRound < state.bracket.rounds.length - 1) {
      // Advance to next round
      state.bracket.currentRound++;
      state.currentPhase = `tournament_round_${state.bracket.currentRound + 1}`;
      
      this.emit('game_mode:phase_changed', state.gameId, state.currentPhase, {
        message: `Round ${state.bracket.currentRound + 1} begins!`,
        bracket: state.bracket
      });
    } else if (allMatchesComplete) {
      // Tournament complete
      state.bracket.isComplete = true;
      await this.endGameMode(state.gameId, 'Tournament completed');
    }
  }

  /**
   * Check elimination by slowest time
   */
  private async checkEliminationBySlowestTime(state: GameModeState): Promise<void> {
    const config = state.config as EliminationModeConfig;
    
    // Get all active players with response times
    const playersWithTimes = Array.from(state.playerStates.entries())
      .filter(([, playerState]) => 
        playerState.status === 'active' && 
        playerState.modeSpecificData.lastResponseTime !== undefined
      )
      .map(([playerId, playerState]) => ({
        playerId,
        responseTime: playerState.modeSpecificData.lastResponseTime
      }));
    
    if (playersWithTimes.length === 0) return;
    
    // Sort by response time (slowest first)
    playersWithTimes.sort((a, b) => b.responseTime - a.responseTime);
    
    // Eliminate the slowest players
    const playersToEliminate = Math.min(
      config.advanced.playersEliminatedPerRound,
      playersWithTimes.length - 1 // Always keep at least one player
    );
    
    for (let i = 0; i < playersToEliminate; i++) {
      await this.eliminatePlayer(
        state,
        playersWithTimes[i].playerId,
        EliminationReason.TIME_OUT
      );
    }
    
    // Clear response times for next round
    for (const playerState of state.playerStates.values()) {
      delete playerState.modeSpecificData.lastResponseTime;
    }
  }

  /**
   * Start cleanup routines
   */
  private startCleanupRoutines(): void {
    // Clean up finished game mode states every 30 minutes
    setInterval(() => {
      this.cleanupFinishedGameModes();
    }, 1800000);
  }

  /**
   * Clean up finished game mode states
   */
  private cleanupFinishedGameModes(): void {
    const cutoffTime = new Date(Date.now() - 3600000); // 1 hour ago
    
    for (const [gameId, state] of this.gameModeStates) {
      if (state.status === GameModeStatus.FINISHED && 
          state.statistics.endTime && 
          state.statistics.endTime < cutoffTime) {
        this.gameModeStates.delete(gameId);
      }
    }
  }

  /**
   * Start mode rotation
   */
  private startModeRotation(): void {
    const interval = this.config.modeRotation.rotationIntervalMinutes * 60000;
    
    setInterval(() => {
      const currentMode = this.getCurrentRotationMode();
      this.emit('game_mode:rotation_changed', currentMode);
      logger.info('Game mode rotation changed', { currentMode });
    }, interval);
  }

  /**
   * Get current rotation mode
   */
  private getCurrentRotationMode(): GameMode {
    const rotationModes = this.config.modeRotation.rotationModes;
    const index = Math.floor(Date.now() / (this.config.modeRotation.rotationIntervalMinutes * 60000)) % rotationModes.length;
    return rotationModes[index];
  }

  /**
   * Get game mode state
   */
  public getGameModeState(gameId: string): GameModeState | undefined {
    return this.gameModeStates.get(gameId);
  }

  /**
   * Get available game modes
   */
  public getAvailableGameModes(): GameMode[] {
    return this.config.enabledModes;
  }

  /**
   * Get game mode configuration
   */
  public getGameModeConfig(mode: GameMode): GameModeConfig | undefined {
    return this.modeConfigs.get(mode);
  }
}
