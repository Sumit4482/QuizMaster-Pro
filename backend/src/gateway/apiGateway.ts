import express, { Request, Response, NextFunction } from 'express';
import httpProxy from 'http-proxy-middleware';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from '../utils/logger';
import { ServiceDiscovery } from './serviceDiscovery';
import { CircuitBreaker } from './circuitBreaker';
import { LoadBalancer } from './loadBalancer';

export interface ServiceRoute {
  path: string;
  serviceName: string;
  methods: string[];
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  auth?: boolean;
  roles?: string[];
  circuitBreaker?: {
    timeout: number;
    errorThreshold: number;
    resetTimeout: number;
  };
}

export interface GatewayConfig {
  port: number;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  circuitBreaker: {
    timeout: number;
    errorThreshold: number;
    resetTimeout: number;
  };
}

/**
 * Phase 4.2: API Gateway Service
 * 
 * Central entry point for all client requests with:
 * - Intelligent request routing
 * - Authentication and authorization
 * - Rate limiting and traffic control
 * - Circuit breaker protection
 * - Load balancing
 * - Request/response transformation
 */
export class ApiGateway {
  private app: express.Application;
  private serviceDiscovery: ServiceDiscovery;
  private circuitBreaker: CircuitBreaker;
  private loadBalancer: LoadBalancer;
  private routes: ServiceRoute[] = [];
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.app = express();
    this.serviceDiscovery = ServiceDiscovery.getInstance();
    this.circuitBreaker = CircuitBreaker.getInstance();
    this.loadBalancer = LoadBalancer.getInstance();
    
    this.initializeMiddleware();
    this.setupDefaultRoutes();
  }

  /**
   * Initialize middleware stack
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With', 
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Correlation-ID',
        'X-Service-Name',
        'X-Request-ID'
      ]
    }));

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Global rate limiting
    this.app.use(rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: {
        success: false,
        error: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
    }));

    // Request correlation and logging
    this.app.use(this.addCorrelationId.bind(this));
    this.app.use(this.logRequest.bind(this));
  }

  /**
   * Setup default service routes
   */
  private setupDefaultRoutes(): void {
    const defaultRoutes: ServiceRoute[] = [
      {
        path: '/api/auth',
        serviceName: 'user-service',
        methods: ['POST', 'GET', 'PUT', 'DELETE'],
        auth: false, // Auth service handles its own authentication
        rateLimit: { windowMs: 15 * 60 * 1000, max: 50 }
      },
      {
        path: '/api/users',
        serviceName: 'user-service', 
        methods: ['GET', 'PUT', 'DELETE'],
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 }
      },
      {
        path: '/api/questions',
        serviceName: 'question-service',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 200 }
      },
      {
        path: '/api/quiz',
        serviceName: 'game-service',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        auth: true,
        rateLimit: { windowMs: 5 * 60 * 1000, max: 500 }
      },
      {
        path: '/api/ai',
        serviceName: 'ai-service',
        methods: ['POST'],
        auth: true,
        roles: ['USER', 'HOST', 'ADMIN'],
        rateLimit: { windowMs: 15 * 60 * 1000, max: 30 }
      },
      {
        path: '/api/analytics',
        serviceName: 'analytics-service',
        methods: ['GET', 'POST'],
        auth: true,
        roles: ['HOST', 'ADMIN'],
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 }
      },
      {
        path: '/api/notifications',
        serviceName: 'notification-service',
        methods: ['GET', 'POST', 'PUT'],
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 50 }
      },
      {
        path: '/api/files',
        serviceName: 'file-service',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        auth: true,
        rateLimit: { windowMs: 15 * 60 * 1000, max: 100 }
      }
    ];

    defaultRoutes.forEach(route => this.addRoute(route));
  }

  /**
   * Add a new service route
   */
  public addRoute(route: ServiceRoute): void {
    this.routes.push(route);

    // Setup rate limiting for this route if specified
    const routeLimiter = route.rateLimit ? rateLimit({
      windowMs: route.rateLimit.windowMs,
      max: route.rateLimit.max,
      message: {
        success: false,
        error: `Rate limit exceeded for ${route.path}`,
        code: 'ROUTE_RATE_LIMIT_EXCEEDED'
      }
    }) : null;

    // Create proxy middleware
    const proxyMiddleware = this.createProxyMiddleware(route);
    
    // Setup the route with all middleware
    if (routeLimiter) {
      this.app.use(route.path, routeLimiter);
    }

    if (route.auth) {
      this.app.use(route.path, this.authenticate.bind(this));
    }

    if (route.roles) {
      this.app.use(route.path, this.authorizeRoles(route.roles));
    }

    this.app.use(route.path, proxyMiddleware);

    logger.info('🌐 Route registered in API Gateway', {
      component: 'ApiGateway',
      path: route.path,
      service: route.serviceName,
      methods: route.methods,
      auth: route.auth
    });
  }

  /**
   * Create proxy middleware for a service route
   */
  private createProxyMiddleware(route: ServiceRoute) {
    return createProxyMiddleware({
      target: 'http://localhost:3000', // Will be dynamically resolved
      changeOrigin: true,
      pathRewrite: (path) => {
        // Remove the service prefix from the path
        return path.replace(route.path, '');
      },
      router: async (req) => {
        try {
          // Get service instance from service discovery
          const serviceInstance = await this.serviceDiscovery.getService(route.serviceName);
          
          if (!serviceInstance) {
            logger.error('Service not found', {
              component: 'ApiGateway',
              service: route.serviceName,
              path: req.url
            });
            throw new Error(`Service ${route.serviceName} not available`);
          }

          // Use load balancer to select best instance
          const selectedInstance = this.loadBalancer.selectInstance(
            route.serviceName,
            [serviceInstance]
          );

          return `http://${selectedInstance.host}:${selectedInstance.port}`;
        } catch (error) {
          logger.error('Failed to route request', {
            component: 'ApiGateway',
            error: error instanceof Error ? error.message : String(error),
            service: route.serviceName
          });
          throw error;
        }
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add gateway headers
        proxyReq.setHeader('X-Gateway-Request', 'true');
        proxyReq.setHeader('X-Correlation-ID', (req as any).correlationId);
        proxyReq.setHeader('X-Request-ID', (req as any).requestId);
        
        if ((req as any).user) {
          proxyReq.setHeader('X-User-ID', (req as any).user.id);
          proxyReq.setHeader('X-User-Role', (req as any).user.role);
        }

        logger.debug('Proxying request', {
          component: 'ApiGateway',
          method: req.method,
          path: req.url,
          service: route.serviceName,
          correlationId: (req as any).correlationId
        });
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add response headers
        proxyRes.headers['X-Gateway-Response'] = 'true';
        proxyRes.headers['X-Service-Name'] = route.serviceName;

        logger.debug('Received response from service', {
          component: 'ApiGateway',
          service: route.serviceName,
          statusCode: proxyRes.statusCode,
          correlationId: (req as any).correlationId
        });
      },
      onError: (err, req, res) => {
        logger.error('Proxy error', {
          component: 'ApiGateway',
          error: err.message,
          service: route.serviceName,
          path: req.url,
          correlationId: (req as any).correlationId
        });

        // Check circuit breaker
        const shouldBreak = this.circuitBreaker.shouldBreak(route.serviceName);
        
        if (shouldBreak) {
          res.status(503).json({
            success: false,
            error: 'Service temporarily unavailable',
            code: 'CIRCUIT_BREAKER_OPEN',
            service: route.serviceName
          });
        } else {
          res.status(502).json({
            success: false,
            error: 'Bad Gateway - Service unavailable',
            code: 'SERVICE_UNAVAILABLE',
            service: route.serviceName
          });
        }
      }
    });
  }

  /**
   * Add correlation ID to requests
   */
  private addCorrelationId(req: Request, res: Response, next: NextFunction): void {
    const correlationId = req.headers['x-correlation-id'] || 
      `gw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    (req as any).correlationId = correlationId;
    (req as any).requestId = requestId;
    
    res.setHeader('X-Correlation-ID', correlationId);
    res.setHeader('X-Request-ID', requestId);
    
    next();
  }

  /**
   * Log incoming requests
   */
  private logRequest(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    logger.info('🌐 Gateway request received', {
      component: 'ApiGateway',
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      correlationId: (req as any).correlationId,
      requestId: (req as any).requestId
    });

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.info('🌐 Gateway response sent', {
        component: 'ApiGateway',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        correlationId: (req as any).correlationId,
        requestId: (req as any).requestId
      });
    });

    next();
  }

  /**
   * Authenticate requests
   */
  private async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = this.extractToken(req);
      
      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'MISSING_TOKEN'
        });
        return;
      }

      // Call user service for token validation
      const userService = await this.serviceDiscovery.getService('user-service');
      
      if (!userService) {
        res.status(503).json({
          success: false,
          error: 'Authentication service unavailable',
          code: 'SERVICE_UNAVAILABLE'
        });
        return;
      }

      // Make request to user service to validate token
      // This would be implemented with actual HTTP call
      // For now, we'll mock the validation
      const user = await this.validateToken(token, userService);
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
        return;
      }

      (req as any).user = user;
      next();

    } catch (error) {
      logger.error('Authentication error in gateway', {
        component: 'ApiGateway',
        error: error instanceof Error ? error.message : String(error),
        correlationId: (req as any).correlationId
      });

      res.status(500).json({
        success: false,
        error: 'Authentication service error',
        code: 'AUTH_SERVICE_ERROR'
      });
    }
  }

  /**
   * Authorize user roles
   */
  private authorizeRoles(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const user = (req as any).user;
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({
          success: false,
          error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        return;
      }

      next();
    };
  }

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    const authorization = req.headers.authorization;
    
    if (authorization && authorization.startsWith('Bearer ')) {
      return authorization.substring(7);
    }
    
    return null;
  }

  /**
   * Validate token with user service
   */
  private async validateToken(token: string, userService: any): Promise<any> {
    // Mock implementation - would make actual HTTP request to user service
    try {
      // Simulate token validation
      if (token.length > 10) {
        return {
          id: 'user-123',
          email: 'user@example.com',
          role: 'USER'
        };
      }
      return null;
    } catch (error) {
      logger.error('Token validation failed', { error });
      return null;
    }
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    status: string;
    routes: number;
    services: string[];
    timestamp: Date;
  } {
    return {
      status: 'healthy',
      routes: this.routes.length,
      services: this.routes.map(r => r.serviceName),
      timestamp: new Date()
    };
  }

  /**
   * Start the API Gateway
   */
  public start(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        success: true,
        data: this.getHealthStatus()
      });
    });

    // Gateway status endpoint
    this.app.get('/gateway/status', (req, res) => {
      res.status(200).json({
        success: true,
        data: {
          name: 'QuizMaster Pro API Gateway',
          version: '1.0.0',
          routes: this.routes.map(r => ({
            path: r.path,
            service: r.serviceName,
            methods: r.methods,
            auth: r.auth
          })),
          services: Array.from(new Set(this.routes.map(r => r.serviceName)))
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        code: 'ROUTE_NOT_FOUND',
        path: req.path
      });
    });

    // Error handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Gateway error', {
        component: 'ApiGateway',
        error: error.message,
        stack: error.stack,
        path: req.path,
        correlationId: (req as any).correlationId
      });

      res.status(500).json({
        success: false,
        error: 'Internal gateway error',
        code: 'GATEWAY_ERROR',
        correlationId: (req as any).correlationId
      });
    });

    this.app.listen(this.config.port, () => {
      logger.info('🌐 API Gateway started successfully', {
        component: 'ApiGateway',
        port: this.config.port,
        routes: this.routes.length,
        services: Array.from(new Set(this.routes.map(r => r.serviceName)))
      });
    });
  }

  /**
   * Get Express app for testing
   */
  public getApp(): express.Application {
    return this.app;
  }
}

export default ApiGateway;

