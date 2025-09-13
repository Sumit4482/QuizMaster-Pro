import { Request, Response } from 'express';
import { NotificationService } from './notificationService';
import { logger } from '../../utils/logger';
import { successResponse, errorResponse, badRequestResponse } from '../../utils/responseUtils';
import { AuthenticatedRequest } from '../../types/auth';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  public sendNotification = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userId, type, title, message, data, priority, scheduledAt, expiresAt } = req.body;

      if (!userId || !type || !title || !message) {
        badRequestResponse(res, 'userId, type, title, and message are required');
        return;
      }

      const result = await this.notificationService.sendNotification({
        userId, type, title, message, data, priority: priority || 'normal', scheduledAt, expiresAt
      });

      if (result.success) {
        successResponse(res, { notificationId: result.notificationId }, 'Notification sent successfully', 201);
      } else {
        errorResponse(res, 'Failed to send notification');
      }
    } catch (error) {
      logger.error('Send notification failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to send notification');
    }
  };

  public sendBulkNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { userIds, type, title, message, data, priority, scheduledAt } = req.body;

      if (!userIds || !Array.isArray(userIds) || !type || !title || !message) {
        badRequestResponse(res, 'userIds (array), type, title, and message are required');
        return;
      }

      const result = await this.notificationService.sendBulkNotifications({
        userIds, type, title, message, data, priority: priority || 'normal', scheduledAt
      });

      successResponse(res, result, 'Bulk notifications processed');
    } catch (error) {
      logger.error('Send bulk notifications failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to send bulk notifications');
    }
  };

  public sendMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { recipientId, conversationId, content, type, metadata } = req.body;
      const senderId = req.user?.id;

      if (!senderId || !recipientId || !content) {
        badRequestResponse(res, 'senderId, recipientId, and content are required');
        return;
      }

      const result = await this.notificationService.sendMessage({
        senderId, recipientId, conversationId, content, type: type || 'text', metadata
      });

      if (result.success) {
        successResponse(res, { messageId: result.messageId }, 'Message sent successfully', 201);
      } else {
        errorResponse(res, 'Failed to send message');
      }
    } catch (error) {
      logger.error('Send message failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to send message');
    }
  };

  public getUserNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { limit, offset, status, type } = req.query;

      if (!userId) {
        badRequestResponse(res, 'Authentication required');
        return;
      }

      const notifications = await this.notificationService.getUserNotifications(userId, {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        status: status as any,
        type: type as any
      });

      successResponse(res, { notifications }, 'Notifications retrieved successfully');
    } catch (error) {
      logger.error('Get user notifications failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to get notifications');
    }
  };

  public getUserMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const { conversationId } = req.params;
      const { limit, offset } = req.query;

      if (!userId) {
        badRequestResponse(res, 'Authentication required');
        return;
      }

      const messages = await this.notificationService.getUserMessages(userId, conversationId, {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      successResponse(res, { messages }, 'Messages retrieved successfully');
    } catch (error) {
      logger.error('Get user messages failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to get messages');
    }
  };

  public updatePreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const preferences = req.body;

      if (!userId) {
        badRequestResponse(res, 'Authentication required');
        return;
      }

      const result = await this.notificationService.updateUserPreferences({ userId, ...preferences });

      if (result.success) {
        successResponse(res, {}, 'Preferences updated successfully');
      } else {
        errorResponse(res, 'Failed to update preferences');
      }
    } catch (error) {
      logger.error('Update preferences failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to update preferences');
    }
  };

  public markAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id;

      if (!userId || !notificationId) {
        badRequestResponse(res, 'Authentication and notification ID required');
        return;
      }

      const result = await this.notificationService.markNotificationAsRead(notificationId, userId);

      if (result.success) {
        successResponse(res, {}, 'Notification marked as read');
      } else {
        errorResponse(res, 'Failed to mark notification as read');
      }
    } catch (error) {
      logger.error('Mark as read failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Failed to mark notification as read');
    }
  };

  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const health = await this.notificationService.healthCheck();

      if (health.status === 'healthy') {
        successResponse(res, health, 'Notification service is healthy');
      } else {
        errorResponse(res, 'Notification service is unhealthy', 503, health);
      }
    } catch (error) {
      logger.error('Notification service health check failed', {
        component: 'NotificationController',
        error: error instanceof Error ? error.message : String(error)
      });
      errorResponse(res, 'Notification service is unhealthy', 503);
    }
  };
}

export default NotificationController;

