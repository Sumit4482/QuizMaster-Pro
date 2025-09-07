import { User, UserRole } from '@prisma/client';
import { prisma } from '@/config/database';
import { 
  hashPassword, 
  verifyPassword, 
  generateAccessToken, 
  generateRefreshToken,
  verifyRefreshToken
} from '@/utils/auth';
import { 
  RegisterRequest, 
  LoginRequest, 
  AuthResponse, 
  UserResponse, 
  RefreshTokenRequest 
} from '@/types/auth';

export class AuthService {
  // User registration
  async register(data: RegisterRequest): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.email.toLowerCase() },
          { username: data.username.toLowerCase() }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email === data.email.toLowerCase()) {
        throw new Error('EMAIL_ALREADY_EXISTS');
      } else {
        throw new Error('USERNAME_ALREADY_EXISTS');
      }
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        username: data.username.toLowerCase(),
        passwordHash,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        role: UserRole.PLAYER,
      }
    });

    // Generate tokens
    const tokens = await this.generateTokenPair(user);

    return {
      user: this.mapUserToResponse(user),
      tokens,
    };
  }

  // User login
  async login(data: LoginRequest): Promise<AuthResponse> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() }
    });

    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Verify password
    const isPasswordValid = await verifyPassword(data.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Update last login time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate tokens (with rememberMe for extended refresh token)
    const tokens = await this.generateTokenPair(user, data.rememberMe);

    return {
      user: this.mapUserToResponse(user),
      tokens,
    };
  }

  // Refresh access token
  async refreshToken(data: RefreshTokenRequest): Promise<{ accessToken: string; expiresAt: Date }> {
    try {
      // Verify refresh token
      const payload = verifyRefreshToken(data.refreshToken);

      // Find session in database
      const session = await prisma.userSession.findUnique({
        where: { tokenJti: payload.jti },
        include: { user: true }
      });

      if (!session || session.expiresAt < new Date()) {
        throw new Error('REFRESH_TOKEN_EXPIRED');
      }

      // Verify the provided refresh token against stored hash
      if (!session.refreshTokenHash) {
        throw new Error('REFRESH_TOKEN_INVALID');
      }
      
      const isValidRefreshToken = await verifyPassword(data.refreshToken, session.refreshTokenHash);
      if (!isValidRefreshToken) {
        throw new Error('REFRESH_TOKEN_INVALID');
      }

      // Generate new access token
      const accessTokenData = generateAccessToken({
        userId: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role,
      });

      // Update session last used time AND the new access token JTI
      await prisma.userSession.update({
        where: { id: session.id },
        data: { 
          lastUsedAt: new Date(),
          tokenJti: accessTokenData.jti  // Update to new access token JTI
        }
      });

      return {
        accessToken: accessTokenData.token,
        expiresAt: accessTokenData.expiresAt,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('REFRESH_TOKEN_INVALID');
    }
  }

  // User logout
  async logout(userId: string, jti?: string): Promise<void> {
    if (jti) {
      // Logout specific session
      await prisma.userSession.delete({
        where: { tokenJti: jti }
      });
    } else {
      // Logout all sessions for user
      await prisma.userSession.deleteMany({
        where: { userId }
      });
    }
  }

  // Get user profile
  async getUserProfile(userId: string): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    return this.mapUserToResponse(user);
  }

  // Check if email is available
  async checkEmailAvailability(email: string): Promise<boolean> {
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    
    return !existingUser; // Return true if email is available (no user found)
  }

  // Update user profile
  async updateUserProfile(
    userId: string, 
    data: { firstName?: string; lastName?: string; avatarUrl?: string }
  ): Promise<UserResponse> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        updatedAt: new Date(),
      }
    });

    return this.mapUserToResponse(user);
  }

  // Change password
  async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<void> {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new Error('INVALID_CURRENT_PASSWORD');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and invalidate all sessions
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { 
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        }
      }),
      prisma.userSession.deleteMany({
        where: { userId }
      })
    ]);
  }

  // Private helper methods
  private async generateTokenPair(user: User, rememberMe: boolean = false) {
    // Generate access token
    const accessTokenData = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    // Generate refresh token (extended expiration if rememberMe is true)
    const refreshTokenData = generateRefreshToken(user.id, rememberMe);

    // Hash refresh token for storage
    const refreshTokenHash = await hashPassword(refreshTokenData.token);

    // Store session in database
    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenJti: accessTokenData.jti,  // FIXED: Use access token JTI for auth middleware lookup
        refreshTokenHash,
        expiresAt: refreshTokenData.expiresAt,
      }
    });

    return {
      accessToken: accessTokenData.token,
      refreshToken: refreshTokenData.token,
      expiresAt: accessTokenData.expiresAt,
    };
  }

  private mapUserToResponse(user: User): UserResponse {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  // Clean up expired sessions (should be run as a background job)
  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.userSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    return result.count;
  }

  // Get user sessions (for user to see active sessions)
  async getUserSessions(userId: string) {
    const sessions = await prisma.userSession.findMany({
      where: { 
        userId,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' }
    });

    return sessions;
  }

  // Revoke specific session
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await prisma.userSession.delete({
      where: { 
        id: sessionId,
        userId // Ensure user can only revoke their own sessions
      }
    });
  }
}
