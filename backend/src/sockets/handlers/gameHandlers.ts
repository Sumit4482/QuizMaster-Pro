import { Server } from 'socket.io';
import { logger } from '@/config/logger';
import { GameManager } from '../managers/gameManager';
import { roomManager } from '../managers/roomManager';
import { connectionManager } from '../managers/connectionManager';
import { ExtendedSocket } from '../types/socket';
import {
  StartGamePayload,
  AnswerSubmissionPayload,
  PlayerReadyPayload,
  HostActionPayload,
  GameError,
  PlayerStatus
} from '../types/game';
import { validateEventPayload } from './validation';
import { eventHandlers } from './index';

export class GameEventHandlers {
  private gameManager: GameManager;

  constructor(
    private io: Server,
    gameManager: GameManager
  ) {
    this.gameManager = gameManager;
  }

  /**
   * Set up game-specific event handlers for a socket
   */
  public setupGameEvents(socket: ExtendedSocket): void {
    // Game lifecycle events
    this.setupGameLifecycleEvents(socket);
    
    // Gameplay events
    this.setupGameplayEvents(socket);
    
    // Host control events
    this.setupHostControlEvents(socket);
    
    // Player management events
    this.setupPlayerEvents(socket);
    
    // Timer and synchronization events
    this.setupTimerEvents(socket);
  }

  /**
   * Game lifecycle events (start, end, pause, etc.)
   */
  private setupGameLifecycleEvents(socket: ExtendedSocket): void {
    // Start game
    socket.on('game:start', eventHandlers.withErrorHandling(socket, async (payload: StartGamePayload, callback) => {
      try {
        // Validate payload
        const validation = this.validateStartGamePayload(payload);
        if (!validation.isValid) {
          throw new GameError('INVALID_PAYLOAD', validation.error || 'Invalid game start payload');
        }

        // Get room and verify host permissions
        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          throw new GameError('ROOM_NOT_FOUND', 'Room not found');
        }

        const participant = room.participants.get(socket.data.user.id);
        if (!participant || participant.role !== 'HOST') {
          throw new GameError('INSUFFICIENT_PERMISSIONS', 'Only the host can start the game');
        }

        // Check minimum players
        if (room.currentPlayers < 2) {
          throw new GameError('INSUFFICIENT_PLAYERS', 'At least 2 players required to start game');
        }

        // Check if all players are ready
        const players = Array.from(room.participants.values()).filter(
          p => p.role === 'PLAYER' || p.role === 'HOST'
        );
        const unreadyPlayers = players.filter(p => !p.isReady);
        
        if (unreadyPlayers.length > 0) {
          throw new GameError('PLAYERS_NOT_READY', 
            `${unreadyPlayers.length} player(s) are not ready. All players must be ready to start the game.`);
        }

        // Start the game
        const gameState = await this.gameManager.startGame(
          payload.roomId,
          socket.data.user.id,
          payload.quizConfig
        );

        // Add all room participants to the game
        for (const [userId, participant] of room.participants) {
          if (participant.role === 'PLAYER' || participant.role === 'HOST') {
            try {
              this.gameManager.addPlayerToGame(
                gameState.id,
                userId,
                participant.username,
                participant.socketId
              );
            } catch (error) {
              logger.warn('Failed to add player to game', { gameId: gameState.id, userId, error });
            }
          }
        }

        // Update room status using roomManager
        roomManager.updateRoomStatus(payload.roomId, 'IN_PROGRESS', gameState.id);

        logger.info('Game started via socket', {
          gameId: gameState.id,
          roomId: payload.roomId,
          hostId: socket.data.user.id,
          playerCount: gameState.playerCount
        });

        callback?.({
          success: true,
          data: {
            gameId: gameState.id,
            status: gameState.status,
            playerCount: gameState.playerCount,
            questionCount: gameState.questions.length
          },
          timestamp: new Date().toISOString()
        });

        // Start first question after a brief delay (reduced for better user experience)
        setTimeout(() => {
          this.gameManager.startNextQuestion(gameState.id).catch(error => {
            logger.error('Failed to start first question', { gameId: gameState.id, error });
          });
        }, 1500); // 1.5 second countdown for smoother experience

      } catch (error) {
        logger.error('Failed to start game', { 
          roomId: payload.roomId, 
          hostId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof GameError ? error.code : 'GAME_START_FAILED',
            message: error instanceof Error ? error.message : 'Failed to start game'
          },
          timestamp: new Date().toISOString()
        });
      }
    }));

    // Join game (when joining room that has active game)
    socket.on('game:join', eventHandlers.withErrorHandling(socket, async (payload: { roomId: string }, callback) => {
      try {
        const game = this.gameManager.getGameByRoomId(payload.roomId);
        if (!game) {
          throw new GameError('GAME_NOT_FOUND', 'No active game in room');
        }

        if (!game.settings.allowLateJoining && game.status !== 'WAITING') {
          throw new GameError('LATE_JOINING_DISABLED', 'Cannot join game in progress');
        }

        const player = this.gameManager.addPlayerToGame(
          game.id,
          socket.data.user.id,
          socket.data.user.username,
          socket.id
        );

        logger.info('Player joined game', {
          gameId: game.id,
          userId: socket.data.user.id,
          status: game.status
        });

        callback?.({
          success: true,
          data: {
            gameId: game.id,
            player: this.sanitizePlayerData(player),
            gameStatus: game.status,
            currentQuestionIndex: game.currentQuestionIndex
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to join game', { 
          roomId: payload.roomId, 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof GameError ? error.code : 'GAME_JOIN_FAILED',
            message: error instanceof Error ? error.message : 'Failed to join game'
          },
          timestamp: new Date().toISOString()
        });
      }
    }));

    // Leave game
    socket.on('game:leave', eventHandlers.withErrorHandling(socket, async (payload: { roomId: string }, callback) => {
      try {
        const game = this.gameManager.getGameByRoomId(payload.roomId);
        if (game) {
          // Find host player
          const hostPlayer = Array.from(game.players.values()).find(p => p.isHost);
          const hostId = hostPlayer?.userId || socket.data.user.id;
          this.gameManager.removePlayerFromGame(game.id, hostId, socket.data.user.id);
          
          logger.info('Player left game', {
            gameId: game.id,
            userId: socket.data.user.id
          });
        }

        callback?.({
          success: true,
          data: { message: 'Left game successfully' },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to leave game', { 
          roomId: payload.roomId, 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof GameError ? error.code : 'GAME_LEAVE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to leave game'
          },
          timestamp: new Date().toISOString()
        });
      }
    }));
  }

  /**
   * Gameplay events (answer submission, ready status, etc.)
   */
  private setupGameplayEvents(socket: ExtendedSocket): void {
    // Submit answer
    socket.on('game:answer', eventHandlers.withErrorHandling(socket, async (payload: AnswerSubmissionPayload, callback) => {
      try {
        // Add current timestamp if not provided
        if (!payload.submittedAt) {
          payload.submittedAt = new Date();
        }

        // Get the game ID from room ID
        const game = this.gameManager.getGameByRoomId(payload.roomId);
        if (!game) {
          logger.error('No active game found for room', { 
            roomId: payload.roomId,
            userId: socket.data.user.id,
            questionId: payload.questionId
          });
          throw new GameError('GAME_NOT_FOUND', 'No active game found in this room');
        }

        logger.debug('Found game for answer submission', {
          roomId: payload.roomId,
          gameId: game.id,
          userId: socket.data.user.id,
          questionId: payload.questionId
        });

        const answer = await this.gameManager.submitAnswer(
          game.id,
          socket.data.user.id,
          payload
        );

        logger.info('Answer submitted', {
          roomId: payload.roomId,
          userId: socket.data.user.id,
          questionId: payload.questionId,
          isCorrect: answer.isCorrect,
          timeTaken: answer.timeTaken
        });

        callback?.({
          success: true,
          data: {
            answer: {
              questionId: answer.questionId,
              questionIndex: answer.questionIndex,
              isCorrect: answer.isCorrect,
              pointsEarned: answer.pointsEarned,
              timeBonus: answer.timeBonus,
              streakBonus: answer.streakBonus,
              submittedAt: answer.submittedAt
            }
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to submit answer', { 
          roomId: payload.roomId, 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof GameError ? error.code : 'ANSWER_SUBMISSION_FAILED',
            message: error instanceof Error ? error.message : 'Failed to submit answer'
          },
          timestamp: new Date().toISOString()
        });
      }
    }));

    // Player ready status
    socket.on('game:ready', eventHandlers.withErrorHandling(socket, async (payload: PlayerReadyPayload, callback) => {
      try {
        const game = this.gameManager.getGameByRoomId(payload.roomId);
        if (!game) {
          throw new GameError('GAME_NOT_FOUND', 'Game not found');
        }

        const player = game.players.get(socket.data.user.id);
        if (!player) {
          throw new GameError('PLAYER_NOT_FOUND', 'Player not in game');
        }

        // Update player ready status
        if (payload.isReady) {
          player.status = PlayerStatus.READY;
          player.readyAt = new Date();
          game.playersReady++;
        } else {
          player.status = PlayerStatus.WAITING;
          player.readyAt = undefined;
          game.playersReady = Math.max(0, game.playersReady - 1);
        }

        // Broadcast ready status change
        this.io.to(game.roomId).emit('game_event', {
          type: 'player_ready_changed',
          gameId: game.id,
          roomId: game.roomId,
          data: {
            userId: socket.data.user.id,
            username: player.username,
            isReady: payload.isReady,
            playersReady: game.playersReady,
            totalPlayers: game.playerCount
          },
          timestamp: new Date(),
          version: game.version
        });

        callback?.({
          success: true,
          data: {
            isReady: payload.isReady,
            playersReady: game.playersReady,
            totalPlayers: game.playerCount
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to update ready status', { 
          roomId: payload.roomId, 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof GameError ? error.code : 'READY_UPDATE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to update ready status'
          },
          timestamp: new Date().toISOString()
        });
      }
    }));

    // Get game state
    socket.on('game:get_state', eventHandlers.withErrorHandling(socket, async (payload: { roomId: string }, callback) => {
      try {
        const game = this.gameManager.getGameByRoomId(payload.roomId);
        if (!game) {
          throw new GameError('GAME_NOT_FOUND', 'Game not found');
        }

        const player = game.players.get(socket.data.user.id);
        if (!player) {
          throw new GameError('PLAYER_NOT_FOUND', 'Player not in game');
        }

        // Send current game state to player
        const gameStateForPlayer = {
          gameId: game.id,
          status: game.status,
          currentQuestionIndex: game.currentQuestionIndex,
          totalQuestions: game.questions.length,
          players: Array.from(game.players.values()).map(p => this.sanitizePlayerData(p)),
          leaderboard: game.leaderboard,
          currentQuestion: game.currentQuestion ? {
            ...game.currentQuestion,
            correctAnswer: undefined, // Hide correct answer
            playerAnswers: undefined
          } : undefined,
          masterTimer: game.masterTimer,
          settings: game.settings
        };

        callback?.({
          success: true,
          data: gameStateForPlayer,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get game state', { 
          roomId: payload.roomId, 
          userId: socket.data.user.id, 
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof GameError ? error.code : 'GET_STATE_FAILED',
            message: error instanceof Error ? error.message : 'Failed to get game state'
          },
          timestamp: new Date().toISOString()
        });
      }
    }));
  }

  /**
   * Host control events (skip, pause, extend time, etc.)
   */
  private setupHostControlEvents(socket: ExtendedSocket): void {
    // Host actions
    socket.on('game:host_action', eventHandlers.withErrorHandling(socket, async (payload: HostActionPayload, callback) => {
      try {
        const game = this.gameManager.getGameByRoomId(payload.roomId);
        if (!game) {
          throw new GameError('GAME_NOT_FOUND', 'Game not found');
        }

        const player = game.players.get(socket.data.user.id);
        if (!player || !player.isHost) {
          throw new GameError('INSUFFICIENT_PERMISSIONS', 'Only the host can perform this action');
        }

        let result: any = {};

        switch (payload.action) {
          case 'skip_question':
            if (!game.settings.hostCanSkip) {
              throw new GameError('ACTION_DISABLED', 'Question skipping is disabled');
            }
            await this.gameManager.endQuestion(game.id);
            result = { message: 'Question skipped' };
            break;

          case 'pause_game':
            if (!game.settings.hostCanPause) {
              throw new GameError('ACTION_DISABLED', 'Game pausing is disabled');
            }
            // TODO: Implement pause logic
            result = { message: 'Game paused' };
            break;

          case 'resume_game':
            if (!game.settings.hostCanPause) {
              throw new GameError('ACTION_DISABLED', 'Game resuming is disabled');
            }
            // TODO: Implement resume logic
            result = { message: 'Game resumed' };
            break;

          case 'extend_time':
            if (!game.settings.hostCanExtendTime) {
              throw new GameError('ACTION_DISABLED', 'Time extension is disabled');
            }
            const extension = payload.data?.seconds || 30;
            if (game.questionEndsAt) {
              game.questionEndsAt = new Date(game.questionEndsAt.getTime() + extension * 1000);
              // Broadcast time extension
              this.io.to(game.roomId).emit('game_event', {
                type: 'time_extended',
                gameId: game.id,
                roomId: game.roomId,
                data: { 
                  extensionSeconds: extension,
                  newEndTime: game.questionEndsAt 
                },
                timestamp: new Date(),
                version: game.version
              });
            }
            result = { message: `Time extended by ${extension} seconds`, newEndTime: game.questionEndsAt };
            break;

          case 'end_game':
            await this.gameManager.endGame(game.id, 'host_ended');
            result = { message: 'Game ended by host' };
            break;

          default:
            throw new GameError('INVALID_ACTION', 'Invalid host action');
        }

        logger.info('Host action performed', {
          gameId: game.id,
          hostId: socket.data.user.id,
          action: payload.action,
          data: payload.data
        });

        callback?.({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to perform host action', { 
          roomId: payload.roomId, 
          hostId: socket.data.user.id, 
          action: payload.action,
          error: error instanceof Error ? error.message : error 
        });
        
        callback?.({
          success: false,
          error: {
            code: error instanceof GameError ? error.code : 'HOST_ACTION_FAILED',
            message: error instanceof Error ? error.message : 'Failed to perform host action'
          },
          timestamp: new Date().toISOString()
        });
      }
    }));
  }

  /**
   * Player management events
   */
  private setupPlayerEvents(socket: ExtendedSocket): void {
    // Handle player disconnect from game
    socket.on('disconnect', () => {
      const game = this.gameManager.getPlayerGame(socket.data.user.id);
      if (game) {
        // Mark player as disconnected but don't remove immediately
        const player = game.players.get(socket.data.user.id);
        if (player) {
          player.status = PlayerStatus.DISCONNECTED;
          
          // Broadcast player disconnection
          this.io.to(game.roomId).emit('game_event', {
            type: 'player_disconnected',
            gameId: game.id,
            roomId: game.roomId,
            data: {
              userId: player.userId,
              username: player.username,
              canReconnect: game.settings.allowReconnection
            },
            timestamp: new Date(),
            version: game.version
          });

          // Remove player after grace period if reconnection not allowed
          if (!game.settings.allowReconnection) {
            setTimeout(() => {
              // Find host player
              const hostPlayer = Array.from(game.players.values()).find(p => p.isHost);
              const hostId = hostPlayer?.userId || socket.data.user.id;
              this.gameManager.removePlayerFromGame(game.id, hostId, socket.data.user.id);
            }, 30000); // 30 second grace period
          }
        }
      }
    });
  }

  /**
   * Timer and synchronization events
   */
  private setupTimerEvents(socket: ExtendedSocket): void {
    // Time sync request
    socket.on('game:sync_time', eventHandlers.withErrorHandling(socket, async (payload: { clientTime: number }, callback) => {
      const serverTime = Date.now();
      callback?.({
        success: true,
        data: {
          serverTime,
          clientTime: payload.clientTime,
          roundTripTime: 0, // Will be calculated by client
        },
        timestamp: new Date().toISOString()
      });
    }));

    // Ping for latency measurement
    socket.on('game:ping', eventHandlers.withErrorHandling(socket, async (payload: { timestamp: number }, callback) => {
      const game = this.gameManager.getPlayerGame(socket.data.user.id);
      if (game) {
        const player = game.players.get(socket.data.user.id);
        if (player) {
          const now = Date.now();
          player.latency = now - payload.timestamp;
          player.lastPing = new Date();
        }
      }

      callback?.({
        success: true,
        data: {
          timestamp: payload.timestamp,
          serverTime: Date.now()
        },
        timestamp: new Date().toISOString()
      });
    }));
  }

  /**
   * Validate start game payload
   */
  private validateStartGamePayload(payload: StartGamePayload): { isValid: boolean; error?: string } {
    if (!payload.roomId) {
      return { isValid: false, error: 'Room ID is required' };
    }

    if (!payload.quizConfig) {
      return { isValid: false, error: 'Quiz configuration is required' };
    }

    const config = payload.quizConfig;

    if (config.totalQuestions && (config.totalQuestions < 1 || config.totalQuestions > 100)) {
      return { isValid: false, error: 'Total questions must be between 1 and 100' };
    }

    if (config.timePerQuestion && (config.timePerQuestion < 5 || config.timePerQuestion > 300)) {
      return { isValid: false, error: 'Time per question must be between 5 and 300 seconds' };
    }

    // For non-AI games, categories are required. For AI games, categories can be empty
    if (!config.useAI) {
      // Library questions require categories
      if (!config.categories || !Array.isArray(config.categories) || config.categories.length === 0) {
        return { isValid: false, error: 'At least one category must be selected for library questions' };
      }
    } else {
      // AI games can have empty categories, but if provided, should be valid array
      if (config.categories && !Array.isArray(config.categories)) {
        return { isValid: false, error: 'Categories must be an array' };
      }
    }

    return { isValid: true };
  }

  /**
   * Sanitize player data for client
   */
  private sanitizePlayerData(player: any): any {
    return {
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
      latency: player.latency,
      lastActivity: player.lastActivity
    };
  }
}
