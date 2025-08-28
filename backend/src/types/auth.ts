import { UserRole } from '@prisma/client';
import { Request } from 'express';

// JWT Payload Types
export interface JwtPayload {
  sub: string; // user ID
  email: string;
  username: string;
  role: UserRole;
  jti: string; // JWT ID for token blacklisting
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string; // user ID
  jti: string; // JWT ID
  iat: number;
  exp: number;
}

// Authentication Request Types
export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

// Authentication Response Types
export interface AuthResponse {
  user: UserResponse;
  tokens: TokenResponse;
}

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// Session Types
export interface UserSession {
  id: string;
  userId: string;
  tokenJti: string;
  refreshTokenHash: string | null;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}

// Extended Express Request Type
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    role: UserRole;
    jti: string;
  };
  correlationId?: string;
}
