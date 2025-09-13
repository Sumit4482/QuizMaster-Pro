import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: {
    enabled: boolean;
    directives?: Record<string, string | string[]>;
    reportOnly?: boolean;
    reportUri?: string;
  };
  hsts?: {
    enabled: boolean;
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  frameOptions?: {
    enabled: boolean;
    action: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    allowFrom?: string;
  };
  contentTypeOptions?: {
    enabled: boolean;
    noSniff: boolean;
  };
  xssProtection?: {
    enabled: boolean;
    mode?: 'block' | 'sanitize';
    reportUri?: string;
  };
  referrerPolicy?: {
    enabled: boolean;
    policy: 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 
           'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url';
  };
  permissionsPolicy?: {
    enabled: boolean;
    features?: Record<string, string[]>;
  };
  crossOriginEmbedderPolicy?: {
    enabled: boolean;
    policy: 'unsafe-none' | 'require-corp';
  };
  crossOriginOpenerPolicy?: {
    enabled: boolean;
    policy: 'unsafe-none' | 'same-origin-allow-popups' | 'same-origin';
  };
  crossOriginResourcePolicy?: {
    enabled: boolean;
    policy: 'same-site' | 'same-origin' | 'cross-origin';
  };
  customHeaders?: Record<string, string>;
  removeHeaders?: string[];
}

export interface CSPViolationReport {
  blockedUri: string;
  columnNumber?: number;
  disposition: string;
  documentUri: string;
  effectiveDirective: string;
  lineNumber?: number;
  originalPolicy: string;
  referrer?: string;
  scriptSample?: string;
  sourceFile?: string;
  statusCode?: number;
  violatedDirective: string;
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
}

export class SecurityHeaders {
  private config: SecurityHeadersConfig;
  private cspViolations: CSPViolationReport[] = [];
  private violationStats: Map<string, number> = new Map();

  constructor(config: SecurityHeadersConfig = {}) {
    this.config = this.mergeWithDefaults(config);
    this.validateConfig();

    logger.info('Security Headers service initialized', {
      component: 'SecurityHeaders',
      enabledFeatures: this.getEnabledFeatures()
    });
  }

  /**
   * Merge provided config with secure defaults
   */
  private mergeWithDefaults(config: SecurityHeadersConfig): SecurityHeadersConfig {
    const defaults: SecurityHeadersConfig = {
      contentSecurityPolicy: {
        enabled: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'", 'https:', 'data:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'media-src': ["'self'"],
          'object-src': ["'none'"],
          'child-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'base-uri': ["'self'"],
          'upgrade-insecure-requests': []
        },
        reportOnly: false
      },
      hsts: {
        enabled: true,
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      frameOptions: {
        enabled: true,
        action: 'DENY'
      },
      contentTypeOptions: {
        enabled: true,
        noSniff: true
      },
      xssProtection: {
        enabled: true,
        mode: 'block'
      },
      referrerPolicy: {
        enabled: true,
        policy: 'strict-origin-when-cross-origin'
      },
      permissionsPolicy: {
        enabled: true,
        features: {
          camera: [],
          microphone: [],
          geolocation: [],
          'interest-cohort': []
        }
      },
      crossOriginEmbedderPolicy: {
        enabled: false,
        policy: 'unsafe-none'
      },
      crossOriginOpenerPolicy: {
        enabled: true,
        policy: 'same-origin'
      },
      crossOriginResourcePolicy: {
        enabled: true,
        policy: 'same-origin'
      },
      removeHeaders: [
        'X-Powered-By',
        'Server',
        'X-AspNet-Version',
        'X-AspNetMvc-Version'
      ]
    };

    return this.deepMerge(defaults, config);
  }

  /**
   * Deep merge configuration objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.hsts?.enabled && this.config.hsts.maxAge && this.config.hsts.maxAge < 86400) {
      logger.warn('HSTS max-age is less than 24 hours, which may not provide adequate security', {
        component: 'SecurityHeaders',
        maxAge: this.config.hsts.maxAge
      });
    }

    if (this.config.contentSecurityPolicy?.enabled && 
        this.config.contentSecurityPolicy.directives?.['script-src']?.includes("'unsafe-eval'")) {
      logger.warn('CSP allows unsafe-eval which may pose security risks', {
        component: 'SecurityHeaders'
      });
    }
  }

  /**
   * Get enabled security features
   */
  private getEnabledFeatures(): string[] {
    const features: string[] = [];
    
    if (this.config.contentSecurityPolicy?.enabled) features.push('CSP');
    if (this.config.hsts?.enabled) features.push('HSTS');
    if (this.config.frameOptions?.enabled) features.push('X-Frame-Options');
    if (this.config.contentTypeOptions?.enabled) features.push('X-Content-Type-Options');
    if (this.config.xssProtection?.enabled) features.push('X-XSS-Protection');
    if (this.config.referrerPolicy?.enabled) features.push('Referrer-Policy');
    if (this.config.permissionsPolicy?.enabled) features.push('Permissions-Policy');
    if (this.config.crossOriginEmbedderPolicy?.enabled) features.push('COEP');
    if (this.config.crossOriginOpenerPolicy?.enabled) features.push('COOP');
    if (this.config.crossOriginResourcePolicy?.enabled) features.push('CORP');
    
    return features;
  }

  /**
   * Create middleware to apply security headers
   */
  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        this.applySecurityHeaders(req, res);
        next();
      } catch (error) {
        logger.error('Error applying security headers', {
          component: 'SecurityHeaders',
          error: error instanceof Error ? error.message : String(error)
        });
        next();
      }
    };
  }

  /**
   * Apply all security headers
   */
  private applySecurityHeaders(req: Request, res: Response): void {
    // Remove unwanted headers first
    if (this.config.removeHeaders) {
      this.config.removeHeaders.forEach(header => {
        res.removeHeader(header);
      });
    }

    // Apply Content Security Policy
    if (this.config.contentSecurityPolicy?.enabled) {
      this.applyCSP(req, res);
    }

    // Apply HSTS
    if (this.config.hsts?.enabled) {
      this.applyHSTS(req, res);
    }

    // Apply X-Frame-Options
    if (this.config.frameOptions?.enabled) {
      this.applyFrameOptions(req, res);
    }

    // Apply X-Content-Type-Options
    if (this.config.contentTypeOptions?.enabled) {
      this.applyContentTypeOptions(req, res);
    }

    // Apply X-XSS-Protection
    if (this.config.xssProtection?.enabled) {
      this.applyXSSProtection(req, res);
    }

    // Apply Referrer-Policy
    if (this.config.referrerPolicy?.enabled) {
      this.applyReferrerPolicy(req, res);
    }

    // Apply Permissions-Policy
    if (this.config.permissionsPolicy?.enabled) {
      this.applyPermissionsPolicy(req, res);
    }

    // Apply Cross-Origin-Embedder-Policy
    if (this.config.crossOriginEmbedderPolicy?.enabled) {
      this.applyCOEP(req, res);
    }

    // Apply Cross-Origin-Opener-Policy
    if (this.config.crossOriginOpenerPolicy?.enabled) {
      this.applyCOOP(req, res);
    }

    // Apply Cross-Origin-Resource-Policy
    if (this.config.crossOriginResourcePolicy?.enabled) {
      this.applyCORP(req, res);
    }

    // Apply custom headers
    if (this.config.customHeaders) {
      Object.entries(this.config.customHeaders).forEach(([name, value]) => {
        res.setHeader(name, value);
      });
    }
  }

  /**
   * Apply Content Security Policy
   */
  private applyCSP(req: Request, res: Response): void {
    const cspConfig = this.config.contentSecurityPolicy!;
    
    if (!cspConfig.directives) return;

    const directives = Object.entries(cspConfig.directives)
      .map(([directive, values]) => {
        if (Array.isArray(values)) {
          return `${directive} ${values.join(' ')}`;
        } else {
          return `${directive} ${values}`;
        }
      })
      .join('; ');

    const headerName = cspConfig.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    let headerValue = directives;

    if (cspConfig.reportUri) {
      headerValue += `; report-uri ${cspConfig.reportUri}`;
    }

    res.setHeader(headerName, headerValue);
  }

  /**
   * Apply HTTP Strict Transport Security
   */
  private applyHSTS(req: Request, res: Response): void {
    const hstsConfig = this.config.hsts!;
    
    // Only apply HSTS over HTTPS
    if (!req.secure && req.get('X-Forwarded-Proto') !== 'https') {
      return;
    }

    let headerValue = `max-age=${hstsConfig.maxAge || 31536000}`;

    if (hstsConfig.includeSubDomains) {
      headerValue += '; includeSubDomains';
    }

    if (hstsConfig.preload) {
      headerValue += '; preload';
    }

    res.setHeader('Strict-Transport-Security', headerValue);
  }

  /**
   * Apply X-Frame-Options
   */
  private applyFrameOptions(req: Request, res: Response): void {
    const frameConfig = this.config.frameOptions!;
    
    let headerValue = frameConfig.action;

    if (frameConfig.action === 'ALLOW-FROM' && frameConfig.allowFrom) {
      headerValue += ` ${frameConfig.allowFrom}`;
    }

    res.setHeader('X-Frame-Options', headerValue);
  }

  /**
   * Apply X-Content-Type-Options
   */
  private applyContentTypeOptions(req: Request, res: Response): void {
    const contentTypeConfig = this.config.contentTypeOptions!;
    
    if (contentTypeConfig.noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }

  /**
   * Apply X-XSS-Protection
   */
  private applyXSSProtection(req: Request, res: Response): void {
    const xssConfig = this.config.xssProtection!;
    
    let headerValue = '1';

    if (xssConfig.mode === 'block') {
      headerValue += '; mode=block';
    }

    if (xssConfig.reportUri) {
      headerValue += `; report=${xssConfig.reportUri}`;
    }

    res.setHeader('X-XSS-Protection', headerValue);
  }

  /**
   * Apply Referrer-Policy
   */
  private applyReferrerPolicy(req: Request, res: Response): void {
    const referrerConfig = this.config.referrerPolicy!;
    res.setHeader('Referrer-Policy', referrerConfig.policy);
  }

  /**
   * Apply Permissions-Policy
   */
  private applyPermissionsPolicy(req: Request, res: Response): void {
    const permissionsConfig = this.config.permissionsPolicy!;
    
    if (!permissionsConfig.features) return;

    const policies = Object.entries(permissionsConfig.features)
      .map(([feature, allowedOrigins]) => {
        if (allowedOrigins.length === 0) {
          return `${feature}=()`;
        } else {
          const origins = allowedOrigins.map(origin => 
            origin === 'self' ? '"self"' : `"${origin}"`
          ).join(' ');
          return `${feature}=(${origins})`;
        }
      })
      .join(', ');

    res.setHeader('Permissions-Policy', policies);
  }

  /**
   * Apply Cross-Origin-Embedder-Policy
   */
  private applyCOEP(req: Request, res: Response): void {
    const coepConfig = this.config.crossOriginEmbedderPolicy!;
    res.setHeader('Cross-Origin-Embedder-Policy', coepConfig.policy);
  }

  /**
   * Apply Cross-Origin-Opener-Policy
   */
  private applyCOOP(req: Request, res: Response): void {
    const coopConfig = this.config.crossOriginOpenerPolicy!;
    res.setHeader('Cross-Origin-Opener-Policy', coopConfig.policy);
  }

  /**
   * Apply Cross-Origin-Resource-Policy
   */
  private applyCORP(req: Request, res: Response): void {
    const corpConfig = this.config.crossOriginResourcePolicy!;
    res.setHeader('Cross-Origin-Resource-Policy', corpConfig.policy);
  }

  /**
   * Handle CSP violation reports
   */
  handleCSPViolation(): (req: Request, res: Response) => void {
    return (req: Request, res: Response): void => {
      try {
        const violation: CSPViolationReport = {
          ...req.body['csp-report'],
          timestamp: new Date(),
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip
        };

        this.cspViolations.push(violation);
        
        // Keep only recent violations
        if (this.cspViolations.length > 1000) {
          this.cspViolations = this.cspViolations.slice(-1000);
        }

        // Update statistics
        const directive = violation.effectiveDirective;
        this.violationStats.set(directive, (this.violationStats.get(directive) || 0) + 1);

        logger.warn('CSP violation detected', {
          component: 'SecurityHeaders',
          blockedUri: violation.blockedUri,
          violatedDirective: violation.violatedDirective,
          documentUri: violation.documentUri,
          sourceFile: violation.sourceFile,
          userAgent: violation.userAgent,
          ipAddress: violation.ipAddress
        });

        // Check for potential attacks
        if (this.isPotentialAttack(violation)) {
          logger.error('Potential XSS attack detected via CSP violation', {
            component: 'SecurityHeaders',
            violation,
            severity: 'high'
          });
        }

        res.status(204).send();
      } catch (error) {
        logger.error('Error handling CSP violation report', {
          component: 'SecurityHeaders',
          error: error instanceof Error ? error.message : String(error)
        });
        res.status(400).send();
      }
    };
  }

  /**
   * Check if CSP violation indicates a potential attack
   */
  private isPotentialAttack(violation: CSPViolationReport): boolean {
    const suspiciousPatterns = [
      /javascript:/i,
      /data:text\/html/i,
      /eval\(/i,
      /onclick/i,
      /onerror/i,
      /onload/i,
      /<script/i,
      /vbscript:/i,
      /expression\(/i
    ];

    const blockedUri = violation.blockedUri || '';
    const scriptSample = violation.scriptSample || '';

    return suspiciousPatterns.some(pattern => 
      pattern.test(blockedUri) || pattern.test(scriptSample)
    );
  }

  /**
   * Get CSP violation statistics
   */
  getCSPViolationStats(): {
    totalViolations: number;
    violationsByDirective: Record<string, number>;
    recentViolations: CSPViolationReport[];
    topBlockedUris: Array<{ uri: string; count: number }>;
  } {
    const recentViolations = this.cspViolations
      .filter(v => v.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      .slice(-50); // Last 50 violations

    // Count blocked URIs
    const uriCounts = new Map<string, number>();
    this.cspViolations.forEach(violation => {
      const uri = violation.blockedUri || 'unknown';
      uriCounts.set(uri, (uriCounts.get(uri) || 0) + 1);
    });

    const topBlockedUris = Array.from(uriCounts.entries())
      .map(([uri, count]) => ({ uri, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalViolations: this.cspViolations.length,
      violationsByDirective: Object.fromEntries(this.violationStats),
      recentViolations,
      topBlockedUris
    };
  }

  /**
   * Generate security report
   */
  generateSecurityReport(): {
    timestamp: Date;
    enabledFeatures: string[];
    cspViolations: number;
    recentViolations: number;
    topViolatedDirectives: Array<{ directive: string; count: number }>;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    
    // Analyze CSP violations for recommendations
    if (this.violationStats.size > 0) {
      const topDirective = Array.from(this.violationStats.entries())
        .sort(([,a], [,b]) => b - a)[0];
      
      if (topDirective[1] > 10) {
        recommendations.push(`Consider reviewing CSP directive '${topDirective[0]}' - it has ${topDirective[1]} violations`);
      }
    }

    // Check for unsafe CSP directives
    if (this.config.contentSecurityPolicy?.directives?.['script-src']?.includes("'unsafe-inline'")) {
      recommendations.push("Consider removing 'unsafe-inline' from script-src for better XSS protection");
    }

    if (this.config.contentSecurityPolicy?.directives?.['script-src']?.includes("'unsafe-eval'")) {
      recommendations.push("Consider removing 'unsafe-eval' from script-src for better security");
    }

    const recentViolations = this.cspViolations.filter(
      v => v.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000
    ).length;

    const topViolatedDirectives = Array.from(this.violationStats.entries())
      .map(([directive, count]) => ({ directive, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      timestamp: new Date(),
      enabledFeatures: this.getEnabledFeatures(),
      cspViolations: this.cspViolations.length,
      recentViolations,
      topViolatedDirectives,
      recommendations
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SecurityHeadersConfig>): void {
    this.config = this.mergeWithDefaults(newConfig);
    this.validateConfig();

    logger.info('Security headers configuration updated', {
      component: 'SecurityHeaders',
      enabledFeatures: this.getEnabledFeatures()
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityHeadersConfig {
    return { ...this.config };
  }

  /**
   * Test security headers for a given URL
   */
  async testHeaders(url: string): Promise<{
    url: string;
    timestamp: Date;
    headers: Record<string, string | undefined>;
    analysis: {
      score: number;
      findings: Array<{
        type: 'warning' | 'error' | 'info';
        message: string;
        severity: 'low' | 'medium' | 'high';
      }>;
    };
  }> {
    try {
      // This would typically make an HTTP request to test headers
      // For now, we'll analyze the current configuration
      const mockHeaders = this.getMockHeaders();
      
      const analysis = this.analyzeHeaders(mockHeaders);
      
      return {
        url,
        timestamp: new Date(),
        headers: mockHeaders,
        analysis
      };
    } catch (error) {
      logger.error('Error testing security headers', {
        component: 'SecurityHeaders',
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Generate mock headers based on current config
   */
  private getMockHeaders(): Record<string, string | undefined> {
    const headers: Record<string, string | undefined> = {};

    if (this.config.contentSecurityPolicy?.enabled) {
      const directives = Object.entries(this.config.contentSecurityPolicy.directives || {})
        .map(([directive, values]) => {
          if (Array.isArray(values)) {
            return `${directive} ${values.join(' ')}`;
          } else {
            return `${directive} ${values}`;
          }
        })
        .join('; ');
      headers['Content-Security-Policy'] = directives;
    }

    if (this.config.hsts?.enabled) {
      let hstsValue = `max-age=${this.config.hsts.maxAge || 31536000}`;
      if (this.config.hsts.includeSubDomains) hstsValue += '; includeSubDomains';
      if (this.config.hsts.preload) hstsValue += '; preload';
      headers['Strict-Transport-Security'] = hstsValue;
    }

    if (this.config.frameOptions?.enabled) {
      headers['X-Frame-Options'] = this.config.frameOptions.action;
    }

    if (this.config.contentTypeOptions?.enabled) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    if (this.config.xssProtection?.enabled) {
      headers['X-XSS-Protection'] = '1; mode=block';
    }

    if (this.config.referrerPolicy?.enabled) {
      headers['Referrer-Policy'] = this.config.referrerPolicy.policy;
    }

    return headers;
  }

  /**
   * Analyze headers for security issues
   */
  private analyzeHeaders(headers: Record<string, string | undefined>): {
    score: number;
    findings: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  } {
    const findings: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    let score = 100;

    // Check for missing security headers
    if (!headers['Content-Security-Policy']) {
      findings.push({
        type: 'error',
        message: 'Missing Content-Security-Policy header',
        severity: 'high'
      });
      score -= 20;
    }

    if (!headers['Strict-Transport-Security']) {
      findings.push({
        type: 'warning',
        message: 'Missing Strict-Transport-Security header',
        severity: 'medium'
      });
      score -= 10;
    }

    if (!headers['X-Frame-Options']) {
      findings.push({
        type: 'warning',
        message: 'Missing X-Frame-Options header',
        severity: 'medium'
      });
      score -= 10;
    }

    if (!headers['X-Content-Type-Options']) {
      findings.push({
        type: 'warning',
        message: 'Missing X-Content-Type-Options header',
        severity: 'low'
      });
      score -= 5;
    }

    // Check for weak configurations
    const csp = headers['Content-Security-Policy'];
    if (csp && csp.includes("'unsafe-inline'")) {
      findings.push({
        type: 'warning',
        message: "CSP contains 'unsafe-inline' which reduces XSS protection",
        severity: 'medium'
      });
      score -= 10;
    }

    if (csp && csp.includes("'unsafe-eval'")) {
      findings.push({
        type: 'warning',
        message: "CSP contains 'unsafe-eval' which allows dangerous evaluations",
        severity: 'high'
      });
      score -= 15;
    }

    return {
      score: Math.max(0, score),
      findings
    };
  }

  /**
   * Clear violation history
   */
  clearViolationHistory(): void {
    this.cspViolations = [];
    this.violationStats.clear();
    
    logger.info('CSP violation history cleared', {
      component: 'SecurityHeaders'
    });
  }
}

export default SecurityHeaders;

