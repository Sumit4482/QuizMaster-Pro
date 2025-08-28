import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  validatePassword,
  validateEmail,
  validateUsername,
  extractTokenFromHeader,
} from '@/utils/auth';
import { UserRole } from '@prisma/client';

describe('Auth Utils - Unit Tests', () => {
  describe('Password Hashing', () => {
    it('should hash password with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
      expect(hash).toMatch(/^\$2b\$12\$/); // bcrypt format with 12 rounds
    });

    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    const mockUser = {
      userId: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
      role: UserRole.PLAYER,
    };

    it('should generate valid access token', () => {
      const result = generateAccessToken(mockUser);
      
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('jti');
      expect(result).toHaveProperty('expiresAt');
      expect(typeof result.token).toBe('string');
      expect(typeof result.jti).toBe('string');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should generate valid refresh token', () => {
      const result = generateRefreshToken(mockUser.userId);
      
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('jti');
      expect(result).toHaveProperty('expiresAt');
      expect(typeof result.token).toBe('string');
      expect(typeof result.jti).toBe('string');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should verify valid access token', () => {
      const { token } = generateAccessToken(mockUser);
      const payload = verifyAccessToken(token);
      
      expect(payload).toHaveProperty('sub', mockUser.userId);
      expect(payload).toHaveProperty('email', mockUser.email);
      expect(payload).toHaveProperty('username', mockUser.username);
      expect(payload).toHaveProperty('role', mockUser.role);
      expect(payload).toHaveProperty('jti');
    });

    it('should verify valid refresh token', () => {
      const { token } = generateRefreshToken(mockUser.userId);
      const payload = verifyRefreshToken(token);
      
      expect(payload).toHaveProperty('sub', mockUser.userId);
      expect(payload).toHaveProperty('jti');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.jwt.token';
      
      expect(() => verifyAccessToken(invalidToken)).toThrow('TOKEN_INVALID');
    });
  });

  describe('Password Validation', () => {
    it('should validate strong password', () => {
      const strongPassword = 'StrongPass123!@#';
      const result = validatePassword(strongPassword);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak password', () => {
      const weakPassword = '123';
      const result = validatePassword(weakPassword);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should require minimum length', () => {
      const shortPassword = 'short';
      const result = validatePassword(shortPassword);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should require uppercase letter', () => {
      const password = 'lowercaseonly123!';
      const result = validatePassword(password);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should require lowercase letter', () => {
      const password = 'UPPERCASEONLY123!';
      const result = validatePassword(password);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should require number', () => {
      const password = 'NoNumbers!@#';
      const result = validatePassword(password);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should require special character', () => {
      const password = 'NoSpecialChars123';
      const result = validatePassword(password);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'test+tag@example.org',
        'user123@test-domain.com',
      ];
      
      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test.example.com',
        'test@.com',
        '',
      ];
      
      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });
  });

  describe('Username Validation', () => {
    it('should validate correct username', () => {
      const validUsernames = [
        'testuser',
        'user123',
        'test_user',
        'test-user',
        'TestUser123',
      ];
      
      validUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject short username', () => {
      const shortUsername = 'ab';
      const result = validateUsername(shortUsername);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Username must be at least 3 characters long');
    });

    it('should reject long username', () => {
      const longUsername = 'a'.repeat(51);
      const result = validateUsername(longUsername);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Username must be no more than 50 characters long');
    });

    it('should reject invalid characters', () => {
      const invalidUsernames = [
        'test user',
        'test@user',
        'test#user',
        'test.user',
      ];
      
      invalidUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Username can only contain letters, numbers, hyphens, and underscores');
      });
    });

    it('should reject username starting/ending with special chars', () => {
      const invalidUsernames = [
        '-testuser',
        'testuser-',
        '_testuser',
        'testuser_',
      ];
      
      invalidUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Username cannot start or end with hyphens or underscores');
      });
    });
  });

  describe('Token Extraction', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'valid.jwt.token';
      const header = `Bearer ${token}`;
      
      const extracted = extractTokenFromHeader(header);
      expect(extracted).toBe(token);
    });

    it('should return null for invalid header format', () => {
      const invalidHeaders = [
        'Token valid.jwt.token',
        'Bearer',
        'Bearer ',
        '',
        undefined,
      ];
      
      invalidHeaders.forEach(header => {
        const extracted = extractTokenFromHeader(header);
        expect(extracted).toBeNull();
      });
    });
  });
});
