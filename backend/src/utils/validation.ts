import Joi from 'joi';
import { validatePassword, validateEmail, validateUsername } from './auth';

// Using standard Joi validation

// Authentication validation schemas
export const authValidation = {
  register: Joi.object({
    email: Joi.string().email().required(),
    username: Joi.string().min(3).max(30).alphanum().required(),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')).required(),
    firstName: Joi.string().min(1).max(100).optional(),
    lastName: Joi.string().min(1).max(100).optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(1).required(),
    rememberMe: Joi.boolean().optional(),
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required(),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
      .messages({ 'any.only': 'Passwords do not match' }),
  }),
};

// User validation schemas
export const userValidation = {
  updateProfile: Joi.object({
    firstName: Joi.string().min(1).max(100).optional(),
    lastName: Joi.string().min(1).max(100).optional(),
    avatarUrl: Joi.string().uri().optional(),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')).required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
      .messages({ 'any.only': 'Passwords do not match' }),
  }),
};

// Question validation schemas (for future use)
export const questionValidation = {
  create: Joi.object({
    categoryId: Joi.number().integer().positive().optional(),
    questionText: Joi.string().min(10).max(1000).required(),
    questionType: Joi.string().valid('MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT_INPUT').required(),
    options: Joi.when('questionType', {
      is: 'MULTIPLE_CHOICE',
      then: Joi.array().items(Joi.string().min(1).max(200)).min(2).max(6).required(),
      otherwise: Joi.optional(),
    }),
    correctAnswer: Joi.string().min(1).max(500).required(),
    explanation: Joi.string().max(1000).optional(),
    difficultyLevel: Joi.number().integer().min(1).max(5).default(1),
  }),

  update: Joi.object({
    categoryId: Joi.number().integer().positive().optional(),
    questionText: Joi.string().min(10).max(1000).optional(),
    questionType: Joi.string().valid('MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT_INPUT').optional(),
    options: Joi.when('questionType', {
      is: 'MULTIPLE_CHOICE',
      then: Joi.array().items(Joi.string().min(1).max(200)).min(2).max(6).optional(),
      otherwise: Joi.optional(),
    }),
    correctAnswer: Joi.string().min(1).max(500).optional(),
    explanation: Joi.string().max(1000).optional(),
    difficultyLevel: Joi.number().integer().min(1).max(5).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

// Common validation schemas
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const commonValidation = {
  pagination: paginationSchema,
  uuid: Joi.string().guid({ version: 'uuidv4' }),
  uuidParams: Joi.object({
    id: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  sessionParams: Joi.object({
    sessionId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  search: Joi.object({
    q: Joi.string().min(1).max(100).optional(),
    filters: Joi.object().optional(),
    pagination: paginationSchema.optional(),
  }),
};

// Validation middleware helper
export function validate(schema: Joi.ObjectSchema) {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { errors: validationErrors },
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
}

// Query parameter validation helper
export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter validation failed',
          details: { errors: validationErrors },
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Replace req.query with validated data
    req.query = value;
    next();
  };
}

// Params validation helper
export function validateParams(schema: Joi.ObjectSchema) {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'URL parameter validation failed',
          details: { errors: validationErrors },
        },
        timestamp: new Date().toISOString(),
      });
    }

    req.params = value;
    next();
  };
}
