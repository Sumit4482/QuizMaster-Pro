import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  GameState,
  GameStatus,
  GamePlayer,
  GameQuestion,
  LeaderboardEntry,
  AnswerResult,
  QuestionResult,
  GameResult,
  GameConfig,
  TimeSync,
  ConnectionInfo,
  GameError,
  WaitingRoomState,
  LiveGameState,
  GameEndState
} from '@/types/game';

interface GameStore {
  // Core game state
  currentGame: GameState | null;
  gameStatus: GameStatus;
  isInGame: boolean;
  
  // Player state
  currentPlayer: GamePlayer | null;
  isHost: boolean;
  hasAnswered: boolean;
  selectedAnswer: any;
  
  // UI state
  waitingRoom: WaitingRoomState | null;
  liveGame: LiveGameState | null;
  gameEnd: GameEndState | null;
  
  // Question state
  currentQuestion: GameQuestion | null;
  questionStartTime: Date | null;
  timeRemaining: number;
  showQuestionResults: boolean;
  questionResult: QuestionResult | null;
  
  // Scoring and leaderboard
  leaderboard: LeaderboardEntry[];
  myScore: number;
  myRank: number;
  
  // Connection and sync
  timeSync: TimeSync | null;
  connectionInfo: ConnectionInfo | null;
  latency: number;
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
  
  // Actions
  actions: {
    // Game lifecycle
    setGameState: (gameState: GameState) => void;
    clearGame: () => void;
    updateGameStatus: (status: GameStatus) => void;
    
    // Player management
    setCurrentPlayer: (player: GamePlayer) => void;
    updatePlayer: (playerId: string, updates: Partial<GamePlayer>) => void;
    addPlayer: (player: GamePlayer) => void;
    removePlayer: (playerId: string) => void;
    setPlayers: (players: GamePlayer[]) => void;
    
    // Question management
    setCurrentQuestion: (question: GameQuestion) => void;
    clearCurrentQuestion: () => void;
    setQuestionTime: (timeRemaining: number) => void;
    
    // Answer handling
    setSelectedAnswer: (answer: any) => void;
    setHasAnswered: (hasAnswered: boolean) => void;
    processAnswerResult: (result: AnswerResult) => void;
    showQuestionResult: (result: QuestionResult) => void;
    hideQuestionResult: () => void;
    
    // Leaderboard
    updateLeaderboard: (leaderboard: LeaderboardEntry[]) => void;
    updatePlayerScore: (userId: string, score: number, rank: number) => void;
    
    // Game results
    setGameResult: (result: GameResult) => void;
    
    // Connection and timing
    updateTimeSync: (sync: TimeSync) => void;
    updateConnectionInfo: (info: ConnectionInfo) => void;
    setLatency: (latency: number) => void;
    
    // UI states
    setWaitingRoom: (state: WaitingRoomState) => void;
    setLiveGame: (state: LiveGameState) => void;
    setGameEnd: (state: GameEndState) => void;
    
    // Loading and errors
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    
    // Utilities
    reset: () => void;
    getServerTime: () => number;
    isQuestionActive: () => boolean;
    canAnswerQuestion: () => boolean;
    getMyPlayer: () => GamePlayer | null;
    getPlayerById: (playerId: string) => GamePlayer | null;
  };
}

const initialState = {
  // Core game state
  currentGame: null,
  gameStatus: 'WAITING' as GameStatus,
  isInGame: false,
  
  // Player state
  currentPlayer: null,
  isHost: false,
  hasAnswered: false,
  selectedAnswer: null,
  
  // UI state
  waitingRoom: null,
  liveGame: null,
  gameEnd: null,
  
  // Question state
  currentQuestion: null,
  questionStartTime: null,
  timeRemaining: 0,
  showQuestionResults: false,
  questionResult: null,
  
  // Scoring and leaderboard
  leaderboard: [],
  myScore: 0,
  myRank: 0,
  
  // Connection and sync
  timeSync: null,
  connectionInfo: null,
  latency: 0,
  
  // Loading and error states
  isLoading: false,
  error: null,
};

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,
    
    actions: {
      // Game lifecycle
      setGameState: (gameState: GameState) => {
        set({
          currentGame: gameState,
          gameStatus: gameState.status,
          isInGame: true,
          leaderboard: gameState.leaderboard,
          currentQuestion: gameState.currentQuestion || null,
        });
        
        // Update my player info
        const myPlayer = gameState.players.find(p => p.userId === get().currentPlayer?.userId);
        if (myPlayer) {
          set({
            currentPlayer: myPlayer,
            isHost: myPlayer.isHost,
            myScore: myPlayer.score,
            myRank: myPlayer.rank,
          });
        }
      },
      
      clearGame: () => {
        set(initialState);
      },
      
      updateGameStatus: (status: GameStatus) => {
        set({ gameStatus: status });
        
        if (get().currentGame) {
          set({
            currentGame: {
              ...get().currentGame!,
              status
            }
          });
        }
      },
      
      // Player management
      setCurrentPlayer: (player: GamePlayer) => {
        set({
          currentPlayer: player,
          isHost: player.isHost,
          myScore: player.score,
          myRank: player.rank,
        });
      },
      
      updatePlayer: (playerId: string, updates: Partial<GamePlayer>) => {
        const currentGame = get().currentGame;
        if (!currentGame) return;
        
        const updatedPlayers = currentGame.players.map(p => 
          p.userId === playerId ? { ...p, ...updates } : p
        );
        
        set({
          currentGame: {
            ...currentGame,
            players: updatedPlayers
          }
        });
        
        // Update current player if it's me
        if (playerId === get().currentPlayer?.userId) {
          const updatedPlayer = updatedPlayers.find(p => p.userId === playerId);
          if (updatedPlayer) {
            set({
              currentPlayer: updatedPlayer,
              myScore: updatedPlayer.score,
              myRank: updatedPlayer.rank,
            });
          }
        }
      },
      
      addPlayer: (player: GamePlayer) => {
        const currentGame = get().currentGame;
        if (!currentGame) return;
        
        const updatedPlayers = [...currentGame.players, player];
        set({
          currentGame: {
            ...currentGame,
            players: updatedPlayers,
            playerCount: updatedPlayers.length
          }
        });
      },
      
      removePlayer: (playerId: string) => {
        const currentGame = get().currentGame;
        if (!currentGame) return;
        
        const updatedPlayers = currentGame.players.filter(p => p.userId !== playerId);
        set({
          currentGame: {
            ...currentGame,
            players: updatedPlayers,
            playerCount: updatedPlayers.length
          }
        });
      },
      
      setPlayers: (players: GamePlayer[]) => {
        const currentGame = get().currentGame;
        if (!currentGame) return;
        
        set({
          currentGame: {
            ...currentGame,
            players,
            playerCount: players.length
          }
        });
        
        // Update current player if found
        const myPlayer = players.find(p => p.userId === get().currentPlayer?.userId);
        if (myPlayer) {
          set({
            currentPlayer: myPlayer,
            myScore: myPlayer.score,
            myRank: myPlayer.rank,
          });
        }
      },
      
      // Question management
      setCurrentQuestion: (question: GameQuestion) => {
        set({
          currentQuestion: question,
          questionStartTime: new Date(),
          timeRemaining: question.timeLimit,
          hasAnswered: false,
          selectedAnswer: null,
          showQuestionResults: false,
          questionResult: null,
        });
        
        if (get().currentGame) {
          set({
            currentGame: {
              ...get().currentGame!,
              currentQuestion: question,
              currentQuestionIndex: question.questionIndex
            }
          });
        }
      },
      
      clearCurrentQuestion: () => {
        set({
          currentQuestion: null,
          questionStartTime: null,
          timeRemaining: 0,
          hasAnswered: false,
          selectedAnswer: null,
          showQuestionResults: false,
          questionResult: null,
        });
      },
      
      setQuestionTime: (timeRemaining: number) => {
        set({ timeRemaining });
      },
      
      // Answer handling
      setSelectedAnswer: (answer: any) => {
        set({ selectedAnswer: answer });
      },
      
      setHasAnswered: (hasAnswered: boolean) => {
        set({ hasAnswered });
      },
      
      processAnswerResult: (result: AnswerResult) => {
        // Update player score and streak
        const currentPlayer = get().currentPlayer;
        if (currentPlayer) {
          const updatedPlayer = {
            ...currentPlayer,
            score: result.currentScore,
            currentStreak: result.currentStreak,
            questionsAnswered: currentPlayer.questionsAnswered + 1,
            correctAnswers: result.isCorrect 
              ? currentPlayer.correctAnswers + 1 
              : currentPlayer.correctAnswers
          };
          
          set({
            currentPlayer: updatedPlayer,
            myScore: result.currentScore,
            hasAnswered: true,
          });
        }
      },
      
      showQuestionResult: (result: QuestionResult) => {
        set({
          questionResult: result,
          showQuestionResults: true,
        });
      },
      
      hideQuestionResult: () => {
        set({
          showQuestionResults: false,
          questionResult: null,
        });
      },
      
      // Leaderboard
      updateLeaderboard: (leaderboard: LeaderboardEntry[]) => {
        set({ leaderboard });
        
        // Update current game
        if (get().currentGame) {
          set({
            currentGame: {
              ...get().currentGame!,
              leaderboard
            }
          });
        }
        
        // Update my rank
        const myEntry = leaderboard.find(entry => entry.userId === get().currentPlayer?.userId);
        if (myEntry) {
          set({ myRank: myEntry.rank });
        }
      },
      
      updatePlayerScore: (userId: string, score: number, rank: number) => {
        get().actions.updatePlayer(userId, { score, rank });
        
        if (userId === get().currentPlayer?.userId) {
          set({ myScore: score, myRank: rank });
        }
      },
      
      // Game results
      setGameResult: (result: GameResult) => {
        const myEntry = result.finalLeaderboard.find(
          entry => entry.userId === get().currentPlayer?.userId
        );
        
        set({
          gameEnd: {
            finalResults: result,
            playerRank: myEntry?.rank || 0,
            playerScore: myEntry?.score || 0,
            totalPlayers: result.playerCount
          },
          gameStatus: 'FINISHED'
        });
      },
      
      // Connection and timing
      updateTimeSync: (sync: TimeSync) => {
        set({ timeSync: sync });
      },
      
      updateConnectionInfo: (info: ConnectionInfo) => {
        set({ connectionInfo: info, latency: info.latency });
      },
      
      setLatency: (latency: number) => {
        set({ latency });
      },
      
      // UI states
      setWaitingRoom: (state: WaitingRoomState) => {
        set({ waitingRoom: state });
      },
      
      setLiveGame: (state: LiveGameState) => {
        set({ liveGame: state });
      },
      
      setGameEnd: (state: GameEndState) => {
        set({ gameEnd: state });
      },
      
      // Loading and errors
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
      
      setError: (error: string | null) => {
        set({ error });
      },
      
      // Utilities
      reset: () => {
        set(initialState);
      },
      
      getServerTime: () => {
        const sync = get().timeSync;
        if (sync) {
          return Date.now() + sync.offset;
        }
        return Date.now();
      },
      
      isQuestionActive: () => {
        const question = get().currentQuestion;
        const status = get().gameStatus;
        return !!(question && status === 'IN_PROGRESS' && get().timeRemaining > 0);
      },
      
      canAnswerQuestion: () => {
        const player = get().currentPlayer;
        return !!(
          get().actions.isQuestionActive() &&
          player &&
          player.canAnswer &&
          !get().hasAnswered
        );
      },
      
      getMyPlayer: () => {
        return get().currentPlayer;
      },
      
      getPlayerById: (playerId: string) => {
        const game = get().currentGame;
        return game?.players.find(p => p.userId === playerId) ?? null;
      },
    }
  }))
);

// Selectors for common use cases
export const useGameState = () => useGameStore(state => state.currentGame);
export const useGameStatus = () => useGameStore(state => state.gameStatus);
export const useIsInGame = () => useGameStore(state => state.isInGame);
export const useCurrentPlayer = () => useGameStore(state => state.currentPlayer);
export const useIsHost = () => useGameStore(state => state.isHost);
export const useCurrentQuestion = () => useGameStore(state => state.currentQuestion);
export const useHasAnswered = () => useGameStore(state => state.hasAnswered);
export const useTimeRemaining = () => useGameStore(state => state.timeRemaining);
export const useLeaderboard = () => useGameStore(state => state.leaderboard);
export const useMyScore = () => useGameStore(state => state.myScore);
export const useMyRank = () => useGameStore(state => state.myRank);
export const useGameError = () => useGameStore(state => state.error);
export const useIsGameLoading = () => useGameStore(state => state.isLoading);
export const useGameActions = () => useGameStore(state => state.actions);

// Complex selectors
export const useCanAnswerQuestion = () => useGameStore(state => state.actions.canAnswerQuestion());
export const useIsQuestionActive = () => useGameStore(state => state.actions.isQuestionActive());
export const useMyPlayer = () => useGameStore(state => state.actions.getMyPlayer());

// Subscribe to game events
export const subscribeToGameEvents = (callback: (state: GameStore) => void) => {
  return useGameStore.subscribe(callback);
};
