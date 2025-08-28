import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '@/config/environment';
import { JwtPayload, RefreshTokenPayload } from '@/types/auth';
import { UserRole } from '@prisma/client';

// Password utilities
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT utilities
export function generateAccessToken(payload: {
  userId: string;
  email: string;
  username: string;
  role: UserRole;
}): { token: string; jti: string; expiresAt: Date } {
  const jti = uuidv4();
  const expiresAt = new Date();
  
  // Parse expiration time (e.g., '15m' -> 15 minutes)
  const expiresIn = config.JWT.ACCESS_EXPIRES_IN;
  if (expiresIn.endsWith('m')) {
    const minutes = parseInt(expiresIn.slice(0, -1));
    expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
  } else if (expiresIn.endsWith('h')) {
    const hours = parseInt(expiresIn.slice(0, -1));
    expiresAt.setHours(expiresAt.getHours() + hours);
  } else if (expiresIn.endsWith('d')) {
    const days = parseInt(expiresIn.slice(0, -1));
    expiresAt.setDate(expiresAt.getDate() + days);
  }

  const tokenPayload = {
    sub: payload.userId,
    email: payload.email,
    username: payload.username,
    role: payload.role,
    jti,
  };

  // @ts-ignore - JWT type issues with strict mode
  const token = jwt.sign(tokenPayload, config.JWT.SECRET, {
    expiresIn: config.JWT.ACCESS_EXPIRES_IN,
  });

  return { token, jti, expiresAt };
}

export function generateRefreshToken(userId: string, rememberMe: boolean = false): { token: string; jti: string; expiresAt: Date } {
  const jti = uuidv4();
  const expiresAt = new Date();
  
  // Use longer expiration if rememberMe is true
  const expiresIn = rememberMe ? '30d' : config.JWT.REFRESH_EXPIRES_IN;
  
  // Parse expiration time (e.g., '7d' -> 7 days, '30d' -> 30 days)
  if (expiresIn.endsWith('d')) {
    const days = parseInt(expiresIn.slice(0, -1));
    expiresAt.setDate(expiresAt.getDate() + days);
  } else if (expiresIn.endsWith('h')) {
    const hours = parseInt(expiresIn.slice(0, -1));
    expiresAt.setHours(expiresAt.getHours() + hours);
  }

  const tokenPayload = {
    sub: userId,
    jti,
  };

  // @ts-ignore - JWT type issues with strict mode
  const token = jwt.sign(tokenPayload, config.JWT.REFRESH_SECRET, {
    expiresIn: expiresIn,
  });

  return { token, jti, expiresAt };
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, config.JWT.SECRET) as JwtPayload;
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('TOKEN_INVALID');
    }
    throw error;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, config.JWT.REFRESH_SECRET) as RefreshTokenPayload;
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('REFRESH_TOKEN_INVALID');
    }
    throw error;
  }
}

// Token extraction from Authorization header
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] || null;
}

// Password validation
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Email validation
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Username validation
export function validateUsername(username: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (username.length > 50) {
    errors.push('Username must be no more than 50 characters long');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, hyphens, and underscores');
  }

  if (/^[_-]|[_-]$/.test(username)) {
    errors.push('Username cannot start or end with hyphens or underscores');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
