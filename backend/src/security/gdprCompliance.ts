import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { CacheService } from '../infrastructure/cache/cacheService';
import { QueueService } from '../infrastructure/queue/queueService';

export interface DataCategory {
  name: string;
  description: string;
  personalData: boolean;
  sensitiveData: boolean;
  retentionPeriod: number; // days
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  canBeAnonymized: boolean;
  automaticDeletion: boolean;
}

export interface ConsentRecord {
  userId: string;
  purpose: string;
  granted: boolean;
  timestamp: Date;
  version: string;
  ipAddress?: string;
  userAgent?: string;
  method: 'explicit' | 'implicit' | 'pre_ticked' | 'opt_out';
  source: string;
}

export interface DataProcessingRecord {
  userId: string;
  dataCategory: string;
  purpose: string;
  processor: string;
  timestamp: Date;
  legalBasis: string;
  retentionUntil?: Date;
  anonymized: boolean;
}

export interface DataSubjectRequest {
  id: string;
  userId: string;
  email: string;
  requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestDate: Date;
  completionDate?: Date;
  details: string;
  documents: string[];
  rejectionReason?: string;
  processedBy?: string;
}

export interface PrivacySettings {
  userId: string;
  marketingEmails: boolean;
  analyticsTracking: boolean;
  functionalCookies: boolean;
  performanceCookies: boolean;
  targetingCookies: boolean;
  dataSharing: boolean;
  profileVisibility: 'public' | 'private' | 'friends';
  searchEngineIndexing: boolean;
  dataRetention: 'minimum' | 'standard' | 'extended';
  updatedAt: Date;
}

export interface GDPRReport {
  period: { start: Date; end: Date };
  consentMetrics: {
    totalConsents: number;
    grantedConsents: number;
    revokedConsents: number;
    consentRate: number;
  };
  dataRequests: {
    total: number;
    byType: Record<string, number>;
    averageProcessingTime: number;
    completionRate: number;
  };
  dataRetention: {
    recordsScheduledForDeletion: number;
    recordsDeleted: number;
    anonymizedRecords: number;
  };
  breaches: {
    total: number;
    severity: Record<string, number>;
    reportedToAuthorities: number;
  };
}

export class GDPRCompliance {
  private prisma: PrismaClient;
  private cacheService: CacheService;
  private queueService: QueueService;
  private dataCategories: Map<string, DataCategory> = new Map();
  private consentRecords: Map<string, ConsentRecord[]> = new Map();
  private processingRecords: Map<string, DataProcessingRecord[]> = new Map();
  private dataRequests: Map<string, DataSubjectRequest> = new Map();

  constructor(
    prisma: PrismaClient,
    cacheService: CacheService,
    queueService: QueueService
  ) {
    this.prisma = prisma;
    this.cacheService = cacheService;
    this.queueService = queueService;

    this.initializeDataCategories();
    this.startDataRetentionScheduler();

    logger.info('GDPR Compliance service initialized', {
      component: 'GDPRCompliance',
      dataCategories: this.dataCategories.size
    });
  }

  /**
   * Initialize data categories
   */
  private initializeDataCategories(): void {
    const categories: DataCategory[] = [
      {
        name: 'user_profile',
        description: 'Basic user profile information',
        personalData: true,
        sensitiveData: false,
        retentionPeriod: 2555, // 7 years
        legalBasis: 'contract',
        canBeAnonymized: true,
        automaticDeletion: false
      },
      {
        name: 'authentication',
        description: 'Login credentials and authentication data',
        personalData: true,
        sensitiveData: true,
        retentionPeriod: 2555, // 7 years
        legalBasis: 'contract',
        canBeAnonymized: false,
        automaticDeletion: false
      },
      {
        name: 'game_activity',
        description: 'Game performance and activity data',
        personalData: true,
        sensitiveData: false,
        retentionPeriod: 1095, // 3 years
        legalBasis: 'legitimate_interests',
        canBeAnonymized: true,
        automaticDeletion: true
      },
      {
        name: 'analytics',
        description: 'Usage analytics and behavioral data',
        personalData: true,
        sensitiveData: false,
        retentionPeriod: 730, // 2 years
        legalBasis: 'consent',
        canBeAnonymized: true,
        automaticDeletion: true
      },
      {
        name: 'communication',
        description: 'Messages and communication logs',
        personalData: true,
        sensitiveData: false,
        retentionPeriod: 365, // 1 year
        legalBasis: 'contract',
        canBeAnonymized: true,
        automaticDeletion: true
      },
      {
        name: 'marketing',
        description: 'Marketing preferences and data',
        personalData: true,
        sensitiveData: false,
        retentionPeriod: 1095, // 3 years
        legalBasis: 'consent',
        canBeAnonymized: true,
        automaticDeletion: true
      },
      {
        name: 'technical_logs',
        description: 'System logs and technical data',
        personalData: true,
        sensitiveData: false,
        retentionPeriod: 180, // 6 months
        legalBasis: 'legitimate_interests',
        canBeAnonymized: true,
        automaticDeletion: true
      }
    ];

    categories.forEach(category => {
      this.dataCategories.set(category.name, category);
    });
  }

  /**
   * Record user consent
   */
  async recordConsent(consent: ConsentRecord): Promise<boolean> {
    try {
      // Store consent record
      const userConsents = this.consentRecords.get(consent.userId) || [];
      userConsents.push(consent);
      this.consentRecords.set(consent.userId, userConsents);

      // Cache consent for quick access
      await this.cacheService.set(
        `consent:${consent.userId}:${consent.purpose}`,
        consent,
        { namespace: 'gdpr', ttl: 86400 }
      );

      // Store in database
      await this.prisma.$executeRaw`
        INSERT INTO consent_records (user_id, purpose, granted, timestamp, version, ip_address, user_agent, method, source)
        VALUES (${consent.userId}, ${consent.purpose}, ${consent.granted}, ${consent.timestamp}, ${consent.version}, 
                ${consent.ipAddress}, ${consent.userAgent}, ${consent.method}, ${consent.source})
      `;

      // Log data processing
      await this.recordDataProcessing({
        userId: consent.userId,
        dataCategory: 'consent',
        purpose: consent.purpose,
        processor: 'consent_manager',
        timestamp: new Date(),
        legalBasis: 'consent',
        anonymized: false
      });

      logger.info('Consent recorded', {
        component: 'GDPRCompliance',
        userId: consent.userId,
        purpose: consent.purpose,
        granted: consent.granted
      });

      return true;
    } catch (error) {
      logger.error('Failed to record consent', {
        component: 'GDPRCompliance',
        userId: consent.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check if user has given consent
   */
  async hasConsent(userId: string, purpose: string): Promise<boolean> {
    try {
      // Check cache first
      const cachedConsent = await this.cacheService.get<ConsentRecord>(
        `consent:${userId}:${purpose}`,
        { namespace: 'gdpr' }
      );

      if (cachedConsent) {
        return cachedConsent.granted;
      }

      // Check database
      const result = await this.prisma.$queryRaw`
        SELECT granted FROM consent_records 
        WHERE user_id = ${userId} AND purpose = ${purpose}
        ORDER BY timestamp DESC
        LIMIT 1
      ` as any[];

      const hasConsent = result.length > 0 ? result[0].granted : false;

      // Cache result
      if (result.length > 0) {
        await this.cacheService.set(
          `consent:${userId}:${purpose}`,
          { granted: hasConsent },
          { namespace: 'gdpr', ttl: 3600 }
        );
      }

      return hasConsent;
    } catch (error) {
      logger.error('Failed to check consent', {
        component: 'GDPRCompliance',
        userId,
        purpose,
        error: error instanceof Error ? error.message : String(error)
      });
      return false; // Default to no consent for safety
    }
  }

  /**
   * Revoke consent
   */
  async revokeConsent(userId: string, purpose: string, source: string): Promise<boolean> {
    try {
      const revokeRecord: ConsentRecord = {
        userId,
        purpose,
        granted: false,
        timestamp: new Date(),
        version: '1.0',
        method: 'explicit',
        source
      };

      return await this.recordConsent(revokeRecord);
    } catch (error) {
      logger.error('Failed to revoke consent', {
        component: 'GDPRCompliance',
        userId,
        purpose,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Record data processing activity
   */
  async recordDataProcessing(record: DataProcessingRecord): Promise<boolean> {
    try {
      const userRecords = this.processingRecords.get(record.userId) || [];
      userRecords.push(record);
      this.processingRecords.set(record.userId, userRecords);

      // Store in database
      await this.prisma.$executeRaw`
        INSERT INTO data_processing_records (user_id, data_category, purpose, processor, timestamp, legal_basis, retention_until, anonymized)
        VALUES (${record.userId}, ${record.dataCategory}, ${record.purpose}, ${record.processor}, 
                ${record.timestamp}, ${record.legalBasis}, ${record.retentionUntil}, ${record.anonymized})
      `;

      return true;
    } catch (error) {
      logger.error('Failed to record data processing', {
        component: 'GDPRCompliance',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Submit data subject request
   */
  async submitDataSubjectRequest(request: Omit<DataSubjectRequest, 'id' | 'status' | 'requestDate'>): Promise<string> {
    try {
      const requestId = this.generateRequestId();
      const dataRequest: DataSubjectRequest = {
        ...request,
        id: requestId,
        status: 'pending',
        requestDate: new Date()
      };

      this.dataRequests.set(requestId, dataRequest);

      // Store in database
      await this.prisma.$executeRaw`
        INSERT INTO data_subject_requests (id, user_id, email, request_type, status, request_date, details, documents)
        VALUES (${requestId}, ${request.userId}, ${request.email}, ${request.requestType}, 
                'pending', ${dataRequest.requestDate}, ${request.details}, ${JSON.stringify(request.documents)})
      `;

      // Queue for processing
      await this.queueService.addJob('gdpr', 'processDataSubjectRequest', { requestId }, { priority: 5 });

      // Auto-complete certain request types if possible
      if (request.requestType === 'access') {
        await this.processAccessRequest(requestId);
      }

      logger.info('Data subject request submitted', {
        component: 'GDPRCompliance',
        requestId,
        userId: request.userId,
        type: request.requestType
      });

      return requestId;
    } catch (error) {
      logger.error('Failed to submit data subject request', {
        component: 'GDPRCompliance',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Process access request (Right to Access - Article 15)
   */
  async processAccessRequest(requestId: string): Promise<boolean> {
    try {
      const request = this.dataRequests.get(requestId);
      if (!request || request.requestType !== 'access') {
        return false;
      }

      // Update status
      request.status = 'processing';
      this.dataRequests.set(requestId, request);

      // Collect user data
      const userData = await this.collectUserData(request.userId);

      // Generate data export
      const exportData = {
        exportDate: new Date().toISOString(),
        userId: request.userId,
        personalData: userData,
        consentRecords: this.consentRecords.get(request.userId) || [],
        processingRecords: this.processingRecords.get(request.userId) || [],
        dataCategories: Array.from(this.dataCategories.values()),
        retentionPolicies: this.getRetentionPolicies()
      };

      // Store export file (in real implementation, would be a secure file)
      const exportId = `export_${requestId}_${Date.now()}`;
      await this.cacheService.set(
        `data_export:${exportId}`,
        exportData,
        { namespace: 'gdpr', ttl: 2592000 } // 30 days
      );

      // Complete request
      request.status = 'completed';
      request.completionDate = new Date();
      request.documents = [`data_export_${exportId}.json`];
      this.dataRequests.set(requestId, request);

      // Update database
      await this.prisma.$executeRaw`
        UPDATE data_subject_requests 
        SET status = 'completed', completion_date = ${request.completionDate}, documents = ${JSON.stringify(request.documents)}
        WHERE id = ${requestId}
      `;

      logger.info('Access request processed', {
        component: 'GDPRCompliance',
        requestId,
        userId: request.userId,
        exportId
      });

      return true;
    } catch (error) {
      logger.error('Failed to process access request', {
        component: 'GDPRCompliance',
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Process erasure request (Right to Erasure - Article 17)
   */
  async processErasureRequest(requestId: string): Promise<boolean> {
    try {
      const request = this.dataRequests.get(requestId);
      if (!request || request.requestType !== 'erasure') {
        return false;
      }

      // Check if erasure is legally permissible
      const canErase = await this.canEraseUserData(request.userId);
      if (!canErase.allowed) {
        request.status = 'rejected';
        request.rejectionReason = canErase.reason;
        request.completionDate = new Date();
        this.dataRequests.set(requestId, request);
        return false;
      }

      // Update status
      request.status = 'processing';
      this.dataRequests.set(requestId, request);

      // Perform data erasure
      const erasureResult = await this.eraseUserData(request.userId);

      // Complete request
      request.status = 'completed';
      request.completionDate = new Date();
      request.documents = [`erasure_report_${Date.now()}.json`];
      this.dataRequests.set(requestId, request);

      logger.info('Erasure request processed', {
        component: 'GDPRCompliance',
        requestId,
        userId: request.userId,
        recordsErased: erasureResult.recordsErased,
        recordsAnonymized: erasureResult.recordsAnonymized
      });

      return true;
    } catch (error) {
      logger.error('Failed to process erasure request', {
        component: 'GDPRCompliance',
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Collect all user data for access request
   */
  private async collectUserData(userId: string): Promise<any> {
    try {
      // Collect from various data sources
      const [user, gameHistory, questions, preferences] = await Promise.all([
        this.prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`,
        this.prisma.$queryRaw`SELECT * FROM game_participants WHERE user_id = ${userId}`,
        this.prisma.$queryRaw`SELECT * FROM questions WHERE created_by = ${userId}`,
        this.prisma.$queryRaw`SELECT * FROM user_preferences WHERE user_id = ${userId}`
      ]);

      return {
        profile: user,
        gameActivity: gameHistory,
        createdQuestions: questions,
        preferences: preferences,
        collectionDate: new Date()
      };
    } catch (error) {
      logger.error('Failed to collect user data', {
        component: 'GDPRCompliance',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }

  /**
   * Check if user data can be erased
   */
  private async canEraseUserData(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // Check for legal obligations that prevent erasure
      const activeContracts = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM user_subscriptions 
        WHERE user_id = ${userId} AND status = 'active'
      ` as any[];

      if (activeContracts[0].count > 0) {
        return {
          allowed: false,
          reason: 'User has active contracts that require data retention'
        };
      }

      // Check for ongoing legal proceedings
      const legalHolds = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM legal_holds 
        WHERE user_id = ${userId} AND status = 'active'
      ` as any[];

      if (legalHolds[0].count > 0) {
        return {
          allowed: false,
          reason: 'Data subject to legal hold'
        };
      }

      // Check for accounting/tax obligations
      const recentTransactions = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM transactions 
        WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '7 years'
      ` as any[];

      if (recentTransactions[0].count > 0) {
        return {
          allowed: false,
          reason: 'Financial records must be retained for tax purposes'
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('Failed to check erasure eligibility', {
        component: 'GDPRCompliance',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        allowed: false,
        reason: 'Unable to verify erasure eligibility'
      };
    }
  }

  /**
   * Erase user data
   */
  private async eraseUserData(userId: string): Promise<{
    recordsErased: number;
    recordsAnonymized: number;
    tablesAffected: string[];
  }> {
    let recordsErased = 0;
    let recordsAnonymized = 0;
    const tablesAffected: string[] = [];

    try {
      // Start transaction
      await this.prisma.$transaction(async (tx) => {
        // Delete directly erasable data
        const deleteOperations = [
          { table: 'user_preferences', query: `DELETE FROM user_preferences WHERE user_id = '${userId}'` },
          { table: 'user_sessions', query: `DELETE FROM user_sessions WHERE user_id = '${userId}'` },
          { table: 'notification_preferences', query: `DELETE FROM notification_preferences WHERE user_id = '${userId}'` },
          { table: 'user_activity_logs', query: `DELETE FROM user_activity_logs WHERE user_id = '${userId}'` }
        ];

        for (const operation of deleteOperations) {
          try {
            const result = await tx.$executeRawUnsafe(operation.query);
            if (result > 0) {
              recordsErased += result;
              tablesAffected.push(operation.table);
            }
          } catch (error) {
            logger.warn('Failed to delete from table', {
              component: 'GDPRCompliance',
              table: operation.table,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        // Anonymize data that needs to be retained
        const anonymizeOperations = [
          {
            table: 'questions',
            query: `UPDATE questions SET created_by = NULL, creator_name = 'Anonymous User' WHERE created_by = '${userId}'`
          },
          {
            table: 'game_participants',
            query: `UPDATE game_participants SET user_name = 'Anonymous User' WHERE user_id = '${userId}'`
          },
          {
            table: 'user_answers',
            query: `UPDATE user_answers SET user_id = NULL WHERE user_id = '${userId}'`
          }
        ];

        for (const operation of anonymizeOperations) {
          try {
            const result = await tx.$executeRawUnsafe(operation.query);
            if (result > 0) {
              recordsAnonymized += result;
              tablesAffected.push(operation.table);
            }
          } catch (error) {
            logger.warn('Failed to anonymize table', {
              component: 'GDPRCompliance',
              table: operation.table,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        // Finally, delete or anonymize user record
        await tx.$executeRawUnsafe(`
          UPDATE users 
          SET email = 'deleted@example.com', 
              username = 'deleted_user_${userId.substring(0, 8)}',
              first_name = 'Deleted',
              last_name = 'User',
              deleted_at = NOW()
          WHERE id = '${userId}'
        `);

        recordsAnonymized += 1;
        tablesAffected.push('users');
      });

      // Clear all caches for this user
      await this.clearUserCaches(userId);

      // Record the erasure
      await this.recordDataProcessing({
        userId,
        dataCategory: 'erasure',
        purpose: 'data_subject_request',
        processor: 'gdpr_compliance',
        timestamp: new Date(),
        legalBasis: 'legal_obligation',
        anonymized: true
      });

      return { recordsErased, recordsAnonymized, tablesAffected };
    } catch (error) {
      logger.error('Failed to erase user data', {
        component: 'GDPRCompliance',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Clear user caches after erasure
   */
  private async clearUserCaches(userId: string): Promise<void> {
    const cacheKeys = [
      `user:${userId}`,
      `consent:${userId}`,
      `preferences:${userId}`,
      `session:${userId}`,
      `game_state:*:${userId}`
    ];

    for (const key of cacheKeys) {
      try {
        if (key.includes('*')) {
          // Handle wildcard patterns
          const namespace = key.split(':')[0];
          await this.cacheService.clearNamespace(namespace);
        } else {
          await this.cacheService.del(key);
        }
      } catch (error) {
        logger.warn('Failed to clear cache', {
          component: 'GDPRCompliance',
          key,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Start data retention scheduler
   */
  private startDataRetentionScheduler(): void {
    // Run daily at 2 AM
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        await this.runDataRetentionCleanup();
      }
    }, 60 * 1000); // Check every minute
  }

  /**
   * Run data retention cleanup
   */
  async runDataRetentionCleanup(): Promise<{
    recordsDeleted: number;
    recordsAnonymized: number;
    categoriesProcessed: number;
  }> {
    let recordsDeleted = 0;
    let recordsAnonymized = 0;
    let categoriesProcessed = 0;

    try {
      logger.info('Starting data retention cleanup', { component: 'GDPRCompliance' });

      for (const [categoryName, category] of this.dataCategories.entries()) {
        if (!category.automaticDeletion) continue;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - category.retentionPeriod);

        try {
          // Find expired records
          const expiredRecords = await this.prisma.$queryRaw`
            SELECT user_id FROM data_processing_records 
            WHERE data_category = ${categoryName} 
            AND timestamp < ${cutoffDate}
            AND anonymized = false
          ` as any[];

          for (const record of expiredRecords) {
            if (category.canBeAnonymized) {
              // Anonymize the data
              await this.anonymizeUserData(record.user_id, categoryName);
              recordsAnonymized++;
            } else {
              // Delete the data
              await this.deleteUserDataByCategory(record.user_id, categoryName);
              recordsDeleted++;
            }
          }

          categoriesProcessed++;
        } catch (error) {
          logger.error('Failed to process retention for category', {
            component: 'GDPRCompliance',
            category: categoryName,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logger.info('Data retention cleanup completed', {
        component: 'GDPRCompliance',
        recordsDeleted,
        recordsAnonymized,
        categoriesProcessed
      });

      return { recordsDeleted, recordsAnonymized, categoriesProcessed };
    } catch (error) {
      logger.error('Data retention cleanup failed', {
        component: 'GDPRCompliance',
        error: error instanceof Error ? error.message : String(error)
      });
      return { recordsDeleted: 0, recordsAnonymized: 0, categoriesProcessed: 0 };
    }
  }

  /**
   * Anonymize user data by category
   */
  private async anonymizeUserData(userId: string, category: string): Promise<void> {
    // Implementation would depend on specific data category
    // This is a simplified version
    await this.prisma.$executeRaw`
      UPDATE data_processing_records 
      SET anonymized = true, user_id = 'anonymous'
      WHERE user_id = ${userId} AND data_category = ${category}
    `;
  }

  /**
   * Delete user data by category
   */
  private async deleteUserDataByCategory(userId: string, category: string): Promise<void> {
    // Implementation would depend on specific data category
    await this.prisma.$executeRaw`
      DELETE FROM data_processing_records 
      WHERE user_id = ${userId} AND data_category = ${category}
    `;
  }

  /**
   * Generate GDPR compliance report
   */
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<GDPRReport> {
    try {
      const [consentStats, requestStats, retentionStats] = await Promise.all([
        this.getConsentStatistics(startDate, endDate),
        this.getDataRequestStatistics(startDate, endDate),
        this.getRetentionStatistics(startDate, endDate)
      ]);

      return {
        period: { start: startDate, end: endDate },
        consentMetrics: consentStats,
        dataRequests: requestStats,
        dataRetention: retentionStats,
        breaches: {
          total: 0, // Would be tracked separately
          severity: {},
          reportedToAuthorities: 0
        }
      };
    } catch (error) {
      logger.error('Failed to generate GDPR compliance report', {
        component: 'GDPRCompliance',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get consent statistics
   */
  private async getConsentStatistics(startDate: Date, endDate: Date): Promise<{
    totalConsents: number;
    grantedConsents: number;
    revokedConsents: number;
    consentRate: number;
  }> {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_consents,
        COUNT(CASE WHEN granted = true THEN 1 END) as granted_consents,
        COUNT(CASE WHEN granted = false THEN 1 END) as revoked_consents
      FROM consent_records 
      WHERE timestamp BETWEEN ${startDate} AND ${endDate}
    ` as any[];

    const result = stats[0];
    return {
      totalConsents: parseInt(result.total_consents),
      grantedConsents: parseInt(result.granted_consents),
      revokedConsents: parseInt(result.revoked_consents),
      consentRate: result.total_consents > 0 
        ? (result.granted_consents / result.total_consents) * 100 
        : 0
    };
  }

  /**
   * Get data request statistics
   */
  private async getDataRequestStatistics(startDate: Date, endDate: Date): Promise<{
    total: number;
    byType: Record<string, number>;
    averageProcessingTime: number;
    completionRate: number;
  }> {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        request_type,
        COUNT(*) as count,
        AVG(EXTRACT(DAY FROM (completion_date - request_date))) as avg_processing_days
      FROM data_subject_requests 
      WHERE request_date BETWEEN ${startDate} AND ${endDate}
      GROUP BY request_type
    ` as any[];

    const byType: Record<string, number> = {};
    let totalRequests = 0;
    let totalProcessingTime = 0;

    stats.forEach((row: any) => {
      byType[row.request_type] = parseInt(row.count);
      totalRequests += parseInt(row.count);
      totalProcessingTime += parseFloat(row.avg_processing_days) || 0;
    });

    const completedRequests = await this.prisma.$queryRaw`
      SELECT COUNT(*) as completed
      FROM data_subject_requests 
      WHERE request_date BETWEEN ${startDate} AND ${endDate}
      AND status = 'completed'
    ` as any[];

    return {
      total: totalRequests,
      byType,
      averageProcessingTime: stats.length > 0 ? totalProcessingTime / stats.length : 0,
      completionRate: totalRequests > 0 
        ? (parseInt(completedRequests[0].completed) / totalRequests) * 100 
        : 0
    };
  }

  /**
   * Get retention statistics
   */
  private async getRetentionStatistics(startDate: Date, endDate: Date): Promise<{
    recordsScheduledForDeletion: number;
    recordsDeleted: number;
    anonymizedRecords: number;
  }> {
    // This would track retention cleanup activities
    return {
      recordsScheduledForDeletion: 0,
      recordsDeleted: 0,
      anonymizedRecords: 0
    };
  }

  /**
   * Get retention policies
   */
  private getRetentionPolicies(): Record<string, any> {
    const policies: Record<string, any> = {};
    
    this.dataCategories.forEach((category, name) => {
      policies[name] = {
        retentionPeriod: category.retentionPeriod,
        legalBasis: category.legalBasis,
        canBeAnonymized: category.canBeAnonymized,
        automaticDeletion: category.automaticDeletion
      };
    });

    return policies;
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `GDPR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get user privacy dashboard data
   */
  async getUserPrivacyDashboard(userId: string): Promise<{
    consents: ConsentRecord[];
    processingActivities: DataProcessingRecord[];
    dataRequests: DataSubjectRequest[];
    retentionInfo: Record<string, { retentionPeriod: number; scheduledDeletion?: Date }>;
  }> {
    try {
      const consents = this.consentRecords.get(userId) || [];
      const processingActivities = this.processingRecords.get(userId) || [];
      const dataRequests = Array.from(this.dataRequests.values()).filter(req => req.userId === userId);
      
      // Calculate retention info
      const retentionInfo: Record<string, { retentionPeriod: number; scheduledDeletion?: Date }> = {};
      
      this.dataCategories.forEach((category, name) => {
        retentionInfo[name] = {
          retentionPeriod: category.retentionPeriod,
          scheduledDeletion: category.automaticDeletion 
            ? new Date(Date.now() + category.retentionPeriod * 24 * 60 * 60 * 1000)
            : undefined
        };
      });

      return {
        consents,
        processingActivities,
        dataRequests,
        retentionInfo
      };
    } catch (error) {
      logger.error('Failed to get user privacy dashboard', {
        component: 'GDPRCompliance',
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get compliance statistics
   */
  getComplianceStats(): {
    dataCategories: number;
    activeConsents: number;
    pendingRequests: number;
    completedRequests: number;
    scheduledRetentions: number;
  } {
    const pendingRequests = Array.from(this.dataRequests.values()).filter(req => req.status === 'pending').length;
    const completedRequests = Array.from(this.dataRequests.values()).filter(req => req.status === 'completed').length;
    
    return {
      dataCategories: this.dataCategories.size,
      activeConsents: Array.from(this.consentRecords.values()).flat().filter(consent => consent.granted).length,
      pendingRequests,
      completedRequests,
      scheduledRetentions: Array.from(this.dataCategories.values()).filter(cat => cat.automaticDeletion).length
    };
  }
}

export default GDPRCompliance;

