import { Response, NextFunction } from 'express';
import { AuthService } from '@/services/authService';
import { AuthenticatedRequest } from '@/types/auth';
import { RequestWithCorrelation } from '@/types/common';
import { 
  successResponse, 
  errorResponse, 
  conflictResponse, 
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse 
} from '@/utils/response';
import { HttpStatus, ErrorCode } from '@/types/common';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  // User registration
  register = async (
    req: RequestWithCorrelation, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.authService.register(req.body);
      
      successResponse(
        res,
        result,
        'User registered successfully',
        HttpStatus.CREATED,
        req.correlationId
      );
    } catch (error) {
      if (error instanceof Error) {
        switch (error.message) {
          case 'EMAIL_ALREADY_EXISTS':
            conflictResponse(res, 'Email address is already registered', req.correlationId);
            return;
          case 'USERNAME_ALREADY_EXISTS':
            conflictResponse(res, 'Username is already taken', req.correlationId);
            return;
          default:
            next(error);
            return;
        }
      }
      next(error);
    }
  };

  // User login
  login = async (
    req: RequestWithCorrelation, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.authService.login(req.body);
      
      successResponse(
        res,
        result,
        'Login successful',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
        unauthorizedResponse(res, 'Invalid email or password', req.correlationId);
        return;
      }
      next(error);
    }
  };

  // Refresh access token
  refreshToken = async (
    req: RequestWithCorrelation, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.authService.refreshToken(req.body);
      
      successResponse(
        res,
        result,
        'Token refreshed successfully',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      if (error instanceof Error) {
        switch (error.message) {
          case 'REFRESH_TOKEN_EXPIRED':
            unauthorizedResponse(res, 'Refresh token has expired', req.correlationId);
            return;
          case 'REFRESH_TOKEN_INVALID':
            unauthorizedResponse(res, 'Invalid refresh token', req.correlationId);
            return;
          default:
            next(error);
            return;
        }
      }
      next(error);
    }
  };

  // User logout
  logout = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        unauthorizedResponse(res, 'Authentication required', req.correlationId);
        return;
      }

      await this.authService.logout(req.user.id, req.user.jti);
      
      successResponse(
        res,
        null,
        'Logout successful',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      next(error);
    }
  };

  // Logout from all devices
  logoutAll = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        unauthorizedResponse(res, 'Authentication required', req.correlationId);
        return;
      }

      await this.authService.logout(req.user.id);
      
      successResponse(
        res,
        null,
        'Logged out from all devices successfully',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      next(error);
    }
  };

  // Get current user profile
  getProfile = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        unauthorizedResponse(res, 'Authentication required', req.correlationId);
        return;
      }

      const profile = await this.authService.getUserProfile(req.user.id);
      
      successResponse(
        res,
        profile,
        'Profile retrieved successfully',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
        notFoundResponse(res, 'User', req.correlationId);
        return;
      }
      next(error);
    }
  };

  // Update user profile
  updateProfile = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        unauthorizedResponse(res, 'Authentication required', req.correlationId);
        return;
      }

      const updatedProfile = await this.authService.updateUserProfile(req.user.id, req.body);
      
      successResponse(
        res,
        updatedProfile,
        'Profile updated successfully',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
        notFoundResponse(res, 'User', req.correlationId);
        return;
      }
      next(error);
    }
  };

  // Change password
  changePassword = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        unauthorizedResponse(res, 'Authentication required', req.correlationId);
        return;
      }

      const { currentPassword, newPassword } = req.body;
      
      await this.authService.changePassword(req.user.id, currentPassword, newPassword);
      
      successResponse(
        res,
        null,
        'Password changed successfully. Please login again.',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      if (error instanceof Error) {
        switch (error.message) {
          case 'USER_NOT_FOUND':
            notFoundResponse(res, 'User', req.correlationId);
            return;
          case 'INVALID_CURRENT_PASSWORD':
            errorResponse(
              res,
              {
                code: ErrorCode.INVALID_CREDENTIALS,
                message: 'Current password is incorrect',
              },
              HttpStatus.BAD_REQUEST,
              req.correlationId
            );
            return;
          default:
            next(error);
            return;
        }
      }
      next(error);
    }
  };

  // Get user sessions
  getSessions = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        unauthorizedResponse(res, 'Authentication required', req.correlationId);
        return;
      }

      const sessions = await this.authService.getUserSessions(req.user.id);
      
      successResponse(
        res,
        sessions,
        'Sessions retrieved successfully',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      next(error);
    }
  };

  // Revoke specific session
  revokeSession = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        unauthorizedResponse(res, 'Authentication required', req.correlationId);
        return;
      }

      const { sessionId } = req.params;
      
      await this.authService.revokeSession(req.user.id, sessionId);
      
      successResponse(
        res,
        null,
        'Session revoked successfully',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      // Prisma will throw if session not found or doesn't belong to user
      if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
        notFoundResponse(res, 'Session', req.correlationId);
        return;
      }
      next(error);
    }
  };

  // Check if email is available
  checkEmailAvailability = async (
    req: RequestWithCorrelation, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      const { email } = req.query;
      
      if (!email || typeof email !== 'string') {
        validationErrorResponse(
          res,
          [{ field: 'email', message: 'Email is required' }],
          req.correlationId
        );
        return;
      }

      const isAvailable = await this.authService.checkEmailAvailability(email as string);
      
      successResponse(
        res,
        { available: isAvailable },
        isAvailable ? 'Email is available' : 'Email is already taken',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      next(error);
    }
  };

  // Forgot password (UI preparation)
  forgotPassword = async (
    req: RequestWithCorrelation, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      // For now, just return success (email functionality will be implemented later)
      successResponse(
        res,
        null,
        'If an account with this email exists, you will receive password reset instructions.',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      next(error);
    }
  };

  // Reset password (UI preparation)
  resetPassword = async (
    req: RequestWithCorrelation, 
    res: Response, 
    next: NextFunction
  ): Promise<void> => {
    try {
      // For now, just return success (functionality will be implemented later)
      successResponse(
        res,
        null,
        'Password reset functionality will be implemented in future phases.',
        HttpStatus.OK,
        req.correlationId
      );
    } catch (error) {
      next(error);
    }
  };
}
