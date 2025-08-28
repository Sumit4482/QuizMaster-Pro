import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyAccessToken, extractTokenFromHeader } from '@/utils/auth';
import { unauthorizedResponse, forbiddenResponse } from '@/utils/response';
import { AuthenticatedRequest } from '@/types/auth';
import { prisma } from '@/config/database';

// Authentication middleware
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      unauthorizedResponse(res, 'Access token required', req.correlationId);
      return;
    }

    // Verify token
    const payload = verifyAccessToken(token);

    // Check if token is blacklisted (user logged out)
    const session = await prisma.userSession.findUnique({
      where: { tokenJti: payload.jti },
      select: { id: true, expiresAt: true },
    });

    if (!session || session.expiresAt < new Date()) {
      unauthorizedResponse(res, 'Token has been revoked or expired', req.correlationId);
      return;
    }

    // Add user info to request
    req.user = {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      jti: payload.jti,
    };

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TOKEN_EXPIRED') {
        unauthorizedResponse(res, 'Access token expired', req.correlationId);
        return;
      } else if (error.message === 'TOKEN_INVALID') {
        unauthorizedResponse(res, 'Invalid access token', req.correlationId);
        return;
      }
    }

    console.error('Authentication error:', error);
    unauthorizedResponse(res, 'Authentication failed', req.correlationId);
  }
}

// Optional authentication middleware (doesn't fail if no token)
export async function optionalAuthenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      next();
      return;
    }

    // Verify token
    const payload = verifyAccessToken(token);

    // Check if token is blacklisted
    const session = await prisma.userSession.findUnique({
      where: { tokenJti: payload.jti },
      select: { id: true, expiresAt: true },
    });

    if (session && session.expiresAt >= new Date()) {
      req.user = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        role: payload.role,
        jti: payload.jti,
      };
    }

    next();
  } catch (error) {
    // Silently continue without authentication for optional auth
    next();
  }
}

// Role-based authorization middleware
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorizedResponse(res, 'Authentication required', req.correlationId);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      forbiddenResponse(
        res,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        req.correlationId
      );
      return;
    }

    next();
  };
}

// Admin only middleware
export const requireAdmin = authorize(UserRole.ADMIN);

// Host or Admin middleware
export const requireHostOrAdmin = authorize(UserRole.HOST, UserRole.ADMIN);

// User ownership middleware (user can only access their own resources)
export function requireOwnership(userIdParam: string = 'userId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorizedResponse(res, 'Authentication required', req.correlationId);
      return;
    }

    const requestedUserId = req.params[userIdParam];
    
    // Admin can access any resource
    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // User can only access their own resources
    if (req.user.id !== requestedUserId) {
      forbiddenResponse(res, 'Access denied. You can only access your own resources', req.correlationId);
      return;
    }

    next();
  };
}

// Middleware to check if user is verified (for future email verification)
export function requireVerifiedEmail(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    unauthorizedResponse(res, 'Authentication required', req.correlationId);
    return;
  }

  // For now, we'll skip this check since email verification is not implemented
  // In the future, we would check req.user.emailVerified
  next();
}
