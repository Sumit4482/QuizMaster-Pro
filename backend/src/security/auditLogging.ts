import { Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { CacheService } from '../infrastructure/cache/cacheService';
import { QueueService } from '../infrastructure/queue/queueService';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  statusCode: number;
  responseTime: number;
  requestSize: number;
  responseSize: number;
  outcome: 'success' | 'failure' | 'error';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  category: 'authentication' | 'authorization' | 'data_access' | 'data_modification' | 'system' | 'security';
  details: Record<string, any>;
  geoLocation?: {
    country?: string;
    region?: string;
    city?: string;
    coordinates?: [number, number]; // [lat, lng]
  };
  deviceInfo?: {
    type: 'desktop' | 'mobile' | 'tablet' | 'bot';
    os?: string;
    browser?: string;
    version?: string;
  };
  tags: string[];
  correlationId?: string;
  parentEventId?: string;
  archived: boolean;
}

export interface AuditRule {
  id: string;
  name: string;
  description: string;
  conditions: {
    actions?: string[];
    resources?: string[];
    users?: string[];
    ipAddresses?: string[];
    statusCodes?: number[];
    riskLevels?: string[];
    categories?: string[];
  };
  enabled: boolean;
  retentionDays: number;
  alertOnMatch: boolean;
  alertSeverity?: 'low' | 'medium' | 'high' | 'critical';
  customFields?: Record<string, any>;
}

export interface AuditStats {
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  eventsByRiskLevel: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  topUsers: Array<{ userId: string; count: number }>;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  suspiciousActivities: number;
  failedLogins: number;
  dataBreaches: number;
  timeRange: { start: Date; end: Date };
}

export interface SecurityAlert {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'suspicious_activity' | 'data_breach' | 'authentication_failure' | 'privilege_escalation' | 'data_export' | 'system_compromise';
  title: string;
  description: string;
  events: string[]; // Event IDs that triggered this alert
  userId?: string;
  ipAddress?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  falsePositive: boolean;
}

export class AuditLogging {
  private prisma: PrismaClient;
  private cacheService: CacheService;
  private queueService: QueueService;
  private events: Map<string, AuditEvent> = new Map();
  private rules: Map<string, AuditRule> = new Map();
  private alerts: Map<string, SecurityAlert> = new Map();
  private eventBuffer: AuditEvent[] = [];
  private bufferSize = 100;
  private flushInterval = 30000; // 30 seconds

  constructor(
    prisma: PrismaClient,
    cacheService: CacheService,
    queueService: QueueService
  ) {
    this.prisma = prisma;
    this.cacheService = cacheService;
    this.queueService = queueService;

    this.initializeDefaultRules();
    this.startBufferFlush();

    logger.info('Audit Logging service initialized', {
      component: 'AuditLogging',
      bufferSize: this.bufferSize,
      flushInterval: this.flushInterval
    });
  }

  /**
   * Initialize default audit rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: AuditRule[] = [
      {
        id: 'authentication_events',
        name: 'Authentication Events',
        description: 'Log all authentication-related activities',
        conditions: {
          categories: ['authentication'],
          actions: ['login', 'logout', 'register', 'password_reset']
        },
        enabled: true,
        retentionDays: 2555, // 7 years for compliance
        alertOnMatch: false
      },
      {
        id: 'failed_authentication',
        name: 'Failed Authentication Attempts',
        description: 'Alert on multiple failed authentication attempts',
        conditions: {
          categories: ['authentication'],
          actions: ['login'],
          statusCodes: [401, 403]
        },
        enabled: true,
        retentionDays: 365,
        alertOnMatch: true,
        alertSeverity: 'high'
      },
      {
        id: 'data_access_high_risk',
        name: 'High-Risk Data Access',
        description: 'Log access to sensitive data',
        conditions: {
          categories: ['data_access'],
          riskLevels: ['high', 'critical'],
          resources: ['user', 'payment', 'personal_data']
        },
        enabled: true,
        retentionDays: 2555, // 7 years for compliance
        alertOnMatch: true,
        alertSeverity: 'medium'
      },
      {
        id: 'data_modification',
        name: 'Data Modification Events',
        description: 'Log all data modification activities',
        conditions: {
          categories: ['data_modification'],
          actions: ['create', 'update', 'delete']
        },
        enabled: true,
        retentionDays: 1095, // 3 years
        alertOnMatch: false
      },
      {
        id: 'privilege_escalation',
        name: 'Privilege Escalation Attempts',
        description: 'Alert on potential privilege escalation',
        conditions: {
          categories: ['authorization'],
          statusCodes: [403],
          riskLevels: ['high', 'critical']
        },
        enabled: true,
        retentionDays: 2555, // 7 years
        alertOnMatch: true,
        alertSeverity: 'critical'
      },
      {
        id: 'bulk_data_export',
        name: 'Bulk Data Export',
        description: 'Alert on large data exports',
        conditions: {
          actions: ['export', 'download'],
          categories: ['data_access']
        },
        enabled: true,
        retentionDays: 1095,
        alertOnMatch: true,
        alertSeverity: 'medium'
      },
      {
        id: 'admin_activities',
        name: 'Administrative Activities',
        description: 'Log all administrative actions',
        conditions: {
          categories: ['system'],
          actions: ['admin_login', 'user_management', 'system_config']
        },
        enabled: true,
        retentionDays: 2555, // 7 years
        alertOnMatch: false
      },
      {
        id: 'suspicious_geo_access',
        name: 'Suspicious Geographic Access',
        description: 'Alert on access from unusual locations',
        conditions: {
          categories: ['authentication', 'data_access']
        },
        enabled: true,
        retentionDays: 365,
        alertOnMatch: true,
        alertSeverity: 'medium'
      }
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });
  }

  /**
   * Log an audit event
   */
  async logEvent(eventData: Partial<AuditEvent>, req?: Request): Promise<string> {
    try {
      const eventId = this.generateEventId();
      
      const event: AuditEvent = {
        id: eventId,
        timestamp: new Date(),
        ipAddress: req?.ip || eventData.ipAddress || 'unknown',
        userAgent: req?.get('User-Agent') || eventData.userAgent,
        action: eventData.action || 'unknown',
        resource: eventData.resource || 'unknown',
        resourceId: eventData.resourceId,
        method: (req?.method as any) || eventData.method || 'GET',
        endpoint: req?.path || eventData.endpoint || 'unknown',
        statusCode: eventData.statusCode || 200,
        responseTime: eventData.responseTime || 0,
        requestSize: this.getRequestSize(req) || eventData.requestSize || 0,
        responseSize: eventData.responseSize || 0,
        outcome: eventData.outcome || 'success',
        riskLevel: eventData.riskLevel || this.calculateRiskLevel(eventData),
        category: eventData.category || this.determineCategory(eventData.action || ''),
        details: eventData.details || {},
        geoLocation: eventData.geoLocation || await this.getGeoLocation(req?.ip || eventData.ipAddress),
        deviceInfo: eventData.deviceInfo || this.getDeviceInfo(req?.get('User-Agent') || eventData.userAgent),
        tags: eventData.tags || [],
        userId: eventData.userId,
        sessionId: eventData.sessionId || this.extractSessionId(req),
        correlationId: eventData.correlationId || req?.headers['x-correlation-id'] as string,
        parentEventId: eventData.parentEventId,
        archived: false
      };

      // Add to buffer
      this.eventBuffer.push(event);
      this.events.set(eventId, event);

      // Check if buffer needs immediate flush
      if (this.eventBuffer.length >= this.bufferSize) {
        await this.flushBuffer();
      }

      // Check audit rules and generate alerts
      await this.processAuditRules(event);

      // Cache recent event for quick access
      await this.cacheService.set(
        `audit_event:${eventId}`,
        event,
        { namespace: 'audit', ttl: 3600 }
      );

      return eventId;
    } catch (error) {
      logger.error('Failed to log audit event', {
        component: 'AuditLogging',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Flush event buffer to persistent storage
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    try {
      const events = [...this.eventBuffer];
      this.eventBuffer = [];

      // Store events in database
      for (const event of events) {
        await this.prisma.$executeRaw`
          INSERT INTO audit_events (
            id, timestamp, user_id, session_id, ip_address, user_agent, action, resource, resource_id,
            method, endpoint, status_code, response_time, request_size, response_size, outcome,
            risk_level, category, details, geo_location, device_info, tags, correlation_id, parent_event_id, archived
          ) VALUES (
            ${event.id}, ${event.timestamp}, ${event.userId}, ${event.sessionId}, ${event.ipAddress},
            ${event.userAgent}, ${event.action}, ${event.resource}, ${event.resourceId}, ${event.method},
            ${event.endpoint}, ${event.statusCode}, ${event.responseTime}, ${event.requestSize}, ${event.responseSize},
            ${event.outcome}, ${event.riskLevel}, ${event.category}, ${JSON.stringify(event.details)},
            ${JSON.stringify(event.geoLocation)}, ${JSON.stringify(event.deviceInfo)}, ${JSON.stringify(event.tags)},
            ${event.correlationId}, ${event.parentEventId}, ${event.archived}
          )
        `;
      }

      logger.debug('Audit events flushed to database', {
        component: 'AuditLogging',
        count: events.length
      });
    } catch (error) {
      logger.error('Failed to flush audit events', {
        component: 'AuditLogging',
        error: error instanceof Error ? error.message : String(error),
        eventCount: this.eventBuffer.length
      });

      // Re-add events to buffer for retry
      this.eventBuffer = [...this.eventBuffer, ...events];
    }
  }

  /**
   * Start buffer flush interval
   */
  private startBufferFlush(): void {
    setInterval(async () => {
      await this.flushBuffer();
    }, this.flushInterval);
  }

  /**
   * Process audit rules and generate alerts
   */
  private async processAuditRules(event: AuditEvent): Promise<void> {
    for (const [ruleId, rule] of this.rules.entries()) {
      if (!rule.enabled) continue;

      if (this.matchesRule(event, rule)) {
        logger.debug('Audit rule matched', {
          component: 'AuditLogging',
          ruleId,
          eventId: event.id
        });

        if (rule.alertOnMatch) {
          await this.generateSecurityAlert(event, rule);
        }
      }
    }
  }

  /**
   * Check if event matches audit rule conditions
   */
  private matchesRule(event: AuditEvent, rule: AuditRule): boolean {
    const conditions = rule.conditions;

    if (conditions.actions && !conditions.actions.includes(event.action)) {
      return false;
    }

    if (conditions.resources && !conditions.resources.includes(event.resource)) {
      return false;
    }

    if (conditions.users && event.userId && !conditions.users.includes(event.userId)) {
      return false;
    }

    if (conditions.ipAddresses && !conditions.ipAddresses.includes(event.ipAddress)) {
      return false;
    }

    if (conditions.statusCodes && !conditions.statusCodes.includes(event.statusCode)) {
      return false;
    }

    if (conditions.riskLevels && !conditions.riskLevels.includes(event.riskLevel)) {
      return false;
    }

    if (conditions.categories && !conditions.categories.includes(event.category)) {
      return false;
    }

    return true;
  }

  /**
   * Generate security alert
   */
  private async generateSecurityAlert(event: AuditEvent, rule: AuditRule): Promise<void> {
    try {
      const alertId = this.generateAlertId();

      // Check for similar recent alerts to prevent spam
      const recentAlerts = await this.getRecentAlerts(rule.id, 300000); // 5 minutes
      if (recentAlerts.length > 0) {
        // Update existing alert with new event
        const existingAlert = recentAlerts[0];
        existingAlert.events.push(event.id);
        return;
      }

      const alert: SecurityAlert = {
        id: alertId,
        timestamp: new Date(),
        severity: rule.alertSeverity || 'medium',
        type: this.determineAlertType(event, rule),
        title: `${rule.name}: ${event.action} on ${event.resource}`,
        description: this.generateAlertDescription(event, rule),
        events: [event.id],
        userId: event.userId,
        ipAddress: event.ipAddress,
        resolved: false,
        falsePositive: false
      };

      this.alerts.set(alertId, alert);

      // Store in database
      await this.prisma.$executeRaw`
        INSERT INTO security_alerts (
          id, timestamp, severity, type, title, description, events, user_id, ip_address,
          resolved, resolved_by, resolved_at, resolution_notes, false_positive
        ) VALUES (
          ${alert.id}, ${alert.timestamp}, ${alert.severity}, ${alert.type}, ${alert.title},
          ${alert.description}, ${JSON.stringify(alert.events)}, ${alert.userId}, ${alert.ipAddress},
          ${alert.resolved}, ${alert.resolvedBy}, ${alert.resolvedAt}, ${alert.resolutionNotes}, ${alert.falsePositive}
        )
      `;

      // Send alert notification
      await this.sendAlertNotification(alert);

      logger.warn('Security alert generated', {
        component: 'AuditLogging',
        alertId,
        severity: alert.severity,
        type: alert.type,
        eventId: event.id
      });
    } catch (error) {
      logger.error('Failed to generate security alert', {
        component: 'AuditLogging',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlertNotification(alert: SecurityAlert): Promise<void> {
    try {
      // Queue notification job
      await this.queueService.addJob('notifications', 'sendSecurityAlert', {
        alertId: alert.id,
        severity: alert.severity,
        title: alert.title,
        description: alert.description
      }, { priority: alert.severity === 'critical' ? 10 : 5 });
    } catch (error) {
      logger.error('Failed to queue alert notification', {
        component: 'AuditLogging',
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Determine alert type based on event and rule
   */
  private determineAlertType(event: AuditEvent, rule: AuditRule): SecurityAlert['type'] {
    if (rule.id.includes('authentication') && event.statusCode >= 400) {
      return 'authentication_failure';
    }
    
    if (rule.id.includes('privilege') || event.statusCode === 403) {
      return 'privilege_escalation';
    }
    
    if (rule.id.includes('export') || rule.id.includes('bulk')) {
      return 'data_export';
    }
    
    if (event.riskLevel === 'critical') {
      return 'system_compromise';
    }
    
    if (event.category === 'data_access' && event.riskLevel === 'high') {
      return 'data_breach';
    }
    
    return 'suspicious_activity';
  }

  /**
   * Generate alert description
   */
  private generateAlertDescription(event: AuditEvent, rule: AuditRule): string {
    let description = `Rule "${rule.name}" triggered by ${event.action} action on ${event.resource}`;
    
    if (event.userId) {
      description += ` by user ${event.userId}`;
    }
    
    description += ` from IP ${event.ipAddress}`;
    
    if (event.statusCode >= 400) {
      description += ` (Status: ${event.statusCode})`;
    }
    
    if (event.geoLocation?.country) {
      description += ` from ${event.geoLocation.country}`;
    }
    
    return description;
  }

  /**
   * Get recent alerts for a rule
   */
  private async getRecentAlerts(ruleId: string, timeWindowMs: number): Promise<SecurityAlert[]> {
    const cutoffTime = new Date(Date.now() - timeWindowMs);
    
    return Array.from(this.alerts.values()).filter(alert => 
      alert.timestamp >= cutoffTime && !alert.resolved
    );
  }

  /**
   * Calculate risk level based on event data
   */
  private calculateRiskLevel(eventData: Partial<AuditEvent>): 'low' | 'medium' | 'high' | 'critical' {
    let score = 0;

    // Status code impact
    if (eventData.statusCode && eventData.statusCode >= 500) score += 3;
    else if (eventData.statusCode && eventData.statusCode >= 400) score += 2;

    // Action impact
    if (['delete', 'admin_login', 'privilege_change'].includes(eventData.action || '')) score += 3;
    else if (['create', 'update', 'export'].includes(eventData.action || '')) score += 2;
    else if (['login', 'access'].includes(eventData.action || '')) score += 1;

    // Resource impact
    if (['user', 'payment', 'system', 'admin'].includes(eventData.resource || '')) score += 2;
    else if (['personal_data', 'sensitive'].includes(eventData.resource || '')) score += 3;

    // Category impact
    if (eventData.category === 'security') score += 3;
    else if (['authentication', 'authorization'].includes(eventData.category || '')) score += 2;

    if (score >= 8) return 'critical';
    if (score >= 5) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /**
   * Determine category based on action
   */
  private determineCategory(action: string): AuditEvent['category'] {
    const authActions = ['login', 'logout', 'register', 'password_reset', 'token_refresh'];
    const authzActions = ['permission_check', 'role_assignment', 'access_denied'];
    const dataAccessActions = ['read', 'view', 'search', 'export', 'download'];
    const dataModActions = ['create', 'update', 'delete', 'insert', 'modify'];
    const systemActions = ['admin_login', 'system_config', 'maintenance', 'backup'];
    const securityActions = ['security_scan', 'threat_detected', 'vulnerability_found'];

    if (authActions.includes(action)) return 'authentication';
    if (authzActions.includes(action)) return 'authorization';
    if (dataAccessActions.includes(action)) return 'data_access';
    if (dataModActions.includes(action)) return 'data_modification';
    if (systemActions.includes(action)) return 'system';
    if (securityActions.includes(action)) return 'security';

    return 'system';
  }

  /**
   * Get geolocation information
   */
  private async getGeoLocation(ipAddress?: string): Promise<AuditEvent['geoLocation'] | undefined> {
    if (!ipAddress || ipAddress === 'unknown') return undefined;

    try {
      // In a real implementation, this would call a GeoIP service
      // For now, return mock data
      return {
        country: 'Unknown',
        region: 'Unknown',
        city: 'Unknown'
      };
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get device information from user agent
   */
  private getDeviceInfo(userAgent?: string): AuditEvent['deviceInfo'] | undefined {
    if (!userAgent) return undefined;

    // Simple user agent parsing (in production, use a proper library)
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/.test(userAgent);
    const isTablet = /iPad|Android(?!.*Mobile)/.test(userAgent);
    const isBot = /bot|crawler|spider|crawling/i.test(userAgent);

    let type: 'desktop' | 'mobile' | 'tablet' | 'bot' = 'desktop';
    if (isBot) type = 'bot';
    else if (isTablet) type = 'tablet';
    else if (isMobile) type = 'mobile';

    return {
      type,
      os: this.extractOS(userAgent),
      browser: this.extractBrowser(userAgent)
    };
  }

  /**
   * Extract OS from user agent
   */
  private extractOS(userAgent: string): string {
    if (/Windows NT/.test(userAgent)) return 'Windows';
    if (/Mac OS X/.test(userAgent)) return 'macOS';
    if (/Linux/.test(userAgent)) return 'Linux';
    if (/Android/.test(userAgent)) return 'Android';
    if (/iPhone|iPad/.test(userAgent)) return 'iOS';
    return 'Unknown';
  }

  /**
   * Extract browser from user agent
   */
  private extractBrowser(userAgent: string): string {
    if (/Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) return 'Chrome';
    if (/Firefox\//.test(userAgent)) return 'Firefox';
    if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'Safari';
    if (/Edg\//.test(userAgent)) return 'Edge';
    if (/Opera\/|OPR\//.test(userAgent)) return 'Opera';
    return 'Unknown';
  }

  /**
   * Get request size
   */
  private getRequestSize(req?: Request): number {
    if (!req) return 0;
    
    const contentLength = req.get('content-length');
    return contentLength ? parseInt(contentLength) : 0;
  }

  /**
   * Extract session ID from request
   */
  private extractSessionId(req?: Request): string | undefined {
    if (!req) return undefined;
    
    // Try to extract from various sources
    const sessionHeader = req.get('x-session-id');
    if (sessionHeader) return sessionHeader;
    
    const authHeader = req.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Extract session from JWT (simplified)
      return authHeader.substring(7, 15); // First 8 chars as session indicator
    }
    
    return undefined;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `AUD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `ALT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Search audit events
   */
  async searchEvents(criteria: {
    userId?: string;
    ipAddress?: string;
    action?: string;
    resource?: string;
    category?: string;
    riskLevel?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    try {
      // Build query conditions
      const conditions: string[] = [];
      const params: any[] = [];

      if (criteria.userId) {
        conditions.push('user_id = $' + (params.length + 1));
        params.push(criteria.userId);
      }

      if (criteria.ipAddress) {
        conditions.push('ip_address = $' + (params.length + 1));
        params.push(criteria.ipAddress);
      }

      if (criteria.action) {
        conditions.push('action = $' + (params.length + 1));
        params.push(criteria.action);
      }

      if (criteria.resource) {
        conditions.push('resource = $' + (params.length + 1));
        params.push(criteria.resource);
      }

      if (criteria.category) {
        conditions.push('category = $' + (params.length + 1));
        params.push(criteria.category);
      }

      if (criteria.riskLevel) {
        conditions.push('risk_level = $' + (params.length + 1));
        params.push(criteria.riskLevel);
      }

      if (criteria.startDate) {
        conditions.push('timestamp >= $' + (params.length + 1));
        params.push(criteria.startDate);
      }

      if (criteria.endDate) {
        conditions.push('timestamp <= $' + (params.length + 1));
        params.push(criteria.endDate);
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const limitClause = `LIMIT ${criteria.limit || 100} OFFSET ${criteria.offset || 0}`;

      const query = `
        SELECT * FROM audit_events 
        ${whereClause} 
        ORDER BY timestamp DESC 
        ${limitClause}
      `;

      const results = await this.prisma.$queryRawUnsafe(query, ...params) as any[];

      return results.map(this.mapDatabaseEventToAuditEvent);
    } catch (error) {
      logger.error('Failed to search audit events', {
        component: 'AuditLogging',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Map database event to AuditEvent
   */
  private mapDatabaseEventToAuditEvent(dbEvent: any): AuditEvent {
    return {
      id: dbEvent.id,
      timestamp: dbEvent.timestamp,
      userId: dbEvent.user_id,
      sessionId: dbEvent.session_id,
      ipAddress: dbEvent.ip_address,
      userAgent: dbEvent.user_agent,
      action: dbEvent.action,
      resource: dbEvent.resource,
      resourceId: dbEvent.resource_id,
      method: dbEvent.method,
      endpoint: dbEvent.endpoint,
      statusCode: dbEvent.status_code,
      responseTime: dbEvent.response_time,
      requestSize: dbEvent.request_size,
      responseSize: dbEvent.response_size,
      outcome: dbEvent.outcome,
      riskLevel: dbEvent.risk_level,
      category: dbEvent.category,
      details: JSON.parse(dbEvent.details || '{}'),
      geoLocation: JSON.parse(dbEvent.geo_location || '{}'),
      deviceInfo: JSON.parse(dbEvent.device_info || '{}'),
      tags: JSON.parse(dbEvent.tags || '[]'),
      correlationId: dbEvent.correlation_id,
      parentEventId: dbEvent.parent_event_id,
      archived: dbEvent.archived
    };
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(timeRange: { start: Date; end: Date }): Promise<AuditStats> {
    try {
      const events = await this.searchEvents({
        startDate: timeRange.start,
        endDate: timeRange.end,
        limit: 10000
      });

      const stats: AuditStats = {
        totalEvents: events.length,
        eventsByCategory: {},
        eventsByRiskLevel: {},
        eventsByOutcome: {},
        topUsers: [],
        topEndpoints: [],
        topCountries: [],
        suspiciousActivities: 0,
        failedLogins: 0,
        dataBreaches: 0,
        timeRange
      };

      // Calculate statistics
      const categoryCount = new Map<string, number>();
      const riskLevelCount = new Map<string, number>();
      const outcomeCount = new Map<string, number>();
      const userCount = new Map<string, number>();
      const endpointCount = new Map<string, number>();
      const countryCount = new Map<string, number>();

      events.forEach(event => {
        // Category stats
        categoryCount.set(event.category, (categoryCount.get(event.category) || 0) + 1);

        // Risk level stats
        riskLevelCount.set(event.riskLevel, (riskLevelCount.get(event.riskLevel) || 0) + 1);

        // Outcome stats
        outcomeCount.set(event.outcome, (outcomeCount.get(event.outcome) || 0) + 1);

        // User stats
        if (event.userId) {
          userCount.set(event.userId, (userCount.get(event.userId) || 0) + 1);
        }

        // Endpoint stats
        endpointCount.set(event.endpoint, (endpointCount.get(event.endpoint) || 0) + 1);

        // Country stats
        if (event.geoLocation?.country) {
          countryCount.set(event.geoLocation.country, (countryCount.get(event.geoLocation.country) || 0) + 1);
        }

        // Special counters
        if (event.riskLevel === 'high' || event.riskLevel === 'critical') {
          stats.suspiciousActivities++;
        }

        if (event.category === 'authentication' && event.outcome === 'failure') {
          stats.failedLogins++;
        }

        if (event.category === 'data_access' && event.riskLevel === 'critical') {
          stats.dataBreaches++;
        }
      });

      // Convert maps to objects/arrays
      stats.eventsByCategory = Object.fromEntries(categoryCount);
      stats.eventsByRiskLevel = Object.fromEntries(riskLevelCount);
      stats.eventsByOutcome = Object.fromEntries(outcomeCount);

      stats.topUsers = Array.from(userCount.entries())
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      stats.topEndpoints = Array.from(endpointCount.entries())
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      stats.topCountries = Array.from(countryCount.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return stats;
    } catch (error) {
      logger.error('Failed to get audit statistics', {
        component: 'AuditLogging',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get all security alerts
   */
  getSecurityAlerts(filters?: {
    severity?: string;
    type?: string;
    resolved?: boolean;
    limit?: number;
  }): SecurityAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (filters) {
      if (filters.severity) {
        alerts = alerts.filter(alert => alert.severity === filters.severity);
      }
      if (filters.type) {
        alerts = alerts.filter(alert => alert.type === filters.type);
      }
      if (filters.resolved !== undefined) {
        alerts = alerts.filter(alert => alert.resolved === filters.resolved);
      }
    }

    return alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, filters?.limit || 100);
  }

  /**
   * Resolve security alert
   */
  async resolveAlert(alertId: string, resolvedBy: string, resolutionNotes?: string, falsePositive: boolean = false): Promise<boolean> {
    try {
      const alert = this.alerts.get(alertId);
      if (!alert) return false;

      alert.resolved = true;
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = new Date();
      alert.resolutionNotes = resolutionNotes;
      alert.falsePositive = falsePositive;

      // Update in database
      await this.prisma.$executeRaw`
        UPDATE security_alerts 
        SET resolved = ${alert.resolved}, resolved_by = ${alert.resolvedBy}, 
            resolved_at = ${alert.resolvedAt}, resolution_notes = ${alert.resolutionNotes},
            false_positive = ${alert.falsePositive}
        WHERE id = ${alertId}
      `;

      logger.info('Security alert resolved', {
        component: 'AuditLogging',
        alertId,
        resolvedBy,
        falsePositive
      });

      return true;
    } catch (error) {
      logger.error('Failed to resolve security alert', {
        component: 'AuditLogging',
        alertId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Export audit events to file
   */
  async exportEvents(criteria: {
    startDate: Date;
    endDate: Date;
    format: 'json' | 'csv';
    userId?: string;
    category?: string;
  }): Promise<{ filename: string; data: string }> {
    try {
      const events = await this.searchEvents({
        startDate: criteria.startDate,
        endDate: criteria.endDate,
        userId: criteria.userId,
        category: criteria.category,
        limit: 50000 // Large export limit
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-export-${timestamp}.${criteria.format}`;

      let data: string;
      if (criteria.format === 'json') {
        data = JSON.stringify(events, null, 2);
      } else {
        // CSV format
        const headers = [
          'ID', 'Timestamp', 'User ID', 'IP Address', 'Action', 'Resource',
          'Method', 'Endpoint', 'Status Code', 'Risk Level', 'Category', 'Outcome'
        ].join(',');

        const rows = events.map(event => [
          event.id,
          event.timestamp.toISOString(),
          event.userId || '',
          event.ipAddress,
          event.action,
          event.resource,
          event.method,
          event.endpoint,
          event.statusCode,
          event.riskLevel,
          event.category,
          event.outcome
        ].join(','));

        data = [headers, ...rows].join('\n');
      }

      return { filename, data };
    } catch (error) {
      logger.error('Failed to export audit events', {
        component: 'AuditLogging',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get system status
   */
  getStatus(): {
    bufferSize: number;
    eventsInMemory: number;
    rulesActive: number;
    alertsActive: number;
    lastFlush: Date;
  } {
    return {
      bufferSize: this.eventBuffer.length,
      eventsInMemory: this.events.size,
      rulesActive: Array.from(this.rules.values()).filter(rule => rule.enabled).length,
      alertsActive: Array.from(this.alerts.values()).filter(alert => !alert.resolved).length,
      lastFlush: new Date() // Would track actual last flush time in production
    };
  }
}

export default AuditLogging;

