import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { ServiceDiscovery, ServiceRegistration } from '../../gateway/serviceDiscovery';
import { verifyAccessToken, generateAccessToken, generateRefreshToken, extractTokenFromHeader } from '../../utils/auth';
import { hashPassword, comparePassword } from '../../utils/crypto';

export interface UserServiceConfig {
  port: number;
  serviceName: string;
  host: string;
  environment: string;
  version: string;
}

/**
 * Phase 4.2: User Service Microservice
 * 
 * Dedicated microservice for user management with:
 * - User authentication and authorization
 * - User profile management
 * - Session management
 * - Password management
 * - User preferences
 */
export class UserService {
  private app: express.Application;
  private config: UserServiceConfig;
  private serviceDiscovery: ServiceDiscovery;
  private isShuttingDown = false;

  constructor(config: UserServiceConfig) {
    this.config = config;
    this.app = express();
    this.serviceDiscovery = ServiceDiscovery.getInstance();
    
    this.initializeMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Initialize middleware stack
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: true, // Will be restricted by API Gateway
      credentials: true
    }));

    // Rate limiting
    this.app.use('/auth/login', rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 login attempts per windowMs
      message: {
        success: false,
        error: 'Too many login attempts',
        code: 'LOGIN_RATE_LIMITED'
      }
    }));

    this.app.use('/auth/register', rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 registration attempts per hour
      message: {
        success: false,
        error: 'Too many registration attempts',
        code: 'REGISTRATION_RATE_LIMITED'
      }
    }));

    // Request parsing
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Request logging
    this.app.use(this.logRequest.bind(this));
  }

  /**
   * Setup service routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', this.healthCheck.bind(this));

    // Authentication routes
    this.app.post('/auth/register', this.register.bind(this));
    this.app.post('/auth/login', this.login.bind(this));
    this.app.post('/auth/refresh', this.refreshToken.bind(this));
    this.app.post('/auth/logout', this.authenticate.bind(this), this.logout.bind(this));
    this.app.post('/auth/validate', this.validateToken.bind(this));

    // User profile routes
    this.app.get('/users/profile', this.authenticate.bind(this), this.getProfile.bind(this));
    this.app.put('/users/profile', this.authenticate.bind(this), this.updateProfile.bind(this));
    this.app.delete('/users/profile', this.authenticate.bind(this), this.deleteProfile.bind(this));

    // User management routes (admin only)
    this.app.get('/users', this.authenticate.bind(this), this.requireRole(['ADMIN']), this.getUsers.bind(this));
    this.app.get('/users/:userId', this.authenticate.bind(this), this.requireRole(['ADMIN']), this.getUserById.bind(this));
    this.app.put('/users/:userId/role', this.authenticate.bind(this), this.requireRole(['ADMIN']), this.updateUserRole.bind(this));

    // Password management
    this.app.post('/auth/forgot-password', this.forgotPassword.bind(this));
    this.app.post('/auth/reset-password', this.resetPassword.bind(this));
    this.app.put('/auth/change-password', this.authenticate.bind(this), this.changePassword.bind(this));

    // User sessions
    this.app.get('/users/sessions', this.authenticate.bind(this), this.getUserSessions.bind(this));
    this.app.delete('/users/sessions/:sessionId', this.authenticate.bind(this), this.revokeSession.bind(this));

    // User preferences
    this.app.get('/users/preferences', this.authenticate.bind(this), this.getPreferences.bind(this));
    this.app.put('/users/preferences', this.authenticate.bind(this), this.updatePreferences.bind(this));
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        code: 'ROUTE_NOT_FOUND'
      });
    });

    // Error handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('User service error', {
        component: 'UserService',
        error: error.message,
        stack: error.stack,
        path: req.path
      });

      res.status(500).json({
        success: false,
        error: 'Internal service error',
        code: 'USER_SERVICE_ERROR'
      });
    });
  }

  /**
   * Log incoming requests
   */
  private logRequest(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    logger.info('👤 User service request', {
      component: 'UserService',
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      correlationId: req.headers['x-correlation-id']
    });

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info('👤 User service response', {
        component: 'UserService',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration
      });
    });

    next();
  }

  /**
   * Health check endpoint
   */
  private async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;

      res.status(200).json({
        success: true,
        data: {
          service: 'user-service',
          status: 'healthy',
          version: this.config.version,
          timestamp: new Date().toISOString(),
          database: 'connected'
        }
      });
    } catch (error) {
      logger.error('User service health check failed', { error });
      res.status(503).json({
        success: false,
        error: 'Service unhealthy',
        code: 'HEALTH_CHECK_FAILED'
      });
    }
  }

  /**
   * User registration
   */
  private async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, username, password, firstName, lastName } = req.body;

      // Validation
      if (!email || !username || !password) {
        res.status(400).json({
          success: false,
          error: 'Email, username, and password are required',
          code: 'MISSING_FIELDS'
        });
        return;
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email.toLowerCase() },
            { username: username.toLowerCase() }
          ]
        }
      });

      if (existingUser) {
        res.status(409).json({
          success: false,
          error: 'User already exists with this email or username',
          code: 'USER_EXISTS'
        });
        return;
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          username: username.toLowerCase(),
          password: hashedPassword,
          firstName: firstName || null,
          lastName: lastName || null,
          role: 'USER',
          isActive: true
        }
      });

      // Generate tokens
      const accessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        jti: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });

      const refreshToken = generateRefreshToken(user.id);

      // Create session
      await prisma.userSession.create({
        data: {
          userId: user.id,
          tokenJti: accessToken.split('.')[1], // Use part of token as JTI
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          userAgent: req.get('User-Agent') || null,
          ipAddress: req.ip
        }
      });

      logger.info('User registered successfully', {
        component: 'UserService',
        userId: user.id,
        email: user.email
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          },
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: 3600 // 1 hour
          }
        }
      });

    } catch (error) {
      logger.error('Registration failed', {
        component: 'UserService',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }

  /**
   * User login
   */
  private async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        });
        return;
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
        return;
      }

      // Verify password
      const validPassword = await comparePassword(password, user.password);
      if (!validPassword) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
        return;
      }

      // Generate tokens
      const jti = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const accessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        jti
      });

      const refreshToken = generateRefreshToken(user.id);

      // Create session
      await prisma.userSession.create({
        data: {
          userId: user.id,
          tokenJti: jti,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          userAgent: req.get('User-Agent') || null,
          ipAddress: req.ip
        }
      });

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      logger.info('User logged in successfully', {
        component: 'UserService',
        userId: user.id,
        email: user.email
      });

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          },
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: 3600 // 1 hour
          }
        }
      });

    } catch (error) {
      logger.error('Login failed', {
        component: 'UserService',
        error: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Login failed',
        code: 'LOGIN_ERROR'
      });
    }
  }

  /**
   * Token validation (used by API Gateway)
   */
  private async validateToken(req: Request, res: Response): Promise<void> {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      
      if (!token) {
        res.status(401).json({
          success: false,
          error: 'No token provided',
          code: 'MISSING_TOKEN'
        });
        return;
      }

      const payload = verifyAccessToken(token);
      
      // Check if session exists
      const session = await prisma.userSession.findUnique({
        where: { tokenJti: payload.jti },
        include: { user: true }
      });

      if (!session || session.expiresAt < new Date() || !session.user.isActive) {
        res.status(401).json({
          success: false,
          error: 'Token invalid or expired',
          code: 'INVALID_TOKEN'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: session.user.id,
            email: session.user.email,
            username: session.user.username,
            role: session.user.role
          },
          valid: true
        }
      });

    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Token validation failed',
        code: 'VALIDATION_FAILED'
      });
    }
  }

  /**
   * Get user profile
   */
  private async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true
        }
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: { user }
      });

    } catch (error) {
      logger.error('Get profile failed', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to get profile',
        code: 'PROFILE_ERROR'
      });
    }
  }

  /**
   * Authentication middleware
   */
  private async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      
      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'MISSING_TOKEN'
        });
        return;
      }

      const payload = verifyAccessToken(token);
      
      // Check if session exists and is valid
      const session = await prisma.userSession.findUnique({
        where: { tokenJti: payload.jti },
        include: { user: true }
      });

      if (!session || session.expiresAt < new Date() || !session.user.isActive) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        });
        return;
      }

      (req as any).user = {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role
      };

      next();

    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  }

  /**
   * Role authorization middleware
   */
  private requireRole(allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const user = (req as any).user;
      
      if (!user || !allowedRoles.includes(user.role)) {
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

  // Placeholder implementations for remaining routes
  private async refreshToken(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async logout(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async updateProfile(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async deleteProfile(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async getUsers(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async getUserById(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async updateUserRole(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async forgotPassword(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async resetPassword(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async changePassword(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async getUserSessions(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async revokeSession(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async getPreferences(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  private async updatePreferences(req: Request, res: Response): Promise<void> {
    res.status(501).json({ success: false, error: 'Not implemented' });
  }

  /**
   * Start the User Service
   */
  public async start(): Promise<void> {
    try {
      // Start the HTTP server
      this.app.listen(this.config.port, () => {
        logger.info('👤 User Service started', {
          component: 'UserService',
          port: this.config.port,
          version: this.config.version,
          environment: this.config.environment
        });
      });

      // Register with service discovery
      const registration: ServiceRegistration = {
        name: this.config.serviceName,
        host: this.config.host,
        port: this.config.port,
        protocol: 'http',
        metadata: {
          version: this.config.version,
          environment: this.config.environment,
          capabilities: ['authentication', 'user-management', 'session-management'],
          tags: ['user', 'auth', 'microservice']
        },
        healthCheckPath: '/health',
        healthCheckInterval: 30000
      };

      await this.serviceDiscovery.registerService(registration);

      logger.info('👤 User Service registered with service discovery', {
        component: 'UserService',
        serviceName: this.config.serviceName
      });

    } catch (error) {
      logger.error('Failed to start User Service', {
        component: 'UserService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    logger.info('👤 User Service shutting down gracefully', {
      component: 'UserService'
    });

    try {
      // Deregister from service discovery
      await this.serviceDiscovery.deregisterService(
        this.config.serviceName,
        this.config.host,
        this.config.port
      );

      // Close database connections
      await prisma.$disconnect();

      logger.info('👤 User Service shutdown complete', {
        component: 'UserService'
      });

    } catch (error) {
      logger.error('Error during User Service shutdown', {
        component: 'UserService',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default UserService;

