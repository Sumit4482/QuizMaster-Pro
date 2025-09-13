import { Server, Socket } from 'socket.io';
import { logger } from '@/config/logger';
import { OneVsOneService } from '@/services/oneVsOneService';
import { OneVsOneMatchRequest } from '@/types/oneVsOne';
import { ExtendedSocket } from '../types/socket';

/**
 * 1vs1 Socket Event Handlers
 */
export class OneVsOneHandlers {
  private oneVsOneService: OneVsOneService;

  constructor() {
    this.oneVsOneService = OneVsOneService.getInstance();
  }

  /**
   * Setup 1vs1 event handlers for a socket
   */
  public setupHandlers(socket: ExtendedSocket, io: Server): void {
    // Initialize service with io if not already done
    this.oneVsOneService.initialize(io);

    // Find match
    socket.on('onevsone:find_match', async (data: OneVsOneMatchRequest, callback) => {
      try {
        if (!socket.data?.user) {
          callback?.({ success: false, error: 'Not authenticated' });
          return;
        }

        logger.info('1vs1 match request received', {
          userId: socket.data.user.id,
          username: socket.data.user.username,
          socketId: socket.id,
          data
        });

        await this.oneVsOneService.findMatch(
          socket.data.user.id,
          socket.data.user.username,
          socket.id,
          data
        );

        callback?.({ success: true });
      } catch (error) {
        logger.error('Failed to process 1vs1 match request', { error, userId: socket.data.user?.id });
        callback?.({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to find match'
        });
      }
    });

    // Cancel search
    socket.on('onevsone:cancel_search', (data, callback) => {
      try {
        if (!socket.data?.user) {
          callback?.({ success: false, error: 'Not authenticated' });
          return;
        }

        logger.info('1vs1 search cancelled', {
          userId: socket.data.user.id,
          socketId: socket.id
        });

        this.oneVsOneService.cancelSearch(socket.data.user.id);
        callback?.({ success: true });
      } catch (error) {
        logger.error('Failed to cancel 1vs1 search', { error, userId: socket.data.user?.id });
        callback?.({ success: false, error: 'Failed to cancel search' });
      }
    });

    // Player ready
    socket.on('onevsone:player_ready', async (data, callback) => {
      try {
        if (!socket.data?.user) {
          callback?.({ success: false, error: 'Not authenticated' });
          return;
        }

        logger.info('Player ready for 1vs1 game', {
          userId: socket.data.user.id,
          socketId: socket.id
        });

        await this.oneVsOneService.playerReady(socket.data.user.id);
        callback?.({ success: true });
      } catch (error) {
        logger.error('Failed to mark player as ready', { error, userId: socket.data.user?.id });
        callback?.({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to mark as ready'
        });
      }
    });

    // Submit answer
    socket.on('onevsone:submit_answer', async (data: { answer: string; timeToAnswer: number }, callback) => {
      try {
        if (!socket.data?.user) {
          callback?.({ success: false, error: 'Not authenticated' });
          return;
        }

        if (!data.answer) {
          callback?.({ success: false, error: 'Answer is required' });
          return;
        }

        logger.info('1vs1 answer submitted', {
          userId: socket.data.user.id,
          socketId: socket.id,
          answer: data.answer,
          timeToAnswer: data.timeToAnswer
        });

        await this.oneVsOneService.submitAnswer(socket.data.user.id, data.answer, data.timeToAnswer);
        callback?.({ success: true });
      } catch (error) {
        logger.error('Failed to submit 1vs1 answer', { error, userId: socket.data.user?.id });
        callback?.({ success: false, error: 'Failed to submit answer' });
      }
    });

    // Leave game
    socket.on('onevsone:leave_game', (data, callback) => {
      try {
        if (!socket.data?.user) {
          callback?.({ success: false, error: 'Not authenticated' });
          return;
        }

        logger.info('Player leaving 1vs1 game', {
          userId: socket.data.user.id,
          socketId: socket.id
        });

        this.oneVsOneService.handlePlayerDisconnection(socket.data.user.id);
        callback?.({ success: true });
      } catch (error) {
        logger.error('Failed to handle 1vs1 leave game', { error, userId: socket.data.user?.id });
        callback?.({ success: false, error: 'Failed to leave game' });
      }
    });

    // Handle socket disconnection
    socket.on('disconnect', () => {
      if (socket.data.user) {
        logger.info('1vs1 player disconnected', {
          userId: socket.data.user.id,
          socketId: socket.id
        });

        // Cancel search if in queue
        this.oneVsOneService.cancelSearch(socket.data.user.id);
        
        // Handle game disconnection
        this.oneVsOneService.handlePlayerDisconnection(socket.data.user.id);
      }
    });

    logger.info('1vs1 handlers setup complete', {
      userId: socket.data.user?.id,
      socketId: socket.id
    });
  }
}
