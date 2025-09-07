import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { verifyAccessToken } from '@/utils/auth';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { SocketUser, ExtendedSocket } from '../types/socket';
import { JwtPayload } from '@/types/auth';

/**
 * Socket.io authentication middleware
 * Validates JWT tokens provided in the handshake auth or query parameters
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: ExtendedError) => void
): Promise<void> {
  try {
    // Extract token from handshake
    let token: string | undefined;
    
    // Try to get token from auth object first
    if (socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }
    // Fallback to query parameter
    else if (socket.handshake.query?.token) {
      token = Array.isArray(socket.handshake.query.token)
        ? socket.handshake.query.token[0]
        : socket.handshake.query.token;
    }
    // Fallback to Authorization header
    else if (socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      logger.warn('WebSocket connection attempted without token', {
        socketId: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
      });
      return next(new Error('Authentication token required'));
    }

    // Verify the JWT token
    let payload: JwtPayload;
    try {
      payload = verifyAccessToken(token);
    } catch (error) {
      logger.warn('Invalid JWT token in WebSocket connection', {
        socketId: socket.id,
        ip: socket.handshake.address,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return next(new Error('Invalid authentication token'));
    }

    // Check if the session is still valid (not revoked)
    const session = await prisma.userSession.findUnique({
      where: { tokenJti: payload.jti },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!session) {
      logger.warn('WebSocket connection with revoked token', {
        socketId: socket.id,
        userId: payload.sub,
        jti: payload.jti,
      });
      return next(new Error('Token has been revoked'));
    }

    if (session.expiresAt < new Date()) {
      logger.warn('WebSocket connection with expired session', {
        socketId: socket.id,
        userId: payload.sub,
        jti: payload.jti,
        expiredAt: session.expiresAt,
      });
      return next(new Error('Session has expired'));
    }

    // Create socket user object
    const socketUser: SocketUser = {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      role: session.user.role,
      jti: payload.jti,
    };

    // Attach user data to socket
    const extendedSocket = socket as ExtendedSocket;
    extendedSocket.data = {
      user: socketUser,
      connectedAt: Date.now(),
      currentRooms: new Set<string>(),
      lastActivity: Date.now(),
    };

    logger.debug('WebSocket authentication successful', {
      socketId: socket.id,
      userId: socketUser.id,
      username: socketUser.username,
      role: socketUser.role,
    });

    next();
  } catch (error) {
    logger.error('WebSocket authentication error', {
      socketId: socket.id,
      ip: socket.handshake.address,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    next(new Error('Authentication failed'));
  }
}

/**
 * Middleware to check if user has specific role
 */
export function requireRole(requiredRoles: string | string[]) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  
  return (socket: ExtendedSocket, next: (err?: ExtendedError) => void) => {
    const userRole = socket.data.user.role;
    
    if (!roles.includes(userRole)) {
      logger.warn('WebSocket access denied - insufficient role', {
        socketId: socket.id,
        userId: socket.data.user.id,
        userRole,
        requiredRoles: roles,
      });
      return next(new Error('Insufficient permissions'));
    }
    
    next();
  };
}

/**
 * Rate limiting middleware for WebSocket events
 */
export function socketRateLimit(
  maxEvents: number = 100,
  windowMs: number = 60000 // 1 minute
) {
  return (socket: ExtendedSocket, next: (err?: ExtendedError) => void) => {
    const now = Date.now();
    
    if (!socket.data.rateLimitWindow) {
      socket.data.rateLimitWindow = now;
      socket.data.eventCount = 0;
    }

    // Reset window if expired
    if (now - socket.data.rateLimitWindow > windowMs) {
      socket.data.rateLimitWindow = now;
      socket.data.eventCount = 0;
    }

    // Increment event count
    socket.data.eventCount = (socket.data.eventCount || 0) + 1;

    // Check rate limit
    if (socket.data.eventCount > maxEvents) {
      logger.warn('WebSocket rate limit exceeded', {
        socketId: socket.id,
        userId: socket.data.user?.id,
        eventCount: socket.data.eventCount,
        windowMs,
        maxEvents,
      });
      return next(new Error('Rate limit exceeded'));
    }

    next();
  };
}

/**
 * Activity tracking middleware
 */
export function trackActivity(socket: ExtendedSocket, next: (err?: ExtendedError) => void) {
  socket.data.lastActivity = Date.now();
  next();
}

/**
 * Validation middleware for event payloads
 */
export function validateEventPayload(schema: any) {
  return (
    socket: ExtendedSocket,
    eventName: string,
    payload: any,
    next: (err?: ExtendedError) => void
  ) => {
    const { error } = schema.validate(payload);
    
    if (error) {
      logger.warn('WebSocket event validation failed', {
        socketId: socket.id,
        userId: socket.data.user?.id,
        eventName,
        error: error.details,
      });
      return next(new Error(`Validation failed: ${error.message}`));
    }
    
    next();
  };
}
