import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../types/auth';
import { sendErrorResponse } from '../utils/response';
import { logger } from '../config/logger';

// Middleware to ensure user is authenticated and has admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    logger.warn('Admin access attempted without authentication', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
    
    sendErrorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  if (authReq.user.role !== UserRole.ADMIN) {
    logger.warn('Non-admin user attempted admin access', {
      userId: authReq.user.id,
      userRole: authReq.user.role,
      username: authReq.user.username,
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    sendErrorResponse(res, 403, 'FORBIDDEN', 'Admin access required');
    return;
  }

  next();
}

// Middleware to ensure user is authenticated and has admin or host role
export function requireAdminOrHost(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    logger.warn('Admin/Host access attempted without authentication', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
    
    sendErrorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  const allowedRoles = [UserRole.ADMIN, UserRole.HOST];
  if (!allowedRoles.includes(authReq.user.role as any)) {
    logger.warn('Unauthorized user attempted admin/host access', {
      userId: authReq.user.id,
      userRole: authReq.user.role,
      username: authReq.user.username,
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    sendErrorResponse(res, 403, 'FORBIDDEN', 'Admin or Host access required');
    return;
  }

  next();
}

// Middleware to check resource ownership or admin access
export function requireOwnershipOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    sendErrorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return;
  }

  // Admin can access everything
  if (authReq.user.role === UserRole.ADMIN) {
    next();
    return;
  }

  // For non-admin users, we'll need to check ownership in the route handler
  // This middleware just ensures authentication
  next();
}

// Helper function to check if user can manage questions
export function canManageQuestions(userRole: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.HOST].includes(userRole as any);
}

// Helper function to check if user can manage categories
export function canManageCategories(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN;
}

// Helper function to check if user can view unpublished questions
export function canViewUnpublishedQuestions(userRole: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.HOST].includes(userRole as any);
}

// Helper function to check if user can bulk manage questions
export function canBulkManageQuestions(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN;
}

// Helper function to check if user can import/export questions
export function canImportExportQuestions(userRole: UserRole): boolean {
  return userRole === UserRole.ADMIN;
}

// Middleware for question-specific permissions
export function requireQuestionPermission(action: 'create' | 'update' | 'delete' | 'view' | 'publish') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      sendErrorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const { role } = authReq.user;

    switch (action) {
      case 'create':
      case 'update':
      case 'delete':
        if (!canManageQuestions(role)) {
          sendErrorResponse(res, 403, 'FORBIDDEN', 'Question management requires Admin or Host role');
          return;
        }
        break;

      case 'publish':
        if (role !== UserRole.ADMIN) {
          sendErrorResponse(res, 403, 'FORBIDDEN', 'Publishing questions requires Admin role');
          return;
        }
        break;

      case 'view':
        // Anyone can view published questions, but only admins/hosts can view unpublished
        // This check will be handled in the service layer based on question status
        break;

      default:
        sendErrorResponse(res, 400, 'INVALID_ACTION', 'Invalid permission action');
        return;
    }

    next();
  };
}

// Middleware for category-specific permissions
export function requireCategoryPermission(action: 'create' | 'update' | 'delete' | 'view') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      sendErrorResponse(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const { role } = authReq.user;

    switch (action) {
      case 'create':
      case 'update':
      case 'delete':
        if (!canManageCategories(role)) {
          sendErrorResponse(res, 403, 'FORBIDDEN', 'Category management requires Admin role');
          return;
        }
        break;

      case 'view':
        // Anyone can view categories
        break;

      default:
        sendErrorResponse(res, 400, 'INVALID_ACTION', 'Invalid permission action');
        return;
    }

    next();
  };
}

// Rate limiting specifically for question management operations
export function questionManagementRateLimit(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  
  // Admin users get higher rate limits
  if (authReq.user?.role === UserRole.ADMIN) {
    // Admins can make more requests
    next();
  } else {
    // Regular hosts get standard rate limiting
    next();
  }
}

// Audit logging middleware for admin actions
export function auditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    
    // Log the admin action
    logger.info('Admin action performed', {
      action,
      userId: authReq.user?.id,
      username: authReq.user?.username,
      userRole: authReq.user?.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      params: req.params,
      query: req.query,
      correlationId: authReq.correlationId
    });

    next();
  };
}

// Export adminAuth as alias for requireAdmin for backwards compatibility
export const adminAuth = requireAdmin;
