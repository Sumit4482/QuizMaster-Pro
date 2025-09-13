import { Request, Response, NextFunction } from 'express';
import { UserService } from './userService';
import { logger } from '../../utils/logger';
import { 
  successResponse, 
  errorResponse,
  badRequestResponse,
  notFoundResponse,
  unauthorizedResponse
} from '../../utils/responseUtils';

export class UserController {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Register a new user
   */
  public register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, username, firstName, lastName } = req.body;

      if (!email || !password || !username) {
        badRequestResponse(res, 'Email, password, and username are required');
        return;
      }

      const result = await this.userService.register({
        email,
        password,
        username,
        firstName: firstName || null,
        lastName: lastName || null
      });

      logger.info('User registered successfully', {
        component: 'UserController',
        userId: result.user.id,
        email: result.user.email
      });

      successResponse(res, result, 'User registered successfully', 201);
    } catch (error) {
      logger.error('User registration failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error),
        email: req.body?.email
      });

      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          badRequestResponse(res, error.message);
          return;
        }
      }

      errorResponse(res, 'Registration failed');
    }
  };

  /**
   * Login user
   */
  public login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        badRequestResponse(res, 'Email and password are required');
        return;
      }

      const result = await this.userService.login(email, password);

      logger.info('User logged in successfully', {
        component: 'UserController',
        userId: result.user.id,
        email: result.user.email
      });

      successResponse(res, result, 'Login successful');
    } catch (error) {
      logger.error('User login failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error),
        email: req.body?.email
      });

      if (error instanceof Error && error.message === 'Invalid credentials') {
        unauthorizedResponse(res, 'Invalid email or password');
        return;
      }

      errorResponse(res, 'Login failed');
    }
  };

  /**
   * Refresh access token
   */
  public refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        badRequestResponse(res, 'Refresh token is required');
        return;
      }

      const result = await this.userService.refreshToken(refreshToken);

      logger.info('Token refreshed successfully', {
        component: 'UserController',
        userId: result.user.id
      });

      successResponse(res, result, 'Token refreshed successfully');
    } catch (error) {
      logger.error('Token refresh failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof Error && error.message === 'Invalid or expired refresh token') {
        unauthorizedResponse(res, error.message);
        return;
      }

      errorResponse(res, 'Token refresh failed');
    }
  };

  /**
   * Logout user
   */
  public logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await this.userService.logout(refreshToken);
      }

      logger.info('User logged out successfully', {
        component: 'UserController'
      });

      successResponse(res, {}, 'Logout successful');
    } catch (error) {
      logger.error('User logout failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'Logout failed');
    }
  };

  /**
   * Get user profile
   */
  public getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.userId;

      if (!userId) {
        badRequestResponse(res, 'User ID is required');
        return;
      }

      const profile = await this.userService.getUserProfile(userId);

      if (!profile) {
        notFoundResponse(res, 'User not found');
        return;
      }

      logger.info('User profile retrieved successfully', {
        component: 'UserController',
        userId
      });

      successResponse(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      logger.error('Get user profile failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.params.userId
      });

      errorResponse(res, 'Failed to retrieve profile');
    }
  };

  /**
   * Update user profile
   */
  public updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.userId;
      const updateData = req.body;

      if (!userId) {
        badRequestResponse(res, 'User ID is required');
        return;
      }

      const updatedProfile = await this.userService.updateUserProfile(userId, updateData);

      logger.info('User profile updated successfully', {
        component: 'UserController',
        userId
      });

      successResponse(res, updatedProfile, 'Profile updated successfully');
    } catch (error) {
      logger.error('Update user profile failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.params.userId
      });

      if (error instanceof Error && error.message === 'User not found') {
        notFoundResponse(res, error.message);
        return;
      }

      errorResponse(res, 'Failed to update profile');
    }
  };

  /**
   * Change user password
   */
  public changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.userId;
      const { currentPassword, newPassword } = req.body;

      if (!userId) {
        badRequestResponse(res, 'User ID is required');
        return;
      }

      if (!currentPassword || !newPassword) {
        badRequestResponse(res, 'Current password and new password are required');
        return;
      }

      await this.userService.changePassword(userId, currentPassword, newPassword);

      logger.info('User password changed successfully', {
        component: 'UserController',
        userId
      });

      successResponse(res, {}, 'Password changed successfully');
    } catch (error) {
      logger.error('Change password failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.params.userId
      });

      if (error instanceof Error) {
        if (error.message === 'User not found') {
          notFoundResponse(res, error.message);
          return;
        }
        if (error.message === 'Current password is incorrect') {
          unauthorizedResponse(res, error.message);
          return;
        }
      }

      errorResponse(res, 'Failed to change password');
    }
  };

  /**
   * Delete user account
   */
  public deleteAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.userId;

      if (!userId) {
        badRequestResponse(res, 'User ID is required');
        return;
      }

      await this.userService.deleteUser(userId);

      logger.info('User account deleted successfully', {
        component: 'UserController',
        userId
      });

      successResponse(res, {}, 'Account deleted successfully');
    } catch (error) {
      logger.error('Delete user account failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.params.userId
      });

      if (error instanceof Error && error.message === 'User not found') {
        notFoundResponse(res, error.message);
        return;
      }

      errorResponse(res, 'Failed to delete account');
    }
  };

  /**
   * Get user statistics
   */
  public getUserStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.userId;

      if (!userId) {
        badRequestResponse(res, 'User ID is required');
        return;
      }

      const stats = await this.userService.getUserStatistics(userId);

      logger.info('User statistics retrieved successfully', {
        component: 'UserController',
        userId
      });

      successResponse(res, stats, 'Statistics retrieved successfully');
    } catch (error) {
      logger.error('Get user statistics failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error),
        userId: req.params.userId
      });

      if (error instanceof Error && error.message === 'User not found') {
        notFoundResponse(res, error.message);
        return;
      }

      errorResponse(res, 'Failed to retrieve statistics');
    }
  };

  /**
   * Health check for user service
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.userService.healthCheck();

      successResponse(res, health, 'User service is healthy');
    } catch (error) {
      logger.error('User service health check failed', {
        component: 'UserController',
        error: error instanceof Error ? error.message : String(error)
      });

      errorResponse(res, 'User service is unhealthy', 503);
    }
  };
}

export default UserController;

