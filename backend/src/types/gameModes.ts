/**
 * Phase 2.3: Enhanced Game Modes Types
 * Advanced multiplayer game mode system definitions
 */

// Game mode enums
export enum GameMode {
  CLASSIC = 'CLASSIC',
  SPEED_ROUND = 'SPEED_ROUND',
  ELIMINATION = 'ELIMINATION',
  TEAM_BATTLE = 'TEAM_BATTLE',
  TOURNAMENT = 'TOURNAMENT',
  SURVIVAL = 'SURVIVAL',
  BLITZ = 'BLITZ',
  CUSTOM = 'CUSTOM'
}

export enum GameModeStatus {
  WAITING = 'WAITING',
  STARTING = 'STARTING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
  ABANDONED = 'ABANDONED'
}

export enum EliminationReason {
  WRONG_ANSWER = 'WRONG_ANSWER',
  TIME_OUT = 'TIME_OUT',
  POWER_UP = 'POWER_UP',
  FORFEIT = 'FORFEIT',
  DISCONNECTED = 'DISCONNECTED'
}

// Base game mode configuration
export interface GameModeConfig {
  mode: GameMode;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  supportsSpectators: boolean;
  supportsPowerUps: boolean;
  supportsTeams: boolean;
  estimatedDurationMinutes: number;
  
  // Scoring configuration
  scoring: {
    basePoints: number;
    timeBonusEnabled: boolean;
    streakBonusEnabled: boolean;
    difficultyMultiplier: boolean;
    eliminationPenalty: number;
    perfectGameBonus: number;
  };
  
  // Timing configuration
  timing: {
    questionTimeLimit: number;
    intermissionTime: number;
    preparationTime: number;
    finalResultsTime: number;
  };
  
  // Game flow configuration
  flow: {
    allowLatejoin: boolean;
    allowReconnection: boolean;
    allowSpectatorPromote: boolean;
    autoStart: boolean;
    pauseOnDisconnect: boolean;
    endOnPlayerCount: number | null; // End when this many players remain
  };
  
  // Advanced settings
  advanced: Record<string, any>;
}

// Classic Mode (standard multiplayer quiz)
export interface ClassicModeConfig extends GameModeConfig {
  mode: GameMode.CLASSIC;
  advanced: {
    showLeaderboardDuringGame: boolean;
    allowAnswerChanges: boolean;
    showCorrectAnswersImmediately: boolean;
  };
}

// Speed Round Mode (reduced time limits)
export interface SpeedRoundModeConfig extends GameModeConfig {
  mode: GameMode.SPEED_ROUND;
  advanced: {
    speedMultiplier: number; // 0.5 = half time, 2.0 = double time
    progressiveSpeed: boolean; // Questions get faster
    speedBonusMultiplier: number;
    warningThreshold: number; // Warn when this much time remains
  };
}

// Elimination Mode (last player standing)
export interface EliminationModeConfig extends GameModeConfig {
  mode: GameMode.ELIMINATION;
  advanced: {
    eliminationCriteria: 'wrong_answer' | 'slowest_time' | 'lowest_score';
    playersEliminatedPerRound: number;
    gracePeriod: number; // Questions before elimination starts
    finalShowdownPlayers: number; // Players for final round
    allowRevive: boolean; // Power-ups can revive eliminated players
  };
}

// Team Battle Mode (collaborative gameplay)
export interface TeamBattleModeConfig extends GameModeConfig {
  mode: GameMode.TEAM_BATTLE;
  advanced: {
    teamsCount: number;
    teamSize: number;
    teamFormation: 'random' | 'manual' | 'balanced';
    scoringMethod: 'individual_sum' | 'team_average' | 'best_player' | 'majority_vote';
    allowTeamChat: boolean;
    allowTeamPowerUps: boolean;
    teamLives: number; // Team elimination threshold
  };
}

// Tournament Mode (bracket-style competition)
export interface TournamentModeConfig extends GameModeConfig {
  mode: GameMode.TOURNAMENT;
  advanced: {
    bracketType: 'single_elimination' | 'double_elimination' | 'round_robin';
    roundDuration: number;
    playersPerMatch: number;
    advancementCount: number; // Players who advance each round
    seedingMethod: 'random' | 'performance' | 'manual';
    consolationBracket: boolean;
  };
}

// Survival Mode (continuous elimination)
export interface SurvivalModeConfig extends GameModeConfig {
  mode: GameMode.SURVIVAL;
  advanced: {
    livesPerPlayer: number;
    difficultyProgression: 'linear' | 'exponential' | 'random';
    eliminationRate: number; // Percentage eliminated per round
    safeRounds: number; // Rounds without elimination
    bossRounds: string[]; // Special difficulty spikes
  };
}

// Blitz Mode (rapid-fire questions)
export interface BlitzModeConfig extends GameModeConfig {
  mode: GameMode.BLITZ;
  advanced: {
    questionsPerMinute: number;
    instantResults: boolean;
    chainingBonus: boolean; // Bonus for consecutive correct answers
    comboMultiplier: number;
    maxComboMultiplier: number;
    resetOnWrong: boolean;
  };
}

// Custom Mode (user-configurable)
export interface CustomModeConfig extends GameModeConfig {
  mode: GameMode.CUSTOM;
  advanced: {
    customRules: CustomGameRule[];
    baseGameMode: GameMode;
    modifiers: GameModeModifier[];
    specialConditions: SpecialCondition[];
  };
}

// Custom game rules
export interface CustomGameRule {
  id: string;
  name: string;
  description: string;
  type: 'scoring' | 'timing' | 'elimination' | 'power_up' | 'social';
  parameters: Record<string, any>;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export interface RuleCondition {
  type: 'player_count' | 'question_index' | 'score_threshold' | 'time_remaining' | 'elimination_count';
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=';
  value: number | string | boolean;
}

export interface RuleAction {
  type: 'modify_score' | 'change_time' | 'eliminate_player' | 'grant_power_up' | 'send_message';
  parameters: Record<string, any>;
}

// Game mode modifiers
export interface GameModeModifier {
  id: string;
  name: string;
  description: string;
  type: 'difficulty' | 'scoring' | 'timing' | 'visual' | 'social';
  effects: ModifierEffect[];
  stackable: boolean;
  maxStack: number;
}

export interface ModifierEffect {
  target: 'all_players' | 'individual' | 'team' | 'game_state';
  property: string;
  operation: 'multiply' | 'add' | 'subtract' | 'set' | 'toggle';
  value: number | string | boolean;
  condition?: RuleCondition;
}

// Special conditions for advanced game modes
export interface SpecialCondition {
  id: string;
  name: string;
  type: 'sudden_death' | 'boss_round' | 'power_up_rain' | 'double_or_nothing' | 'mystery_box';
  triggerConditions: RuleCondition[];
  effects: SpecialConditionEffect[];
  duration?: number;
  isOneTime: boolean;
}

export interface SpecialConditionEffect {
  type: 'modify_gameplay' | 'visual_effect' | 'audio_effect' | 'ui_change';
  parameters: Record<string, any>;
  affectedPlayers: 'all' | 'specific' | 'random';
  playerIds?: string[];
}

// Runtime game mode state
export interface GameModeState {
  gameId: string;
  roomId: string;
  mode: GameMode;
  config: GameModeConfig;
  status: GameModeStatus;
  
  // Current phase information
  currentPhase: string;
  phaseStartTime: Date;
  phaseEndTime?: Date;
  phaseData: Record<string, any>;
  
  // Game progression
  totalPhases: number;
  completedPhases: number;
  
  // Player states specific to game mode
  playerStates: Map<string, GameModePlayerState>;
  
  // Team information (for team-based modes)
  teams?: Map<string, GameModeTeam>;
  
  // Tournament bracket (for tournament mode)
  bracket?: TournamentBracket;
  
  // Mode-specific data
  modeSpecificData: Record<string, any>;
  
  // Statistics
  statistics: GameModeStatistics;
}

export interface GameModePlayerState {
  userId: string;
  status: 'active' | 'eliminated' | 'waiting' | 'spectating';
  eliminatedAt?: Date;
  eliminationReason?: EliminationReason;
  lives: number;
  teamId?: string;
  rank: number;
  modeSpecificData: Record<string, any>;
}

export interface GameModeTeam {
  id: string;
  name: string;
  playerIds: string[];
  color: string;
  score: number;
  lives: number;
  captain?: string;
  isActive: boolean;
  modeSpecificData: Record<string, any>;
}

export interface TournamentBracket {
  id: string;
  type: 'single_elimination' | 'double_elimination' | 'round_robin';
  rounds: TournamentRound[];
  currentRound: number;
  isComplete: boolean;
  winner?: string;
}

export interface TournamentRound {
  roundNumber: number;
  matches: TournamentMatch[];
  isComplete: boolean;
  startTime?: Date;
  endTime?: Date;
}

export interface TournamentMatch {
  id: string;
  roundNumber: number;
  matchNumber: number;
  playerIds: string[];
  winner?: string;
  scores: Record<string, number>;
  status: 'waiting' | 'in_progress' | 'completed';
  startTime?: Date;
  endTime?: Date;
}

// Statistics for game modes
export interface GameModeStatistics {
  startTime: Date;
  endTime?: Date;
  totalPlayers: number;
  playersEliminated: number;
  questionsAsked: number;
  averageResponseTime: number;
  powerUpsUsed: number;
  chatMessages: number;
  spectatorMinutes: number;
  modeSpecificStats: Record<string, any>;
}

// Game mode service configuration
export interface GameModeServiceConfig {
  enabledModes: GameMode[];
  defaultConfigs: Record<GameMode, GameModeConfig>;
  customModeLimit: number;
  allowModeVoting: boolean;
  modeRotation: {
    enabled: boolean;
    rotationModes: GameMode[];
    rotationIntervalMinutes: number;
  };
}

// Socket events for game modes
export interface GameModeSocketEvents {
  'game_mode:start': (config: GameModeConfig) => void;
  'game_mode:phase_changed': (gameId: string, phase: string, data: any) => void;
  'game_mode:player_eliminated': (gameId: string, userId: string, reason: EliminationReason) => void;
  'game_mode:team_formed': (gameId: string, team: GameModeTeam) => void;
  'game_mode:bracket_updated': (gameId: string, bracket: TournamentBracket) => void;
  'game_mode:special_condition': (gameId: string, condition: SpecialCondition) => void;
  'game_mode:completed': (gameId: string, results: GameModeResults) => void;
}

// Results for different game modes
export interface GameModeResults {
  gameId: string;
  mode: GameMode;
  winners: GameModeWinner[];
  playerResults: GameModePlayerResult[];
  teamResults?: GameModeTeamResult[];
  statistics: GameModeStatistics;
  achievements: string[]; // Achievement IDs earned
  highlights: GameHighlight[];
}

export interface GameModeWinner {
  userId: string;
  username: string;
  rank: number;
  score: number;
  teamId?: string;
  special?: string; // 'mvp', 'comeback_king', etc.
}

export interface GameModePlayerResult {
  userId: string;
  finalRank: number;
  score: number;
  questionsAnswered: number;
  correctAnswers: number;
  averageResponseTime: number;
  powerUpsUsed: number;
  eliminated: boolean;
  eliminationRound?: number;
  achievements: string[];
  modeSpecificResults: Record<string, any>;
}

export interface GameModeTeamResult {
  teamId: string;
  teamName: string;
  finalRank: number;
  totalScore: number;
  averageScore: number;
  playerCount: number;
  eliminated: boolean;
  achievements: string[];
}

export interface GameHighlight {
  id: string;
  type: 'elimination' | 'comeback' | 'perfect_round' | 'power_up_combo' | 'clutch_answer';
  timestamp: Date;
  playerIds: string[];
  description: string;
  metadata: Record<string, any>;
}

// Game mode errors
export class GameModeError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'GameModeError';
  }
}

export enum GameModeErrorCode {
  INVALID_MODE = 'INVALID_MODE',
  MODE_NOT_SUPPORTED = 'MODE_NOT_SUPPORTED',
  INSUFFICIENT_PLAYERS = 'INSUFFICIENT_PLAYERS',
  TOO_MANY_PLAYERS = 'TOO_MANY_PLAYERS',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  GAME_ALREADY_STARTED = 'GAME_ALREADY_STARTED',
  INVALID_PHASE_TRANSITION = 'INVALID_PHASE_TRANSITION',
  PLAYER_ALREADY_ELIMINATED = 'PLAYER_ALREADY_ELIMINATED',
  TEAM_FORMATION_FAILED = 'TEAM_FORMATION_FAILED',
  BRACKET_GENERATION_FAILED = 'BRACKET_GENERATION_FAILED',
  CUSTOM_RULE_ERROR = 'CUSTOM_RULE_ERROR',
  MODE_TIMEOUT = 'MODE_TIMEOUT'
}
