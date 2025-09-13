import { useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useSocket } from './useSocketSingleton';
import { useAuth } from './useAuth';
import { useGameStore, useGameActions } from '@/stores/gameStore';
import {
  GameState,
  GameStatus,
  GameQuestion,
  GameEvent,
  GameResponse,
  StartGamePayload,
  JoinGamePayload,
  AnswerSubmissionPayload,
  PlayerReadyPayload,
  HostActionPayload,
  HostAction,
  GameConfig,
  AnswerResult,
  QuestionResult,
  GameResult,
  GamePlayer,
  PlayerStatus,
  LeaderboardEntry,
  TimeSync
} from '@/types/game';
import toast from 'react-hot-toast';

export interface UseGameResult {
  // Game state
  gameState: GameState | null;
  isInGame: boolean;
  isHost: boolean;
  currentPlayer: any;
  
  // Game actions
  startGame: (config: Partial<GameConfig>, roomId?: string) => Promise<void>;
  joinGame: (roomId: string) => Promise<void>;
  leaveGame: (roomId: string) => Promise<void>;
  submitAnswer: (questionId: string, questionIndex: number, answer: any, timeTaken: number) => Promise<void>;
  setPlayerReady: (roomId: string, isReady: boolean) => Promise<void>;
  
  // Host actions
  skipQuestion: (roomId: string) => Promise<void>;
  pauseGame: (roomId: string) => Promise<void>;
  resumeGame: (roomId: string) => Promise<void>;
  extendTime: (roomId: string, seconds: number) => Promise<void>;
  endGame: (roomId: string) => Promise<void>;
  
  // Utilities
  syncTime: () => Promise<void>;
  ping: () => Promise<void>;
  getGameState: (roomId: string) => Promise<void>;
  
  // State
  isLoading: boolean;
  error: string | null;
}

export function useGame(): UseGameResult {
  const { socket, connectionStatus } = useSocket();
  const { user } = useAuth();
  const gameStore = useGameStore();
  const gameActions = useGameActions();
  
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const questionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Question timer with reduced update frequency
  const startQuestionTimer = useCallback((duration: number) => {
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
    }
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    questionTimerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      
      gameActions.setQuestionTime(remaining);
      
      if (remaining <= 0) {
        if (questionTimerRef.current) {
          clearInterval(questionTimerRef.current);
          questionTimerRef.current = null;
        }
      }
    }, 500); // Update every 500ms for performance
  }, [gameActions]);

  // Event handlers (defined before setupGameEventListeners to avoid hoisting issues)
  const handleGameStarted = useCallback((data: any) => {
    console.log('🎮 Game started event received:', data);
    
    try {
      // Extract game state from the event data
      const { gameState, gameId, roomId, questionCount } = data;
      
      console.log('📊 Extracted data:', {
        hasGameState: !!gameState,
        gameId,
        roomId,
        questionCount,
        gameStateKeys: gameState ? Object.keys(gameState) : []
      });
      
      if (!gameState) {
        console.error('❌ No game state provided in game_started event');
        toast.error('Failed to start game - missing game data');
        return;
      }

      // Process players data from the event
      const playersMap = new Map();
      if (gameState.players && typeof gameState.players === 'object') {
        // Handle both Map and object formats
        const playersData = gameState.players instanceof Map ? 
          gameState.players : 
          new Map(Object.entries(gameState.players));
          
        playersData.forEach((player: any, playerId: string) => {
          playersMap.set(playerId, {
            id: playerId,
            userId: playerId,
            username: player.username || player.name || 'Unknown',
            role: player.role || 'PLAYER',
            status: player.status || 'ACTIVE',
            joinedAt: player.joinedAt ? new Date(player.joinedAt) : new Date(),
            isHost: player.isHost || false,
            isReady: player.isReady || false,
            score: player.score || 0,
            answers: player.answers || []
          });
        });
      }

      // Create the complete game object for the store
      const completeGameState = {
        gameId: gameState.id, // Use 'gameId' to match GameState interface
        roomId: gameState.roomId,
        status: 'STARTING' as GameStatus, // Always start with STARTING status on frontend
        startedAt: new Date(gameState.startedAt),
        currentQuestionIndex: gameState.currentQuestionIndex || -1,
        totalQuestions: gameState.questionCount || questionCount || 0,
        // currentQuestion will be set when first question starts
        players: Array.from(playersMap.values()), // Convert Map to array for frontend GameState
        playerCount: playersMap.size,
        playersReady: 0,
        leaderboard: gameState.leaderboard || [],
        masterTimer: {
          timeRemaining: 0,
          duration: 0,
          isRunning: false,
          isPaused: false,
          serverTime: Date.now(),
          warnings: []
        },
        config: {
          totalQuestions: gameState.questionCount || questionCount || 10,
          categories: gameState.categories || [],
          difficultyLevels: gameState.difficultyLevels || [1, 2, 3],
          questionTypes: gameState.questionTypes || ['MULTIPLE_CHOICE'],
          timePerQuestion: gameState.timePerQuestion || 30,
          shuffleQuestions: gameState.shuffleQuestions || true,
          shuffleAnswers: gameState.shuffleAnswers || true,
          showExplanations: gameState.showExplanations || gameState.includeExplanations || true,
          allowHints: gameState.allowHints || false,
          pointsPerQuestion: gameState.pointsPerQuestion || 100,
          timeBonusEnabled: gameState.timeBonusEnabled || false,
          streakBonusEnabled: gameState.streakBonusEnabled || false
        },
        settings: {
          hostCanSkip: true,
          hostCanPause: true,
          hostCanExtendTime: true,
          showLiveScores: true,
          showAnswerBreakdown: true,
          allowLateJoining: false,
          allowReconnection: true,
          allowSpectators: false,
          questionBreakDuration: 3000,
          gracePeriodsMs: 2000
        },
        createdAt: new Date(gameState.createdAt || Date.now()),
        updatedAt: new Date(gameState.updatedAt || Date.now()),
        version: gameState.version || 1
      };

      // Set the current game in the store
      gameActions.setGameState(completeGameState);
      
      // Set current player if not already set
      if (user && !gameStore.currentPlayer) {
        const currentPlayer = playersMap.get(user.id);
        if (currentPlayer) {
          gameActions.setCurrentPlayer(currentPlayer);
        }
      }
      
      console.log('✅ Game state initialized successfully:', {
        gameId: completeGameState.gameId,
        roomId: completeGameState.roomId,
        questionCount: completeGameState.totalQuestions,
        playerCount: completeGameState.playerCount,
        status: completeGameState.status
      });
      
      console.log('⏰ Game will wait for first question to start...');
      toast.success('Game started! Waiting for questions...');
      
    } catch (error) {
      console.error('❌ Error handling game started event:', error);
      toast.error('Failed to start game - internal error');
    }
  }, [gameActions, gameStore.currentPlayer, user]);
  
  const handleGamePlayerJoined = useCallback((data: any) => {
    console.log('Player joined game:', data.player);
    
    const player: GamePlayer = {
      ...data.player,
      joinedAt: new Date(data.player.joinedAt)
    };
    
    gameActions.addPlayer(player);
    toast.success(`${player.username} joined the game!`);
  }, [gameActions]);
  
  const handleGamePlayerLeft = useCallback((data: any) => {
    console.log('Player left game:', data);
    
    gameActions.removePlayer(data.userId);
    toast.error(`${data.username} left the game`);
  }, [gameActions]);
  
  const handlePlayerReadyChanged = useCallback((data: any) => {
    console.log('Player ready status changed:', data);
    
    gameActions.updatePlayer(data.userId, { 
      status: data.isReady ? 'READY' : 'WAITING' as PlayerStatus
    });
    
    const message = data.isReady ? 'is ready!' : 'is not ready';
    toast.success(`${data.username} ${message}`);
  }, [gameActions]);
  
  const handleQuestionStarted = useCallback((data: any) => {
    console.log('🎯 Question started event received:', data);
    
    // Only process if we don't already have this question to prevent duplicates
    if (gameStore.currentQuestion?.id === data.questionData?.id) {
      console.log('⏭️ Skipping duplicate question start event');
      return;
    }
    
    const question: GameQuestion = {
      ...data.questionData,
      answeredCount: 0,
      totalPlayers: gameStore.currentGame?.playerCount || 1
    };
    
    gameActions.setCurrentQuestion(question);
    gameActions.updateGameStatus('IN_PROGRESS');
    
    // Reset answer state for new question
    gameActions.setHasAnswered(false);
    
    // Start question timer
    const timeLimit = data.timeLimit || 30;
    startQuestionTimer(timeLimit * 1000);
    
    console.log('✅ Question started from game event, timer started');
    toast.success(`Question ${(data.questionIndex || 0) + 1} started!`);
  }, [gameActions, gameStore.currentGame, gameStore.currentQuestion, startQuestionTimer]);
  
  const handleQuestionEnded = useCallback((data: QuestionResult) => {
    console.log('Question ended:', data);
    
    // Clear question timer
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }
    
    gameActions.showQuestionResult(data);
    gameActions.updateGameStatus('QUESTION_BREAK');
    
    toast.success('Question ended! Reviewing results...');
  }, [gameActions]);
  
  const handlePlayerAnswered = useCallback((data: any) => {
    console.log('Player answered:', data);
    
    // Update the current question's answered count
    if (gameStore.currentQuestion) {
      const updatedQuestion = {
        ...gameStore.currentQuestion,
        answeredCount: data.answeredCount || gameStore.currentQuestion.answeredCount + 1,
        totalPlayers: data.totalPlayers || gameStore.currentQuestion.totalPlayers
      };
      gameActions.setCurrentQuestion(updatedQuestion);
    }
    
    // Update leaderboard if provided in the data
    if (data.leaderboard && Array.isArray(data.leaderboard)) {
      console.log('📊 Updating leaderboard from player_answered:', data.leaderboard);
      gameActions.updateLeaderboard(data.leaderboard);
    }
    
    toast.success(`${data.username} answered!`);
  }, [gameActions, gameStore.currentQuestion]);
  
  const handleLeaderboardUpdated = useCallback((data: { leaderboard: LeaderboardEntry[] }) => {
    console.log('Leaderboard updated:', data.leaderboard);
    
    gameActions.updateLeaderboard(data.leaderboard);
  }, [gameActions]);
  
  const handleTimeExtended = useCallback((data: any) => {
    console.log('Time extended:', data);
    
    // Extend the current question timer
    const additionalTime = data.seconds * 1000;
    const currentRemaining = gameStore.timeRemaining || 0;
    gameActions.setQuestionTime(currentRemaining + additionalTime);
    
    toast.success(`Time extended by ${data.seconds} seconds!`);
  }, [gameActions, gameStore.timeRemaining]);
  
  const handleGameEnded = useCallback((data: { reason: string; results: GameResult }) => {
    console.log('Game ended:', data);
    
    // Clear all timers
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    
    gameActions.setGameResult(data.results);
    gameActions.updateGameStatus('FINISHED');
    
    const reasonText = data.reason === 'completed' ? 'Game completed!' : `Game ended: ${data.reason}`;
    toast.success(reasonText);
  }, [gameActions]);
  
  const handleHostChanged = useCallback((data: any) => {
    console.log('Host changed:', data);
    
    // Update player roles
    gameActions.updatePlayer(data.previousHost, { isHost: false });
    gameActions.updatePlayer(data.newHost, { isHost: true });
    
    toast.success(`${data.newHostName} is now the host!`);
  }, [gameActions]);
  
  const handlePlayerDisconnected = useCallback((data: any) => {
    console.log('Player disconnected:', data);
    
    gameActions.updatePlayer(data.userId, { status: 'DISCONNECTED' });
    
    toast.error(`${data.username} disconnected`);
  }, [gameActions]);
  
  const handleTimerStarted = useCallback((data: any) => {
    console.log('⏰ Timer started:', data);
    // Update game timer state if needed
    // This is mainly for logging and debugging
  }, []);
  
  const handleTimerWarning = useCallback((data: any) => {
    console.log('⚠️ Timer warning:', data);
    // Optional: Show visual warning when time is running low
    // This is mainly for logging and debugging
  }, []);
  
  const handleTimerCompleted = useCallback((data: any) => {
    console.log('⏰ Timer completed:', data);
    // Clear any timer-related state
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }
  }, []);
  
  const handleScoreUpdate = useCallback((data: any) => {
    console.log('🔢 Score update received:', data);
    
    // Handle direct score update from RealtimeScoringService
    if (data.playerId && data.newTotalScore !== undefined) {
      console.log('📈 Direct score update:', {
        playerId: data.playerId,
        scoreChange: data.scoreChange,
        newScore: data.newTotalScore,
        rank: data.rank
      });
      
      gameActions.updatePlayerScore(data.playerId, data.newTotalScore, data.rank || 0);
      
      // If this is the current player, update their score
      if (data.playerId === gameStore.currentPlayer?.userId) {
        gameActions.updatePlayerScore(data.playerId, data.newTotalScore, data.rank || 0);
      }
      return;
    }
    
    // Handle legacy score update format
    if (data.userId && data.newScore !== undefined) {
      gameActions.updatePlayerScore(data.userId, data.newScore, data.newRank || 0);
      
      if (data.userId === gameStore.currentPlayer?.userId) {
        gameActions.updatePlayerScore(data.userId, data.newScore, data.newRank || 0);
      }
      return;
    }
    
    // Update answered count if provided
    if (data.answeredCount !== undefined && 
        gameStore.currentQuestion &&
        data.answeredCount !== gameStore.currentQuestion.answeredCount) {
      const updatedQuestion = {
        ...gameStore.currentQuestion,
        answeredCount: data.answeredCount,
        totalPlayers: data.totalPlayers || gameStore.currentQuestion.totalPlayers
      };
      gameActions.setCurrentQuestion(updatedQuestion);
    }
    
    // Update leaderboard if provided
    if (data.leaderboard && Array.isArray(data.leaderboard)) {
      console.log('📊 Updating leaderboard from score_update:', data.leaderboard);
      gameActions.updateLeaderboard(data.leaderboard);
    }
    
    // Update individual player scores if provided
    if (data.playerScores && Array.isArray(data.playerScores)) {
      data.playerScores.forEach((playerScore: any) => {
        if (playerScore.userId && playerScore.score !== undefined) {
          gameActions.updatePlayerScore(playerScore.userId, playerScore.score, playerScore.rank || 0);
        }
      });
    }
    
    // Update current player score if provided
    if (data.userId && data.score !== undefined && gameStore.currentPlayer) {
      if (data.userId === gameStore.currentPlayer.userId) {
        gameActions.updatePlayerScore(data.userId, data.score, data.rank || 0);
      }
    }
  }, [gameActions, gameStore.currentQuestion, gameStore.currentPlayer]);

  // Handle question broadcast (requires acknowledgment)
  const handleQuestionBroadcast = useCallback((data: any, acknowledgment: (response: any) => void) => {
    console.log('📨 Question broadcast received:', data);
    
    try {
      // Process the question immediately
      if (data.questionData) {
        const question: GameQuestion = {
          ...data.questionData,
          answeredCount: 0,
          totalPlayers: gameStore.currentGame?.playerCount || 1
        };
        
        console.log('📝 Setting question from broadcast:', question);
        gameActions.setCurrentQuestion(question);
        gameActions.updateGameStatus('IN_PROGRESS');
        
        // Reset answer state for new question
        gameActions.setHasAnswered(false);
        
        // Start question timer
        const timeLimit = data.timeLimit || 30;
        startQuestionTimer(timeLimit * 1000);
        
        console.log('✅ Question processed, timer started');
        toast.success(`Question ${(data.questionIndex || 0) + 1} started!`);
      }
      
      // Send acknowledgment back to server
      if (acknowledgment) {
        acknowledgment({ 
          status: 'received',
          questionId: data.questionData?.id,
          userId: user?.id,
          timestamp: new Date().toISOString()
        });
        console.log('📨 Question acknowledgment sent');
      }
      
    } catch (error) {
      console.error('❌ Error processing question broadcast:', error);
      
      // Send error acknowledgment
      if (acknowledgment) {
        acknowledgment({ 
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          userId: user?.id,
          timestamp: new Date().toISOString()
        });
      }
    }
  }, [gameActions, gameStore.currentGame, user, startQuestionTimer]);

  const handleAnswerAcknowledged = useCallback((data: AnswerResult) => {
    console.log('Answer acknowledged:', data);
    
    // Update player answer state
    if (data.isCorrect !== undefined) {
      gameActions.setHasAnswered(true);
      const message = data.isCorrect ? 'Correct answer!' : 'Incorrect answer';
      toast.success(message);
    }
    
    // Update score if provided
    if (data.currentScore !== undefined && user) {
      gameActions.updatePlayer(user.id, { score: data.currentScore });
    }
  }, [gameActions, user]);
  
  const handlePlayerJoined = useCallback((data: any) => {
    console.log('User joined room:', data);
    // Handle room-level user joins that might affect games
    // This is different from handleGamePlayerJoined which is game-specific
  }, []);
  
  const handlePlayerLeft = useCallback((data: any) => {
    console.log('User left room:', data);
    // Handle room-level user leaves that might affect games
    // This is different from handleGamePlayerLeft which is game-specific
  }, []);

  // Handle game events from server
  const handleGameEvent = useCallback((event: GameEvent) => {
    console.log('Game event received:', event.type, event.data);
    
    switch (event.type) {
      case 'game_started':
        handleGameStarted(event.data);
        break;
        
      case 'player_joined':
        handleGamePlayerJoined(event.data);
        break;
        
      case 'player_left':
        handleGamePlayerLeft(event.data);
        break;
        
      case 'player_ready_changed':
        handlePlayerReadyChanged(event.data);
        break;
        
      case 'question_started':
        handleQuestionStarted(event.data);
        break;
        
      case 'question_ended':
        handleQuestionEnded(event.data);
        break;
        
      case 'question_end':
        handleQuestionEnded(event.data);
        break;
        
      case 'player_answered':
        handlePlayerAnswered(event.data);
        break;
        
      case 'leaderboard_updated':
        handleLeaderboardUpdated(event.data);
        break;
        
      case 'leaderboard_update':
        handleLeaderboardUpdated(event.data);
        break;
        
      case 'time_extended':
        handleTimeExtended(event.data);
        break;
        
      case 'game_ended':
        handleGameEnded(event.data);
        break;
        
      case 'host_changed':
        handleHostChanged(event.data);
        break;
        
      case 'player_disconnected':
        handlePlayerDisconnected(event.data);
        break;
        
      case 'timer_started':
        handleTimerStarted(event.data);
        break;
        
      case 'timer_warning':
        handleTimerWarning(event.data);
        break;
        
      case 'timer_completed':
        handleTimerCompleted(event.data);
        break;
        
      case 'score_update':
        handleScoreUpdate(event.data);
        break;
        
      default:
        console.warn('Unknown game event type:', event.type);
    }
  }, [
    handleGameStarted,
    handleGamePlayerJoined, 
    handleGamePlayerLeft,
    handlePlayerReadyChanged,
    handleQuestionStarted,
    handleQuestionEnded,
    handlePlayerAnswered,
    handleLeaderboardUpdated,
    handleTimeExtended,
    handleGameEnded,
    handleHostChanged,
    handlePlayerDisconnected,
    handleTimerStarted,
    handleTimerWarning,
    handleTimerCompleted,
    handleScoreUpdate
  ]);
  
  // Set up game event listeners
  const setupGameEventListeners = useCallback((socket: Socket) => {
    // Game lifecycle events
    socket.on('game_event', handleGameEvent);
    
    // Direct score updates (personal)
    socket.on('score_update', handleScoreUpdate);
    
    // Leaderboard updates (personal)
    socket.on('leaderboard_personal', handleLeaderboardUpdated);
    
    // Question broadcast events (requires acknowledgment)
    socket.on('question_broadcast', handleQuestionBroadcast);
    
    // Direct game responses
    socket.on('answer_acknowledged', handleAnswerAcknowledged);
    
    // Room events that affect games
    socket.on('room:user_joined', handlePlayerJoined);
    socket.on('room:user_left', handlePlayerLeft);
    
    return () => {
      socket.off('game_event', handleGameEvent);
      socket.off('score_update', handleScoreUpdate);
      socket.off('leaderboard_personal', handleLeaderboardUpdated);
      socket.off('question_broadcast', handleQuestionBroadcast);
      socket.off('answer_acknowledged', handleAnswerAcknowledged);
      socket.off('room:user_joined', handlePlayerJoined);
      socket.off('room:user_left', handlePlayerLeft);
    };
  }, [handleGameEvent, handleQuestionBroadcast, handleAnswerAcknowledged, handlePlayerJoined, handlePlayerLeft]);
  
  // Game actions
  const startGame = useCallback(async (config: Partial<GameConfig>, roomId?: string) => {
    if (!socket) {
      console.error('❌ No socket connection available for startGame');
      return;
    }
    
    // For starting a new game, we need the room ID from either the current game or parameter
    const targetRoomId = roomId || gameStore.currentGame?.roomId;
    if (!targetRoomId) {
      console.error('❌ No room ID available for startGame');
      toast.error('Unable to start game - no room selected');
      return;
    }
    
    gameActions.setLoading(true);
    gameActions.setError(null);
    
    try {
      const payload: StartGamePayload = {
        roomId: targetRoomId,
        quizConfig: config
      };
      
      console.log('📡 Emitting game:start event with payload:', payload);
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:start', payload, (response: GameResponse) => {
          console.log('📡 Received game:start response:', response);
          if (response.success) {
            console.log('✅ Game started successfully:', response.data);
            resolve();
          } else {
            console.error('❌ Game start failed:', response.error);
            reject(new Error(response.error?.message || 'Failed to start game'));
          }
        });
      });
      
      toast.success('Game started successfully!');
    } catch (error: any) {
      console.error('❌ Start game error:', error);
      gameActions.setError(error.message);
      toast.error(error.message || 'Failed to start game');
    } finally {
      gameActions.setLoading(false);
    }
  }, [socket, gameStore.currentGame, gameActions]);
  
  const joinGame = useCallback(async (roomId: string) => {
    if (!socket) return;
    
    gameActions.setLoading(true);
    gameActions.setError(null);
    
    try {
      const payload: JoinGamePayload = { roomId };
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:join', payload, (response: GameResponse) => {
          if (response.success) {
            console.log('Joined game successfully:', response.data);
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to join game'));
          }
        });
      });
      
      toast.success('Joined game successfully!');
    } catch (error: any) {
      console.error('Join game error:', error);
      gameActions.setError(error.message);
      toast.error(error.message || 'Failed to join game');
    } finally {
      gameActions.setLoading(false);
    }
  }, [socket, gameActions]);
  
  const leaveGame = useCallback(async (roomId: string) => {
    if (!socket) return;
    
    gameActions.setLoading(true);
    gameActions.setError(null);
      
    try {
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:leave', { roomId }, (response: GameResponse) => {
          if (response.success) {
            console.log('Left game successfully');
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to leave game'));
          }
        });
      });
      
      // Clear game state
      gameActions.clearGame();
      
      toast.success('Left game successfully');
    } catch (error: any) {
      console.error('Leave game error:', error);
      gameActions.setError(error.message);
      toast.error(error.message || 'Failed to leave game');
    } finally {
      gameActions.setLoading(false);
    }
  }, [socket, gameActions]);
  
  const submitAnswer = useCallback(async (
    questionId: string, 
    questionIndex: number, 
    answer: any, 
    timeTaken: number
  ) => {
    if (!socket || !gameStore.currentGame) {
      console.error('❌ Cannot submit answer: no socket or game');
      return;
    }
    
    // Prevent double submissions
    if (gameStore.hasAnswered) {
      console.log('⏭️ Answer already submitted, skipping');
      return;
    }
    
    // Set hasAnswered immediately to prevent double clicks
    gameActions.setHasAnswered(true);
    
    try {
      const payload: AnswerSubmissionPayload = {
        roomId: gameStore.currentGame.roomId,
        questionId,
        questionIndex,
        answer,
        submittedAt: new Date(),
        timeTaken
      };
      
      console.log('📤 Submitting answer:', payload);
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:answer', payload, (response: GameResponse) => {
          if (response.success) {
            console.log('✅ Answer submitted successfully:', response.data);
            resolve();
          } else {
            console.error('❌ Answer submission failed:', response.error);
            // Reset hasAnswered on failure so user can retry
            gameActions.setHasAnswered(false);
            reject(new Error(response.error?.message || 'Failed to submit answer'));
          }
        });
      });
      
      toast.success('Answer submitted!');
    } catch (error: any) {
      console.error('❌ Submit answer error:', error);
      // Reset hasAnswered on error so user can retry
      gameActions.setHasAnswered(false);
      toast.error(error.message || 'Failed to submit answer');
    }
  }, [socket, gameStore.currentGame, gameStore.hasAnswered, gameActions]);
  
  const setPlayerReady = useCallback(async (roomId: string, isReady: boolean) => {
    if (!socket) return;
    
    try {
      const payload: PlayerReadyPayload = { roomId, isReady };
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('room:ready', payload, (response: any) => {
          if (response.success) {
            console.log('✅ Room ready status updated:', isReady);
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to update ready status'));
          }
        });
      });
      
      const message = isReady ? 'You are ready!' : 'You are not ready';
      toast.success(message);
    } catch (error: any) {
      console.error('Set player ready error:', error);
      toast.error(error.message || 'Failed to update ready status');
    }
  }, [socket]);
  
  // Host actions
  const skipQuestion = useCallback(async (roomId: string) => {
    if (!socket || !gameStore.isHost) return;
    
    try {
      const payload: HostActionPayload = { 
        roomId, 
        action: 'SKIP_QUESTION' as HostAction,
        data: {
          timestamp: new Date()
        }
      };
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:host_action', payload, (response: GameResponse) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to skip question'));
          }
        });
      });
      
      toast.success('Question skipped');
    } catch (error: any) {
      console.error('Skip question error:', error);
      toast.error(error.message || 'Failed to skip question');
    }
  }, [socket, gameStore.isHost]);

  const pauseGame = useCallback(async (roomId: string) => {
    if (!socket || !gameStore.isHost) return;
    
    try {
      const payload: HostActionPayload = { 
        roomId, 
        action: 'PAUSE_GAME' as HostAction,
        data: {
          timestamp: new Date()
        }
      };
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:host_action', payload, (response: GameResponse) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to pause game'));
          }
        });
      });
      
      toast.success('Game paused');
    } catch (error: any) {
      console.error('Pause game error:', error);
      toast.error(error.message || 'Failed to pause game');
    }
  }, [socket, gameStore.isHost]);

  const resumeGame = useCallback(async (roomId: string) => {
    if (!socket || !gameStore.isHost) return;
    
    try {
      const payload: HostActionPayload = { 
        roomId, 
        action: 'RESUME_GAME' as HostAction,
        data: {
          timestamp: new Date()
        }
      };
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:host_action', payload, (response: GameResponse) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to resume game'));
          }
        });
      });
      
      toast.success('Game resumed');
    } catch (error: any) {
      console.error('Resume game error:', error);
      toast.error(error.message || 'Failed to resume game');
    }
  }, [socket, gameStore.isHost]);

  const extendTime = useCallback(async (roomId: string, seconds: number) => {
    if (!socket || !gameStore.isHost) return;
    
    try {
      const payload: HostActionPayload = { 
        roomId, 
        action: 'EXTEND_TIME' as HostAction,
        data: { 
          seconds,
          timestamp: new Date()
        }
      };
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:host_action', payload, (response: GameResponse) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to extend time'));
          }
        });
      });
      
      toast.success(`Extended time by ${seconds} seconds`);
    } catch (error: any) {
      console.error('Extend time error:', error);
      toast.error(error.message || 'Failed to extend time');
    }
  }, [socket, gameStore.isHost]);

  const endGame = useCallback(async (roomId: string) => {
    if (!socket || !gameStore.isHost) return;
    
    try {
      const payload: HostActionPayload = { 
        roomId, 
        action: 'END_GAME' as HostAction,
        data: {
          timestamp: new Date()
        }
      };
      
      await new Promise<void>((resolve, reject) => {
        socket.emit('game:host_action', payload, (response: GameResponse) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error?.message || 'Failed to end game'));
          }
        });
      });
      
      toast.success('Game ended');
    } catch (error: any) {
      console.error('End game error:', error);
      toast.error(error.message || 'Failed to end game');
    }
  }, [socket, gameStore.isHost]);
  
  // Utilities
  const syncTime = useCallback(async () => {
    if (!socket) return;
    
    const startTime = performance.now();
    
    socket.emit('game:sync_time', { 
      clientTime: Date.now() 
    }, (response: any) => {
      if (response.success) {
        const endTime = performance.now();
        const roundTripTime = endTime - startTime;
        
        const timeSync: TimeSync = {
          serverTime: response.serverTime,
          clientTime: Date.now(),
          roundTripTime: roundTripTime,
          offset: response.serverTime - Date.now() + (roundTripTime / 2),
          lastSync: new Date()
        };
        
        gameActions.updateTimeSync(timeSync);
      }
    });
  }, [socket, gameActions]);
  
  const ping = useCallback(async () => {
    if (!socket) return;
    
    const startTime = performance.now();
    
    socket.emit('ping', (response: any) => {
      const endTime = performance.now();
      const pingTime = endTime - startTime;
      
      // TODO: Update ping if needed - gameActions.updatePing(pingTime);
    });
  }, [socket, gameActions]);
  
  const getGameState = useCallback(async (roomId: string) => {
    if (!socket) return;
    
    socket.emit('game:get_state', { roomId }, (response: GameResponse) => {
      if (response.success && response.data) {
        // Update the game store with current state
        const gameStateData = response.data;
        
        // Convert to proper GameState format
        const gameState: GameState = {
          ...gameStateData,
          players: gameStateData.players || [],
          leaderboard: gameStateData.leaderboard || [],
          config: gameStateData.config || {} as GameConfig,
          settings: gameStateData.settings || {} as any
        };
        
        gameActions.setGameState(gameState);
      }
    });
  }, [socket, gameActions]);
  
  // Set up socket listeners
  useEffect(() => {
    if (socket && connectionStatus.isConnected) {
      const cleanup = setupGameEventListeners(socket);
      return cleanup;
    }
    return () => {}; // Return empty cleanup function if no socket
  }, [socket, connectionStatus.isConnected, setupGameEventListeners]);
  
  // Set up periodic sync and ping
  useEffect(() => {
    if (gameStore.isInGame && socket && connectionStatus.isConnected) {
      // Sync time every 30 seconds
      syncTimerRef.current = setInterval(syncTime, 30000);
      
      // Ping every 5 seconds
      pingTimerRef.current = setInterval(ping, 5000);
      
      // Initial sync and ping
      syncTime();
      ping();
      
      return () => {
        if (syncTimerRef.current) {
          clearInterval(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
      };
    }
    return () => {}; // Return empty cleanup function when not in game
  }, [gameStore.isInGame, socket, connectionStatus.isConnected, syncTime, ping]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    };
  }, []);
  
  return {
    // Game state
    gameState: gameStore.currentGame,
    isInGame: gameStore.isInGame,
    isHost: gameStore.isHost,
    currentPlayer: gameStore.currentPlayer,
    
    // Game actions
    startGame,
    joinGame,
    leaveGame,
    submitAnswer,
    setPlayerReady,
    
    // Host actions
    skipQuestion,
    pauseGame,
    resumeGame,
    extendTime,
    endGame,
    
    // Utilities
    syncTime,
    ping,
    getGameState,
    
    // State
    isLoading: gameStore.isLoading,
    error: gameStore.error,
  };
}
