import { ExtendedSocket, EventValidationRule, SocketError } from '../types/socket';
import { logger } from '@/config/logger';

/**
 * Event payload validation middleware
 */
export function validateEventPayload(schema: { [key: string]: EventValidationRule }) {
  return (
    socket: ExtendedSocket,
    eventName: string,
    payload: any,
    next: (error?: Error) => void
  ) => {
    try {
      const errors = validatePayload(payload, schema);
      
      if (errors.length > 0) {
        logger.warn('Event payload validation failed', {
          socketId: socket.id,
          userId: socket.data.user?.id,
          eventName,
          errors,
          payload: sanitizePayload(payload),
        });
        
        return next(new SocketError(
          'VALIDATION_ERROR',
          `Validation failed: ${errors.join(', ')}`,
          { errors }
        ));
      }
      
      next();
    } catch (error) {
      logger.error('Validation middleware error', {
        socketId: socket.id,
        eventName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      next(new SocketError('VALIDATION_ERROR', 'Validation failed'));
    }
  };
}

/**
 * Validate payload against schema
 */
function validatePayload(payload: any, schema: { [key: string]: EventValidationRule }): string[] {
  const errors: string[] = [];
  
  // Check if payload is an object
  if (!payload || typeof payload !== 'object') {
    return ['Payload must be an object'];
  }
  
  // Validate each field in schema
  for (const [fieldName, rule] of Object.entries(schema)) {
    const value = payload[fieldName];
    const fieldErrors = validateField(fieldName, value, rule);
    errors.push(...fieldErrors);
  }
  
  return errors;
}

/**
 * Validate individual field
 */
function validateField(fieldName: string, value: any, rule: EventValidationRule): string[] {
  const errors: string[] = [];
  
  // Check required fields
  if (rule.required && (value === undefined || value === null || value === '')) {
    errors.push(`${fieldName} is required`);
    return errors; // Don't continue validation if required field is missing
  }
  
  // Skip further validation if field is not provided and not required
  if (value === undefined || value === null) {
    return errors;
  }
  
  // Type validation
  if (rule.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== rule.type) {
      errors.push(`${fieldName} must be of type ${rule.type}`);
      return errors; // Don't continue if type is wrong
    }
  }
  
  // String validations
  if (rule.type === 'string' && typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
    }
    
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(`${fieldName} must be at most ${rule.maxLength} characters long`);
    }
    
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${fieldName} does not match required pattern`);
    }
    
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push(`${fieldName} must be one of: ${rule.enum.join(', ')}`);
    }
  }
  
  // Number validations
  if (rule.type === 'number' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      errors.push(`${fieldName} must be at least ${rule.min}`);
    }
    
    if (rule.max !== undefined && value > rule.max) {
      errors.push(`${fieldName} must be at most ${rule.max}`);
    }
  }
  
  // Array validations
  if (rule.type === 'array' && Array.isArray(value)) {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`${fieldName} must have at least ${rule.minLength} items`);
    }
    
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(`${fieldName} must have at most ${rule.maxLength} items`);
    }
  }
  
  // Custom validation
  if (rule.custom) {
    const customResult = rule.custom(value);
    if (customResult !== true) {
      const errorMessage = typeof customResult === 'string' 
        ? customResult 
        : `${fieldName} failed custom validation`;
      errors.push(errorMessage);
    }
  }
  
  return errors;
}

/**
 * Sanitize payload for logging (remove sensitive data)
 */
function sanitizePayload(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  
  const sanitized = { ...payload };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Common validation rules for reuse
 */
export const commonValidationRules = {
  roomCode: {
    type: 'string' as const,
    required: true,
    pattern: /^[A-Z0-9]{6}$/,
  },
  
  roomName: {
    type: 'string' as const,
    required: true,
    minLength: 1,
    maxLength: 100,
    custom: (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 || 'Room name cannot be empty or only whitespace';
    },
  },
  
  password: {
    type: 'string' as const,
    maxLength: 100,
  },
  
  message: {
    type: 'string' as const,
    required: true,
    minLength: 1,
    maxLength: 500,
    custom: (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 || 'Message cannot be empty or only whitespace';
    },
  },
  
  userId: {
    type: 'string' as const,
    required: true,
    pattern: /^[a-zA-Z0-9_-]+$/,
  },
  
  maxPlayers: {
    type: 'number' as const,
    min: 2,
    max: 50,
  },
  
  boolean: {
    type: 'boolean' as const,
  },
};

/**
 * Validate room code format
 */
export function isValidRoomCode(code: string): boolean {
  return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code);
}

/**
 * Validate username format
 */
export function isValidUsername(username: string): boolean {
  return typeof username === 'string' && 
         username.length >= 3 && 
         username.length <= 20 && 
         /^[a-zA-Z0-9_-]+$/.test(username);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && 
         /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string, maxLength: number = 100): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>\"']/g, ''); // Remove potentially dangerous characters
}

/**
 * Validate and sanitize room settings
 */
export function validateRoomSettings(settings: any): any {
  const sanitizedSettings: any = {};
  
  if (typeof settings.allowSpectators === 'boolean') {
    sanitizedSettings.allowSpectators = settings.allowSpectators;
  }
  
  if (typeof settings.allowReconnection === 'boolean') {
    sanitizedSettings.allowReconnection = settings.allowReconnection;
  }
  
  if (typeof settings.autoStart === 'boolean') {
    sanitizedSettings.autoStart = settings.autoStart;
  }
  
  if (typeof settings.questionTimeLimit === 'number' && 
      settings.questionTimeLimit >= 10 && 
      settings.questionTimeLimit <= 300) {
    sanitizedSettings.questionTimeLimit = settings.questionTimeLimit;
  }
  
  if (typeof settings.showCorrectAnswers === 'boolean') {
    sanitizedSettings.showCorrectAnswers = settings.showCorrectAnswers;
  }
  
  if (typeof settings.allowHints === 'boolean') {
    sanitizedSettings.allowHints = settings.allowHints;
  }
  
  if (typeof settings.shuffleQuestions === 'boolean') {
    sanitizedSettings.shuffleQuestions = settings.shuffleQuestions;
  }
  
  if (typeof settings.shuffleAnswers === 'boolean') {
    sanitizedSettings.shuffleAnswers = settings.shuffleAnswers;
  }
  
  if (typeof settings.requireApproval === 'boolean') {
    sanitizedSettings.requireApproval = settings.requireApproval;
  }
  
  return sanitizedSettings;
}
