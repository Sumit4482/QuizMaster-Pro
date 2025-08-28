import {
  validateEmail,
  validateUsername,
  validatePassword,
  validatePasswordConfirmation,
  validateName,
  validateRequired,
  validateUrl,
  validateLoginForm,
  validateRegisterForm,
  getPasswordStrength,
} from '@/utils/validation';

describe('Validation Utils', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'test+tag@example.org',
        'user123@test-domain.com',
      ];

      validEmails.forEach(email => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
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
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should require email', () => {
      const result = validateEmail('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Email is required');
    });
  });

  describe('validateUsername', () => {
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

    it('should reject short usernames', () => {
      const result = validateUsername('ab');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Username must be at least 3 characters long');
    });

    it('should reject long usernames', () => {
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

    it('should reject usernames starting/ending with special chars', () => {
      const invalidUsernames = ['-testuser', 'testuser-', '_testuser', 'testuser_'];

      invalidUsernames.forEach(username => {
        const result = validateUsername(username);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Username cannot start or end with hyphens or underscores');
      });
    });
  });

  describe('validatePassword', () => {
    it('should validate strong password', () => {
      const strongPassword = 'StrongPass123!@#';
      const result = validatePassword(strongPassword);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const weakPassword = '123';
      const result = validatePassword(weakPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should require minimum length', () => {
      const result = validatePassword('short');
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

  describe('validatePasswordConfirmation', () => {
    it('should validate matching passwords', () => {
      const password = 'Password123!';
      const result = validatePasswordConfirmation(password, password);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-matching passwords', () => {
      const result = validatePasswordConfirmation('Password123!', 'DifferentPass123!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Passwords do not match');
    });

    it('should require confirmation password', () => {
      const result = validatePasswordConfirmation('Password123!', '');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password confirmation is required');
    });
  });

  describe('validateName', () => {
    it('should validate correct names', () => {
      const validNames = ['John', 'Mary-Jane', "O'Connor", 'Jean-Pierre'];

      validNames.forEach(name => {
        const result = validateName(name, 'First name');
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should allow empty names', () => {
      const result = validateName('', 'First name');
      expect(result.isValid).toBe(true);
    });

    it('should reject long names', () => {
      const longName = 'a'.repeat(101);
      const result = validateName(longName, 'First name');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('First name must be no more than 100 characters long');
    });

    it('should reject invalid characters', () => {
      const result = validateName('John123', 'First name');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('First name can only contain letters, spaces, hyphens, and apostrophes');
    });
  });

  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://test.org',
        'https://sub.domain.com/path?query=value',
      ];

      validUrls.forEach(url => {
        const result = validateUrl(url);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should allow empty URLs', () => {
      const result = validateUrl('');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = ['not-a-url', 'ftp://example.com', 'javascript:alert(1)'];

      invalidUrls.forEach(url => {
        const result = validateUrl(url);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('Form Validation', () => {
    describe('validateLoginForm', () => {
      it('should validate correct login data', () => {
        const loginData = {
          email: 'test@example.com',
          password: 'password123',
        };

        const result = validateLoginForm(loginData);
        expect(result.isValid).toBe(true);
        expect(Object.keys(result.errors)).toHaveLength(0);
      });

      it('should reject invalid login data', () => {
        const loginData = {
          email: 'invalid-email',
          password: '',
        };

        const result = validateLoginForm(loginData);
        expect(result.isValid).toBe(false);
        expect(result.errors.email).toBeDefined();
        expect(result.errors.password).toBeDefined();
      });
    });

    describe('validateRegisterForm', () => {
      it('should validate correct registration data', () => {
        const registerData = {
          email: 'test@example.com',
          username: 'testuser',
          password: 'StrongPass123!',
          confirmPassword: 'StrongPass123!',
          firstName: 'John',
          lastName: 'Doe',
        };

        const result = validateRegisterForm(registerData);
        expect(result.isValid).toBe(true);
        expect(Object.keys(result.errors)).toHaveLength(0);
      });

      it('should reject password mismatch', () => {
        const registerData = {
          email: 'test@example.com',
          username: 'testuser',
          password: 'StrongPass123!',
          confirmPassword: 'DifferentPass123!',
        };

        const result = validateRegisterForm(registerData);
        expect(result.isValid).toBe(false);
        expect(result.errors.confirmPassword).toContain('Passwords do not match');
      });
    });
  });

  describe('getPasswordStrength', () => {
    it('should rate very weak password', () => {
      const result = getPasswordStrength('123');
      expect(result.strength).toBe('very-weak');
      expect(result.score).toBeLessThan(2);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should rate weak password', () => {
      const result = getPasswordStrength('password');
      expect(result.strength).toBe('weak');
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should rate strong password', () => {
      const result = getPasswordStrength('VeryStrongPassword123!@#$');
      expect(result.strength).toBe('strong');
      expect(result.score).toBeGreaterThan(4);
      expect(result.feedback.length).toBe(0);
    });

    it('should penalize repeated characters', () => {
      const weakResult = getPasswordStrength('aaaaaA1!');
      const strongResult = getPasswordStrength('AbCdEf1!');
      expect(weakResult.score).toBeLessThan(strongResult.score);
    });

    it('should give bonus for long passwords', () => {
      const shortResult = getPasswordStrength('AbCdEf1!');
      const longResult = getPasswordStrength('AbCdEf1!LongPass');
      expect(longResult.score).toBeGreaterThan(shortResult.score);
    });
  });
});
