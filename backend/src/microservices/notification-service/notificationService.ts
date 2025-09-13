import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { generateSecureToken } from '../../utils/crypto';

interface NotificationData {
  userId: string;
  type: 'email' | 'push' | 'in_app' | 'sms';
  title: string;
  message: string;
  data?: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  scheduledAt?: Date;
  expiresAt?: Date;
}

interface BulkNotificationData {
  userIds: string[];
  type: 'email' | 'push' | 'in_app' | 'sms';
  title: string;
  message: string;
  data?: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  scheduledAt?: Date;
}

interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  smsEnabled: boolean;
  categories: {
    gameInvites: boolean;
    achievements: boolean;
    reminders: boolean;
    announcements: boolean;
    socialActivity: boolean;
  };
  quietHours?: {
    enabled: boolean;
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    timezone: string;
  };
}

interface MessageData {
  senderId: string;
  recipientId: string;
  conversationId?: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  metadata?: Record<string, any>;
}

interface ConversationData {
  participants: string[];
  name?: string;
  type: 'direct' | 'group' | 'system';
  metadata?: Record<string, any>;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
  emailService: 'operational' | 'degraded' | 'down';
  pushService: 'operational' | 'degraded' | 'down';
  smsService: 'operational' | 'degraded' | 'down';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  metrics: {
    notificationsSentToday: number;
    messagesSentToday: number;
    activeConversations: number;
    averageDeliveryTime: number;
  };
}

export class NotificationService {
  private prisma: PrismaClient;
  private notificationQueue: NotificationData[] = [];
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 10000; // 10 seconds

  constructor() {
    this.prisma = new PrismaClient();
    this.startQueueProcessor();
  }

  /**
   * Send notification to a single user
   */
  async sendNotification(notificationData: NotificationData): Promise<{ success: boolean; notificationId?: string }> {
    try {
      // Check user preferences
      const preferences = await this.getUserPreferences(notificationData.userId);
      if (!this.shouldSendNotification(notificationData, preferences)) {
        logger.info('Notification skipped due to user preferences', {
          component: 'NotificationService',
          userId: notificationData.userId,
          type: notificationData.type
        });
        return { success: false };
      }

      const notification = {
        id: generateSecureToken(16),
        ...notificationData,
        status: 'pending' as const,
        createdAt: new Date(),
        attempts: 0
      };

      // Store in database
      await this.prisma.notification.create({
        data: {
          id: notification.id,
          userId: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data as any,
          priority: notification.priority,
          status: notification.status,
          scheduledAt: notification.scheduledAt,
          expiresAt: notification.expiresAt,
          attempts: notification.attempts
        }
      });

      // Add to queue for processing
      this.notificationQueue.push(notification);

      // Process immediately if urgent
      if (notification.priority === 'urgent') {
        await this.processNotification(notification);
      }

      logger.info('Notification queued successfully', {
        component: 'NotificationService',
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        priority: notification.priority
      });

      return { success: true, notificationId: notification.id };
    } catch (error) {
      logger.error('Failed to send notification', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        notificationData
      });
      return { success: false };
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(bulkData: BulkNotificationData): Promise<{
    success: boolean;
    sent: number;
    failed: number;
    notificationIds: string[];
  }> {
    try {
      const results = {
        success: true,
        sent: 0,
        failed: 0,
        notificationIds: [] as string[]
      };

      // Process in batches to avoid overwhelming the system
      const batchSize = Math.min(this.BATCH_SIZE, bulkData.userIds.length);
      
      for (let i = 0; i < bulkData.userIds.length; i += batchSize) {
        const batch = bulkData.userIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (userId) => {
          const result = await this.sendNotification({
            ...bulkData,
            userId,
            userIds: undefined as any
          });
          
          if (result.success && result.notificationId) {
            results.sent++;
            results.notificationIds.push(result.notificationId);
          } else {
            results.failed++;
          }
        });

        await Promise.allSettled(batchPromises);
      }

      logger.info('Bulk notifications processed', {
        component: 'NotificationService',
        totalUsers: bulkData.userIds.length,
        sent: results.sent,
        failed: results.failed
      });

      return results;
    } catch (error) {
      logger.error('Failed to send bulk notifications', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        userCount: bulkData.userIds.length
      });
      
      return {
        success: false,
        sent: 0,
        failed: bulkData.userIds.length,
        notificationIds: []
      };
    }
  }

  /**
   * Send message between users
   */
  async sendMessage(messageData: MessageData): Promise<{ success: boolean; messageId?: string }> {
    try {
      const message = {
        id: generateSecureToken(16),
        ...messageData,
        timestamp: new Date(),
        status: 'sent' as const
      };

      // Create or find conversation
      let conversationId = messageData.conversationId;
      if (!conversationId) {
        const conversation = await this.createConversation({
          participants: [messageData.senderId, messageData.recipientId],
          type: 'direct'
        });
        conversationId = conversation.conversationId;
      }

      // Store message
      await this.prisma.message.create({
        data: {
          id: message.id,
          senderId: message.senderId,
          recipientId: message.recipientId,
          conversationId: conversationId!,
          content: message.content,
          type: message.type,
          metadata: message.metadata as any,
          status: message.status,
          timestamp: message.timestamp
        }
      });

      // Send real-time notification to recipient
      await this.sendNotification({
        userId: messageData.recipientId,
        type: 'in_app',
        title: 'New Message',
        message: `You have a new message from ${messageData.senderId}`,
        data: {
          messageId: message.id,
          conversationId,
          senderId: messageData.senderId
        },
        priority: 'normal'
      });

      logger.info('Message sent successfully', {
        component: 'NotificationService',
        messageId: message.id,
        senderId: messageData.senderId,
        recipientId: messageData.recipientId,
        conversationId
      });

      return { success: true, messageId: message.id };
    } catch (error) {
      logger.error('Failed to send message', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        messageData
      });
      return { success: false };
    }
  }

  /**
   * Create conversation
   */
  async createConversation(conversationData: ConversationData): Promise<{ success: boolean; conversationId?: string }> {
    try {
      const conversation = {
        id: generateSecureToken(16),
        ...conversationData,
        createdAt: new Date()
      };

      await this.prisma.conversation.create({
        data: {
          id: conversation.id,
          participants: conversation.participants,
          name: conversation.name,
          type: conversation.type,
          metadata: conversation.metadata as any,
          createdAt: conversation.createdAt
        }
      });

      logger.info('Conversation created successfully', {
        component: 'NotificationService',
        conversationId: conversation.id,
        participants: conversation.participants.length,
        type: conversation.type
      });

      return { success: true, conversationId: conversation.id };
    } catch (error) {
      logger.error('Failed to create conversation', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        conversationData
      });
      return { success: false };
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
      type?: 'email' | 'push' | 'in_app' | 'sms';
    } = {}
  ): Promise<any[]> {
    try {
      const { limit = 50, offset = 0, status, type } = options;

      const where: any = { userId };
      if (status) where.status = status;
      if (type) where.type = type;

      const notifications = await this.prisma.notification.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' }
      });

      return notifications;
    } catch (error) {
      logger.error('Failed to get user notifications', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return [];
    }
  }

  /**
   * Get user messages
   */
  async getUserMessages(
    userId: string,
    conversationId?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<any[]> {
    try {
      const { limit = 50, offset = 0 } = options;

      const where: any = {
        OR: [
          { senderId: userId },
          { recipientId: userId }
        ]
      };

      if (conversationId) {
        where.conversationId = conversationId;
      }

      const messages = await this.prisma.message.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { timestamp: 'desc' }
      });

      return messages;
    } catch (error) {
      logger.error('Failed to get user messages', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        userId,
        conversationId
      });
      return [];
    }
  }

  /**
   * Update notification preferences
   */
  async updateUserPreferences(preferences: NotificationPreferences): Promise<{ success: boolean }> {
    try {
      await this.prisma.notificationPreference.upsert({
        where: { userId: preferences.userId },
        update: {
          emailEnabled: preferences.emailEnabled,
          pushEnabled: preferences.pushEnabled,
          inAppEnabled: preferences.inAppEnabled,
          smsEnabled: preferences.smsEnabled,
          categories: preferences.categories as any,
          quietHours: preferences.quietHours as any
        },
        create: {
          userId: preferences.userId,
          emailEnabled: preferences.emailEnabled,
          pushEnabled: preferences.pushEnabled,
          inAppEnabled: preferences.inAppEnabled,
          smsEnabled: preferences.smsEnabled,
          categories: preferences.categories as any,
          quietHours: preferences.quietHours as any
        }
      });

      logger.info('Notification preferences updated', {
        component: 'NotificationService',
        userId: preferences.userId
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to update notification preferences', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        userId: preferences.userId
      });
      return { success: false };
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string, userId: string): Promise<{ success: boolean }> {
    try {
      await this.prisma.notification.update({
        where: {
          id: notificationId,
          userId: userId
        },
        data: {
          status: 'read',
          readAt: new Date()
        }
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        notificationId,
        userId
      });
      return { success: false };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;

      // Calculate metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [notificationsToday, messagesToday, activeConversations] = await Promise.all([
        this.prisma.notification.count({
          where: { createdAt: { gte: today } }
        }),
        this.prisma.message.count({
          where: { timestamp: { gte: today } }
        }),
        this.prisma.conversation.count({
          where: {
            messages: {
              some: {
                timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
              }
            }
          }
        })
      ]);

      return {
        status: 'healthy',
        database: 'connected',
        emailService: 'operational',
        pushService: 'operational',
        smsService: 'operational',
        timestamp: new Date().toISOString(),
        service: 'notification-service',
        version: '1.0.0',
        uptime: process.uptime(),
        metrics: {
          notificationsSentToday: notificationsToday,
          messagesSentToday: messagesToday,
          activeConversations,
          averageDeliveryTime: 250 // Mock value in milliseconds
        }
      };
    } catch (error) {
      logger.error('Notification service health check failed', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        database: 'disconnected',
        emailService: 'down',
        pushService: 'down',
        smsService: 'down',
        timestamp: new Date().toISOString(),
        service: 'notification-service',
        version: '1.0.0',
        uptime: process.uptime(),
        metrics: {
          notificationsSentToday: 0,
          messagesSentToday: 0,
          activeConversations: 0,
          averageDeliveryTime: 0
        }
      };
    }
  }

  /**
   * Get user notification preferences
   */
  private async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const preferences = await this.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      if (!preferences) return null;

      return {
        userId: preferences.userId,
        emailEnabled: preferences.emailEnabled,
        pushEnabled: preferences.pushEnabled,
        inAppEnabled: preferences.inAppEnabled,
        smsEnabled: preferences.smsEnabled,
        categories: preferences.categories as any,
        quietHours: preferences.quietHours as any
      };
    } catch (error) {
      logger.warn('Failed to get user preferences', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      return null;
    }
  }

  /**
   * Check if notification should be sent based on preferences
   */
  private shouldSendNotification(notification: NotificationData, preferences: NotificationPreferences | null): boolean {
    if (!preferences) return true; // Send if no preferences set

    // Check if notification type is enabled
    switch (notification.type) {
      case 'email':
        if (!preferences.emailEnabled) return false;
        break;
      case 'push':
        if (!preferences.pushEnabled) return false;
        break;
      case 'in_app':
        if (!preferences.inAppEnabled) return false;
        break;
      case 'sms':
        if (!preferences.smsEnabled) return false;
        break;
    }

    // Check quiet hours
    if (preferences.quietHours?.enabled && notification.priority !== 'urgent') {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (currentTime >= preferences.quietHours.startTime && currentTime <= preferences.quietHours.endTime) {
        return false;
      }
    }

    return true;
  }

  /**
   * Process a single notification
   */
  private async processNotification(notification: NotificationData): Promise<void> {
    try {
      // Mock implementation - would integrate with actual services
      switch (notification.type) {
        case 'email':
          await this.sendEmail(notification);
          break;
        case 'push':
          await this.sendPushNotification(notification);
          break;
        case 'in_app':
          await this.sendInAppNotification(notification);
          break;
        case 'sms':
          await this.sendSMS(notification);
          break;
      }

      // Update status to sent
      await this.prisma.notification.update({
        where: { id: (notification as any).id },
        data: {
          status: 'sent',
          sentAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to process notification', {
        component: 'NotificationService',
        error: error instanceof Error ? error.message : String(error),
        notificationId: (notification as any).id
      });

      // Update status to failed
      await this.prisma.notification.update({
        where: { id: (notification as any).id },
        data: {
          status: 'failed',
          attempts: { increment: 1 }
        }
      });
    }
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    setInterval(async () => {
      if (this.notificationQueue.length === 0) return;

      const batch = this.notificationQueue.splice(0, this.BATCH_SIZE);
      
      const processingPromises = batch.map(notification => 
        this.processNotification(notification).catch(error => {
          logger.error('Queue processing error', {
            component: 'NotificationService',
            error: error instanceof Error ? error.message : String(error),
            notificationId: (notification as any).id
          });
        })
      );

      await Promise.allSettled(processingPromises);
    }, this.FLUSH_INTERVAL);
  }

  // Mock service integrations
  private async sendEmail(notification: NotificationData): Promise<void> {
    // Mock email service integration
    logger.debug('Email sent (mock)', { userId: notification.userId, title: notification.title });
  }

  private async sendPushNotification(notification: NotificationData): Promise<void> {
    // Mock push service integration
    logger.debug('Push notification sent (mock)', { userId: notification.userId, title: notification.title });
  }

  private async sendInAppNotification(notification: NotificationData): Promise<void> {
    // Mock in-app notification (would use WebSockets)
    logger.debug('In-app notification sent (mock)', { userId: notification.userId, title: notification.title });
  }

  private async sendSMS(notification: NotificationData): Promise<void> {
    // Mock SMS service integration
    logger.debug('SMS sent (mock)', { userId: notification.userId, title: notification.title });
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default NotificationService;

