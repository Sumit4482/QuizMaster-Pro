import {
  hashPassword,
  verifyPassword,
  validatePassword,
  validateEmail,
  validateUsername,
  extractTokenFromHeader,
} from '@/utils/auth';

// Mock dependencies for testing without database
jest.mock('@/config/database', () => ({
  prisma: {},
}));

jest.mock('@/config/redis', () => ({
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
}));

describe('Auth Utils - Simple Unit Tests (No DB)', () => {
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

    it('should require character types', () => {
      const tests = [
        { password: 'nouppercase123!', error: 'Password must contain at least one uppercase letter' },
        { password: 'NOLOWERCASE123!', error: 'Password must contain at least one lowercase letter' },
        { password: 'NoNumbers!@#', error: 'Password must contain at least one number' },
        { password: 'NoSpecialChars123', error: 'Password must contain at least one special character' },
      ];

      tests.forEach(({ password, error }) => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(error);
      });
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email addresses', () => {
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

    it('should reject invalid email addresses', () => {
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
    it('should validate correct usernames', () => {
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

    it('should reject invalid usernames', () => {
      const tests = [
        { username: 'ab', error: 'Username must be at least 3 characters long' },
        { username: 'a'.repeat(51), error: 'Username must be no more than 50 characters long' },
        { username: 'test user', error: 'Username can only contain letters, numbers, hyphens, and underscores' },
        { username: '-testuser', error: 'Username cannot start or end with hyphens or underscores' },
      ];

      tests.forEach(({ username, error }) => {
        const result = validateUsername(username);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(error);
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
