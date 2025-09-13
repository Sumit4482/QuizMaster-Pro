import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';
import { logger } from '../utils/logger';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'date' | 'array' | 'object' | 'custom';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  sanitize?: boolean;
  allowEmpty?: boolean;
  customValidator?: (value: any) => boolean | string;
  enumValues?: any[];
  arrayOf?: ValidationRule;
  objectSchema?: ValidationRule[];
  transform?: (value: any) => any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitizedData: any;
  warnings: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  value: any;
  rule: string;
}

export interface SanitizationConfig {
  html: {
    allowedTags: string[];
    allowedAttributes: Record<string, string[]>;
    stripTags: boolean;
  };
  sql: {
    escapeQuotes: boolean;
    removeComments: boolean;
  };
  xss: {
    enablePurify: boolean;
    allowedProtocols: string[];
  };
  fileUpload: {
    allowedExtensions: string[];
    maxFileSize: number;
    allowedMimeTypes: string[];
  };
}

export class InputValidation {
  private sanitizationConfig: SanitizationConfig;
  private commonPatterns: Record<string, RegExp>;
  private suspiciousPatterns: RegExp[];

  constructor(config?: Partial<SanitizationConfig>) {
    this.sanitizationConfig = {
      html: {
        allowedTags: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'ul', 'ol', 'li'],
        allowedAttributes: {
          'a': ['href'],
          'img': ['src', 'alt']
        },
        stripTags: true,
        ...config?.html
      },
      sql: {
        escapeQuotes: true,
        removeComments: true,
        ...config?.sql
      },
      xss: {
        enablePurify: true,
        allowedProtocols: ['http', 'https', 'mailto'],
        ...config?.xss
      },
      fileUpload: {
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx'],
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
        ...config?.fileUpload
      }
    };

    this.initializePatterns();
    this.initializeSuspiciousPatterns();

    logger.info('Input validation service initialized', {
      component: 'InputValidation',
      allowedTags: this.sanitizationConfig.html.allowedTags.length,
      allowedExtensions: this.sanitizationConfig.fileUpload.allowedExtensions.length
    });
  }

  /**
   * Initialize common validation patterns
   */
  private initializePatterns(): void {
    this.commonPatterns = {
      username: /^[a-zA-Z0-9_-]{3,30}$/,
      password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      alphanumeric: /^[a-zA-Z0-9]+$/,
      alphanumericWithSpaces: /^[a-zA-Z0-9\s]+$/,
      noSpecialChars: /^[a-zA-Z0-9\s\-_.]+$/,
      phoneNumber: /^\+?[\d\s\-\(\)]{10,}$/,
      slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      hexColor: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
      ipAddress: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      base64: /^[A-Za-z0-9+/]*={0,2}$/,
      mongoId: /^[0-9a-fA-F]{24}$/
    };
  }

  /**
   * Initialize patterns for detecting suspicious input
   */
  private initializeSuspiciousPatterns(): void {
    this.suspiciousPatterns = [
      // SQL Injection patterns
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
      /('|\";|--|\/\*|\*\/)/,
      
      // XSS patterns
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript\s*:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
      
      // Command injection patterns
      /(\||;|&|\$\(|\`)/,
      /\b(cat|ls|pwd|whoami|id|ps|netstat|wget|curl|nc|telnet|ssh|ftp)\b/i,
      
      // Path traversal patterns
      /\.\.\//,
      /\.\.\\/,
      /%2e%2e%2f/i,
      /%252e%252e%252f/i,
      
      // Template injection patterns
      /\{\{.*\}\}/,
      /\$\{.*\}/,
      /@\{.*\}/,
      
      // NoSQL injection patterns
      /\$where/i,
      /\$ne/i,
      /\$gt/i,
      /\$lt/i,
      /\$regex/i,
      
      // LDAP injection patterns
      /\(\|\(/,
      /\)\(\|/,
      /\*\)/,
      
      // XML/XXE patterns
      /<!ENTITY/i,
      /<!DOCTYPE/i,
      /SYSTEM\s+["']/i
    ];
  }

  /**
   * Validate data against rules
   */
  validate(data: any, rules: ValidationRule[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      sanitizedData: {},
      warnings: []
    };

    try {
      for (const rule of rules) {
        const value = this.getNestedValue(data, rule.field);
        const fieldResult = this.validateField(value, rule);

        if (!fieldResult.isValid) {
          result.isValid = false;
          result.errors.push(...fieldResult.errors);
        }

        // Set sanitized value
        this.setNestedValue(result.sanitizedData, rule.field, fieldResult.sanitizedValue);

        // Add warnings
        if (fieldResult.warnings.length > 0) {
          result.warnings.push(...fieldResult.warnings);
        }
      }

      // Check for suspicious patterns
      const suspiciousCheck = this.checkSuspiciousPatterns(data);
      if (suspiciousCheck.length > 0) {
        result.warnings.push(...suspiciousCheck);
      }

      return result;
    } catch (error) {
      logger.error('Validation error', {
        component: 'InputValidation',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        isValid: false,
        errors: [{ field: 'system', message: 'Validation system error', value: null, rule: 'system' }],
        sanitizedData: {},
        warnings: []
      };
    }
  }

  /**
   * Validate a single field
   */
  private validateField(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: any;
    warnings: string[];
  } {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    let sanitizedValue = value;

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      if (!rule.allowEmpty) {
        errors.push({
          field: rule.field,
          message: `${rule.field} is required`,
          value,
          rule: 'required'
        });
      }
    }

    // Skip further validation if value is empty and not required
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return { isValid: true, errors: [], sanitizedValue: value, warnings: [] };
    }

    // Apply transformation
    if (rule.transform) {
      sanitizedValue = rule.transform(value);
    }

    // Type validation and sanitization
    switch (rule.type) {
      case 'string':
        const stringResult = this.validateString(sanitizedValue, rule);
        if (!stringResult.isValid) errors.push(...stringResult.errors);
        sanitizedValue = stringResult.sanitizedValue;
        warnings.push(...stringResult.warnings);
        break;

      case 'number':
        const numberResult = this.validateNumber(sanitizedValue, rule);
        if (!numberResult.isValid) errors.push(...numberResult.errors);
        sanitizedValue = numberResult.sanitizedValue;
        break;

      case 'boolean':
        const booleanResult = this.validateBoolean(sanitizedValue, rule);
        if (!booleanResult.isValid) errors.push(...booleanResult.errors);
        sanitizedValue = booleanResult.sanitizedValue;
        break;

      case 'email':
        const emailResult = this.validateEmail(sanitizedValue, rule);
        if (!emailResult.isValid) errors.push(...emailResult.errors);
        sanitizedValue = emailResult.sanitizedValue;
        break;

      case 'url':
        const urlResult = this.validateUrl(sanitizedValue, rule);
        if (!urlResult.isValid) errors.push(...urlResult.errors);
        sanitizedValue = urlResult.sanitizedValue;
        break;

      case 'date':
        const dateResult = this.validateDate(sanitizedValue, rule);
        if (!dateResult.isValid) errors.push(...dateResult.errors);
        sanitizedValue = dateResult.sanitizedValue;
        break;

      case 'array':
        const arrayResult = this.validateArray(sanitizedValue, rule);
        if (!arrayResult.isValid) errors.push(...arrayResult.errors);
        sanitizedValue = arrayResult.sanitizedValue;
        break;

      case 'object':
        const objectResult = this.validateObject(sanitizedValue, rule);
        if (!objectResult.isValid) errors.push(...objectResult.errors);
        sanitizedValue = objectResult.sanitizedValue;
        break;

      case 'custom':
        if (rule.customValidator) {
          const result = rule.customValidator(sanitizedValue);
          if (result !== true) {
            errors.push({
              field: rule.field,
              message: typeof result === 'string' ? result : `Invalid ${rule.field}`,
              value: sanitizedValue,
              rule: 'custom'
            });
          }
        }
        break;
    }

    // Enum validation
    if (rule.enumValues && !rule.enumValues.includes(sanitizedValue)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be one of: ${rule.enumValues.join(', ')}`,
        value: sanitizedValue,
        rule: 'enum'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue,
      warnings
    };
  }

  /**
   * Validate string
   */
  private validateString(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: string;
    warnings: string[];
  } {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    let sanitizedValue = String(value);

    // Sanitize if enabled
    if (rule.sanitize) {
      const sanitizationResult = this.sanitizeString(sanitizedValue);
      sanitizedValue = sanitizationResult.sanitized;
      warnings.push(...sanitizationResult.warnings);
    }

    // Length validation
    if (rule.minLength !== undefined && sanitizedValue.length < rule.minLength) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be at least ${rule.minLength} characters long`,
        value: sanitizedValue,
        rule: 'minLength'
      });
    }

    if (rule.maxLength !== undefined && sanitizedValue.length > rule.maxLength) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be at most ${rule.maxLength} characters long`,
        value: sanitizedValue,
        rule: 'maxLength'
      });
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(sanitizedValue)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} format is invalid`,
        value: sanitizedValue,
        rule: 'pattern'
      });
    }

    return { isValid: errors.length === 0, errors, sanitizedValue, warnings };
  }

  /**
   * Validate number
   */
  private validateNumber(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: number;
  } {
    const errors: ValidationError[] = [];
    const numValue = Number(value);

    if (isNaN(numValue)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be a valid number`,
        value,
        rule: 'type'
      });
      return { isValid: false, errors, sanitizedValue: 0 };
    }

    if (rule.min !== undefined && numValue < rule.min) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be at least ${rule.min}`,
        value: numValue,
        rule: 'min'
      });
    }

    if (rule.max !== undefined && numValue > rule.max) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be at most ${rule.max}`,
        value: numValue,
        rule: 'max'
      });
    }

    return { isValid: errors.length === 0, errors, sanitizedValue: numValue };
  }

  /**
   * Validate boolean
   */
  private validateBoolean(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: boolean;
  } {
    const errors: ValidationError[] = [];
    let boolValue: boolean;

    if (typeof value === 'boolean') {
      boolValue = value;
    } else if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1') {
        boolValue = true;
      } else if (lowerValue === 'false' || lowerValue === '0') {
        boolValue = false;
      } else {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be a valid boolean`,
          value,
          rule: 'type'
        });
        return { isValid: false, errors, sanitizedValue: false };
      }
    } else if (typeof value === 'number') {
      boolValue = Boolean(value);
    } else {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be a valid boolean`,
        value,
        rule: 'type'
      });
      return { isValid: false, errors, sanitizedValue: false };
    }

    return { isValid: true, errors, sanitizedValue: boolValue };
  }

  /**
   * Validate email
   */
  private validateEmail(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: string;
  } {
    const errors: ValidationError[] = [];
    const emailValue = String(value).trim().toLowerCase();

    if (!validator.isEmail(emailValue)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be a valid email address`,
        value: emailValue,
        rule: 'email'
      });
    }

    return { isValid: errors.length === 0, errors, sanitizedValue: emailValue };
  }

  /**
   * Validate URL
   */
  private validateUrl(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: string;
  } {
    const errors: ValidationError[] = [];
    const urlValue = String(value).trim();

    if (!validator.isURL(urlValue, {
      protocols: this.sanitizationConfig.xss.allowedProtocols,
      require_protocol: true
    })) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be a valid URL`,
        value: urlValue,
        rule: 'url'
      });
    }

    return { isValid: errors.length === 0, errors, sanitizedValue: urlValue };
  }

  /**
   * Validate date
   */
  private validateDate(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: Date;
  } {
    const errors: ValidationError[] = [];
    let dateValue: Date;

    if (value instanceof Date) {
      dateValue = value;
    } else {
      dateValue = new Date(value);
    }

    if (isNaN(dateValue.getTime())) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be a valid date`,
        value,
        rule: 'date'
      });
      return { isValid: false, errors, sanitizedValue: new Date() };
    }

    return { isValid: true, errors, sanitizedValue: dateValue };
  }

  /**
   * Validate array
   */
  private validateArray(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: any[];
  } {
    const errors: ValidationError[] = [];

    if (!Array.isArray(value)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be an array`,
        value,
        rule: 'array'
      });
      return { isValid: false, errors, sanitizedValue: [] };
    }

    const sanitizedArray = [...value];

    // Length validation
    if (rule.minLength !== undefined && sanitizedArray.length < rule.minLength) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must have at least ${rule.minLength} items`,
        value: sanitizedArray,
        rule: 'minLength'
      });
    }

    if (rule.maxLength !== undefined && sanitizedArray.length > rule.maxLength) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must have at most ${rule.maxLength} items`,
        value: sanitizedArray,
        rule: 'maxLength'
      });
    }

    // Validate array items if rule is provided
    if (rule.arrayOf) {
      for (let i = 0; i < sanitizedArray.length; i++) {
        const itemRule = { ...rule.arrayOf, field: `${rule.field}[${i}]` };
        const itemResult = this.validateField(sanitizedArray[i], itemRule);
        
        if (!itemResult.isValid) {
          errors.push(...itemResult.errors);
        }
        
        sanitizedArray[i] = itemResult.sanitizedValue;
      }
    }

    return { isValid: errors.length === 0, errors, sanitizedValue: sanitizedArray };
  }

  /**
   * Validate object
   */
  private validateObject(value: any, rule: ValidationRule): {
    isValid: boolean;
    errors: ValidationError[];
    sanitizedValue: any;
  } {
    const errors: ValidationError[] = [];

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be an object`,
        value,
        rule: 'object'
      });
      return { isValid: false, errors, sanitizedValue: {} };
    }

    const sanitizedObject = { ...value };

    // Validate object properties if schema is provided
    if (rule.objectSchema) {
      for (const propertyRule of rule.objectSchema) {
        const propertyValue = sanitizedObject[propertyRule.field];
        const propertyResult = this.validateField(propertyValue, propertyRule);
        
        if (!propertyResult.isValid) {
          errors.push(...propertyResult.errors.map(error => ({
            ...error,
            field: `${rule.field}.${error.field}`
          })));
        }
        
        sanitizedObject[propertyRule.field] = propertyResult.sanitizedValue;
      }
    }

    return { isValid: errors.length === 0, errors, sanitizedValue: sanitizedObject };
  }

  /**
   * Sanitize string content
   */
  private sanitizeString(value: string): {
    sanitized: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let sanitized = value;

    // XSS protection
    if (this.sanitizationConfig.xss.enablePurify) {
      const originalLength = sanitized.length;
      sanitized = DOMPurify.sanitize(sanitized, {
        ALLOWED_TAGS: this.sanitizationConfig.html.allowedTags,
        ALLOWED_ATTR: Object.keys(this.sanitizationConfig.html.allowedAttributes),
        STRIP_TAGS: this.sanitizationConfig.html.stripTags
      });
      
      if (sanitized.length !== originalLength) {
        warnings.push('Content was sanitized for security reasons');
      }
    }

    // SQL injection protection
    if (this.sanitizationConfig.sql.escapeQuotes) {
      sanitized = sanitized.replace(/'/g, "''").replace(/"/g, '""');
    }

    if (this.sanitizationConfig.sql.removeComments) {
      sanitized = sanitized.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return { sanitized, warnings };
  }

  /**
   * Check for suspicious patterns
   */
  private checkSuspiciousPatterns(data: any): string[] {
    const warnings: string[] = [];
    const dataString = JSON.stringify(data).toLowerCase();

    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(dataString)) {
        warnings.push(`Suspicious pattern detected: ${pattern.source}`);
        
        // Log security warning
        logger.warn('Suspicious input pattern detected', {
          component: 'InputValidation',
          pattern: pattern.source,
          data: dataString.substring(0, 100) // First 100 chars for context
        });
      }
    }

    return warnings;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Set nested value in object
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    if (!lastKey) return;

    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

  /**
   * Validate file upload
   */
  validateFileUpload(file: {
    name: string;
    size: number;
    mimetype: string;
  }): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Check file size
    if (file.size > this.sanitizationConfig.fileUpload.maxFileSize) {
      errors.push({
        field: 'file',
        message: `File size exceeds maximum allowed size of ${this.sanitizationConfig.fileUpload.maxFileSize} bytes`,
        value: file.size,
        rule: 'fileSize'
      });
    }

    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!this.sanitizationConfig.fileUpload.allowedExtensions.includes(extension)) {
      errors.push({
        field: 'file',
        message: `File extension ${extension} is not allowed`,
        value: extension,
        rule: 'fileExtension'
      });
    }

    // Check MIME type
    if (!this.sanitizationConfig.fileUpload.allowedMimeTypes.includes(file.mimetype)) {
      errors.push({
        field: 'file',
        message: `MIME type ${file.mimetype} is not allowed`,
        value: file.mimetype,
        rule: 'mimeType'
      });
    }

    // Check for suspicious file names
    const suspiciousFilePatterns = [
      /\.(exe|bat|cmd|com|pif|scr|vbs|js|jar|sh|php|asp|aspx|jsp)$/i,
      /\.\./,
      /[<>:"|?*]/
    ];

    for (const pattern of suspiciousFilePatterns) {
      if (pattern.test(file.name)) {
        warnings.push('Suspicious file name pattern detected');
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: {
        name: this.sanitizeFileName(file.name),
        size: file.size,
        mimetype: file.mimetype
      },
      warnings
    };
  }

  /**
   * Sanitize file name
   */
  private sanitizeFileName(fileName: string): string {
    // Remove dangerous characters
    let sanitized = fileName.replace(/[<>:"|?*]/g, '');
    
    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\./g, '');
    
    // Limit length
    if (sanitized.length > 255) {
      const extension = sanitized.split('.').pop();
      const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
      sanitized = nameWithoutExt.substring(0, 250 - (extension?.length || 0)) + '.' + extension;
    }
    
    return sanitized;
  }

  /**
   * Get common validation rules
   */
  getCommonRules(): Record<string, ValidationRule> {
    return {
      username: {
        field: 'username',
        type: 'string',
        required: true,
        minLength: 3,
        maxLength: 30,
        pattern: this.commonPatterns.username,
        sanitize: true
      },
      
      email: {
        field: 'email',
        type: 'email',
        required: true,
        maxLength: 255,
        sanitize: true
      },
      
      password: {
        field: 'password',
        type: 'string',
        required: true,
        minLength: 8,
        maxLength: 128,
        pattern: this.commonPatterns.password
      },
      
      title: {
        field: 'title',
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 200,
        sanitize: true
      },
      
      description: {
        field: 'description',
        type: 'string',
        required: false,
        maxLength: 1000,
        sanitize: true
      },
      
      id: {
        field: 'id',
        type: 'string',
        required: true,
        pattern: this.commonPatterns.uuid
      },
      
      slug: {
        field: 'slug',
        type: 'string',
        required: true,
        pattern: this.commonPatterns.slug,
        maxLength: 100
      }
    };
  }

  /**
   * Validate quiz question data
   */
  validateQuestionData(data: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'content',
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 1000,
        sanitize: true
      },
      {
        field: 'category',
        type: 'string',
        required: true,
        enumValues: ['science', 'history', 'sports', 'entertainment', 'geography', 'literature']
      },
      {
        field: 'difficulty',
        type: 'string',
        required: true,
        enumValues: ['easy', 'medium', 'hard']
      },
      {
        field: 'options',
        type: 'array',
        required: true,
        minLength: 2,
        maxLength: 6,
        arrayOf: {
          field: 'option',
          type: 'string',
          required: true,
          minLength: 1,
          maxLength: 200,
          sanitize: true
        }
      },
      {
        field: 'correctAnswer',
        type: 'number',
        required: true,
        min: 0,
        max: 5
      },
      {
        field: 'explanation',
        type: 'string',
        required: false,
        maxLength: 500,
        sanitize: true
      },
      {
        field: 'timeLimit',
        type: 'number',
        required: false,
        min: 5,
        max: 300
      }
    ];

    return this.validate(data, rules);
  }

  /**
   * Validate user registration data
   */
  validateUserRegistration(data: any): ValidationResult {
    const rules: ValidationRule[] = [
      this.getCommonRules().username,
      this.getCommonRules().email,
      this.getCommonRules().password,
      {
        field: 'confirmPassword',
        type: 'string',
        required: true,
        customValidator: (value) => {
          return value === data.password || 'Passwords do not match';
        }
      },
      {
        field: 'firstName',
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 50,
        pattern: /^[a-zA-Z\s]+$/,
        sanitize: true
      },
      {
        field: 'lastName',
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 50,
        pattern: /^[a-zA-Z\s]+$/,
        sanitize: true
      },
      {
        field: 'terms',
        type: 'boolean',
        required: true,
        customValidator: (value) => {
          return value === true || 'You must accept the terms and conditions';
        }
      }
    ];

    return this.validate(data, rules);
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    rulesCount: number;
    suspiciousPatterns: number;
    allowedFileExtensions: number;
    maxFileSize: number;
  } {
    return {
      rulesCount: Object.keys(this.commonPatterns).length,
      suspiciousPatterns: this.suspiciousPatterns.length,
      allowedFileExtensions: this.sanitizationConfig.fileUpload.allowedExtensions.length,
      maxFileSize: this.sanitizationConfig.fileUpload.maxFileSize
    };
  }
}

export default InputValidation;

