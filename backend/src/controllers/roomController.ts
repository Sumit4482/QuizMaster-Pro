import { Request, Response } from 'express';
import { EnhancedRoomService } from '../services/enhancedRoomService';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from '../types/express';
import { 
  EnhancedRoomSettings, 
  RoomCategory, 
  RoomVisibility, 
  RoomDiscoveryFilter 
} from '../types/enhancedRooms';
import { GameMode } from '../types/gameModes';

/**
 * REST API Controller for multiplayer rooms
 */
export class RoomController {
  private roomService: EnhancedRoomService;

  constructor() {
    this.roomService = EnhancedRoomService.getInstance();
  }

  /**
   * Create a new room
   * POST /api/rooms/create
   */
  public createRoom = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const {
        name,
        description,
        maxPlayers = 6,
        isPrivate = false,
        password,
        quizConfig,
        gameMode = 'CLASSIC' as GameMode,
        category = 'TRIVIA' as RoomCategory,
        tags = []
      } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Room name is required'
          }
        });
        return;
      }

      if (maxPlayers < 2 || maxPlayers > 20) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Max players must be between 2 and 20'
          }
        });
        return;
      }

      const roomSettings: EnhancedRoomSettings = {
        // Game flow settings
        autoStart: req.body.autoStart ?? false,
        autoStartDelay: req.body.autoStartDelay ?? 10,
        allowReconnection: req.body.allowReconnection ?? true,
        reconnectionTimeLimit: req.body.reconnectionTimeLimit ?? 300,
        allowLatejoin: req.body.allowLatejoin ?? false,
        lateJoinCutoff: req.body.lateJoinCutoff ?? 3,
        
        // Question settings  
        questionTimeLimit: req.body.questionTimeLimit ?? 30,
        showHints: req.body.showHints ?? false,
        allowSkipping: req.body.allowSkipping ?? false,
        shuffleQuestions: req.body.shuffleQuestions ?? true,
        shuffleAnswers: req.body.shuffleAnswers ?? true,
        showCorrectAnswers: req.body.showCorrectAnswers ?? true,
        showExplanations: req.body.showExplanations ?? true,
        
        // Scoring
        scoringSystem: req.body.scoringSystem ?? 'standard',
        bonusPoints: {
          timeBonus: req.body.bonusPoints?.timeBonus ?? true,
          streakBonus: req.body.bonusPoints?.streakBonus ?? true,
          difficultyBonus: req.body.bonusPoints?.difficultyBonus ?? true,
          firstCorrectBonus: req.body.bonusPoints?.firstCorrectBonus ?? false
        },
        
        // Power-ups
        allowPowerUps: req.body.allowPowerUps ?? false,
        powerUpSettings: {
          startingPowerUps: req.body.powerUpSettings?.startingPowerUps ?? 0,
          earnPowerUpsInGame: req.body.powerUpSettings?.earnPowerUpsInGame ?? false,
          maxActivePowerUps: req.body.powerUpSettings?.maxActivePowerUps ?? 1,
          powerUpCooldown: req.body.powerUpSettings?.powerUpCooldown ?? 30
        },
        
        // Social features
        chatSettings: {
          enabled: req.body.allowChat ?? true,
          moderationLevel: req.body.chatModerationLevel ?? 'basic',
          allowEmojis: req.body.allowEmojis ?? true,
          allowMentions: req.body.allowMentions ?? true,
          rateLimit: req.body.chatRateLimit ?? 10
        },
        
        reactionSettings: {
          enabled: req.body.allowReactions ?? true,
          allowDuringQuestions: req.body.allowReactionsDuringQuestions ?? false,
          allowCustomReactions: req.body.allowCustomReactions ?? false
        },
        
        // Privacy and moderation
        moderationSettings: {
          autoKickInactive: req.body.autoKickInactive ?? false,
          inactiveTimeLimit: req.body.inactiveTimeLimit ?? 300,
          allowPlayerReports: req.body.allowPlayerReports ?? true,
          requireHostApproval: req.body.requireHostApproval ?? false,
          banDisruptivePlayers: req.body.banDisruptivePlayers ?? true
        },
        
        // Spectator settings
        spectatorSettings: {
          allowSpectators: req.body.allowSpectators ?? true,
          spectatorLimit: req.body.spectatorLimit ?? 50,
          allowSpectatorChat: req.body.allowSpectatorChat ?? true,
          allowSpectatorPromotion: req.body.allowSpectatorPromotion ?? false
        },
        
        // Advanced features
        advancedSettings: {
          recordGame: req.body.recordGame ?? false,
          allowScreenShare: req.body.allowScreenShare ?? false,
          enableVoiceChat: req.body.enableVoiceChat ?? false,
          customBackgroundMusic: req.body.customBackgroundMusic ?? false,
          customTheme: req.body.customTheme
        }
      };

      // Create the room
      const room = await this.roomService.createEnhancedRoom(
        user.id,
        {
          name: name.trim(),
          description: description?.trim() || '',
          category,
          visibility: isPrivate ? 'PRIVATE' as RoomVisibility : 'PUBLIC' as RoomVisibility,
          tags: Array.isArray(tags) ? tags : [],
          gameMode,
          maxPlayers,
          password: isPrivate && password ? password : undefined,
          settings: roomSettings
        }
      );

      logger.info('Room created successfully', {
        roomId: room.id,
        hostId: user.id,
        hostUsername: user.username,
        roomName: name
      });

      res.status(201).json({
        success: true,
        data: {
          room: {
            ...room,
            // Don't expose password in response  
            password: room.password ? '[PROTECTED]' : undefined,
            settings: {
              ...room.settings
            }
          }
        },
        message: 'Room created successfully'
      });

    } catch (error) {
      logger.error('Failed to create room', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create room'
        }
      });
    }
  };

  /**
   * Get available rooms
   * GET /api/rooms/list
   */
  public listRooms = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const {
        category,
        gameMode,
        hasPassword,
        minPlayers,
        maxPlayers,
        tags,
        search,
        sortBy = 'created_desc',
        limit = 20,
        offset = 0
      } = req.query;

      const filters: RoomDiscoveryFilter = {
        category: category as RoomCategory || undefined,
        gameMode: gameMode as GameMode || undefined,
        hasPassword: hasPassword === 'true' ? true : hasPassword === 'false' ? false : undefined,
        minPlayers: minPlayers ? parseInt(minPlayers as string) : undefined,
        maxPlayers: maxPlayers ? parseInt(maxPlayers as string) : undefined,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
        sortBy: sortBy as any
      };

      const limitNum = Math.min(parseInt(limit as string) || 20, 50);
      const offsetNum = parseInt(offset as string) || 0;

      const allRooms = await this.roomService.discoverRooms(filters, req.user?.id);
      
      // Handle pagination manually
      const startIndex = offsetNum;
      const endIndex = startIndex + limitNum;
      const rooms = allRooms.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          rooms: rooms.map(room => ({
            ...room,
            // Don't expose passwords in list
            hasPassword: !!room.hasPassword,
            password: undefined
          })),
          filters,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            total: allRooms.length
          }
        }
      });

    } catch (error) {
      logger.error('Failed to list rooms', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list rooms'
        }
      });
    }
  };

  /**
   * Join a room
   * POST /api/rooms/:roomId/join
   */
  public joinRoom = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;
      const { roomId } = req.params;
      const { password } = req.body;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      // For REST API, we'll prepare the join data
      // Actual joining happens via WebSocket
      const joinRequest = {
        roomId,
        userId: user.id,
        username: user.username,
        password: password || undefined,
        timestamp: new Date().toISOString()
      };

      // Get room info for validation
      const room = await this.roomService.getRoom(roomId);

      if (!room) {
        res.status(404).json({
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found'
          }
        });
        return;
      }

      if (room.password && !password) {
        res.status(400).json({
          success: false,
          error: {
            code: 'PASSWORD_REQUIRED',
            message: 'Password required for private room'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          joinRequest,
          room: {
            id: room.id,
            name: room.name,
            description: room.description,
            currentPlayers: room.participants.length,
            maxPlayers: room.maxPlayers,
            gameMode: room.gameMode,
            status: room.status
          },
          message: 'Join request prepared. Connect to WebSocket to complete room joining.',
          websocketInstructions: {
            endpoint: `ws://localhost:${process.env.PORT || 3001}`,
            event: 'room:join',
            payload: joinRequest
          }
        }
      });

    } catch (error) {
      logger.error('Failed to join room', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id,
        roomId: req.params.roomId
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to join room'
        }
      });
    }
  };

  /**
   * Get room details
   * GET /api/rooms/:roomId
   */
  public getRoomDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;
      const { roomId } = req.params;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const room = await this.roomService.getRoom(roomId);

      if (!room) {
        res.status(404).json({
          success: false,
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          room: {
            ...room,
            // Don't expose password
            password: room.password ? '[PROTECTED]' : undefined,
            settings: {
              ...room.settings
            }
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get room details', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id,
        roomId: req.params.roomId
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get room details'
        }
      });
    }
  };

  /**
   * Get user's rooms
   * GET /api/rooms/my-rooms
   */
  public getMyRooms = async (req: Request, res: Response): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user;

      if (!user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      // For now, return empty array as getUserRooms method needs to be implemented
      const userRooms: any[] = [];

      res.json({
        success: true,
        data: {
          rooms: userRooms,
          count: userRooms.length
        }
      });

    } catch (error) {
      logger.error('Failed to get user rooms', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as AuthenticatedRequest).user?.id
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get user rooms'
        }
      });
    }
  };
}

export const roomController = new RoomController();


