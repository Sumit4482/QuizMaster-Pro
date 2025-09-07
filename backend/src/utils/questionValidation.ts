import Joi from 'joi';
import { QuestionType, DifficultyLevel, QuestionSource } from '../types/question';

// Helper schemas
const uuidSchema = Joi.string().uuid().required();
const slugSchema = Joi.string().min(1).max(100).pattern(/^[a-z0-9-]+$/);
const tagSchema = Joi.string().min(1).max(50).trim();
const colorSchema = Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/);

// Question metadata validation
const questionMetadataSchema = Joi.object({
  imageUrl: Joi.string().uri(),
  audioUrl: Joi.string().uri(),
  videoUrl: Joi.string().uri(),
  references: Joi.array().items(Joi.string().uri()),
  learningObjectives: Joi.array().items(Joi.string().min(1).max(200))
});

// Multiple choice options validation
const multipleChoiceOptionsSchema = Joi.object({
  options: Joi.array().items(Joi.string().min(1).max(500)).min(2).max(6).required(),
  shuffle: Joi.boolean().default(true)
});

// Multiple choice correct answer validation
const multipleChoiceCorrectAnswerSchema = Joi.object({
  type: Joi.string().valid('single', 'multiple').required(),
  indices: Joi.array().items(Joi.number().integer().min(0)).min(1).required()
}).custom((value, helpers) => {
  if (value.type === 'single' && value.indices.length > 1) {
    return helpers.error('correctAnswer.singleChoice');
  }
  return value;
});

// True/false correct answer validation
const trueFalseCorrectAnswerSchema = Joi.object({
  value: Joi.boolean().required()
});

// Text input correct answer validation
const textInputCorrectAnswerSchema = Joi.object({
  type: Joi.string().valid('exact', 'contains', 'regex').required(),
  value: Joi.alternatives().try(
    Joi.string().min(1).max(500),
    Joi.array().items(Joi.string().min(1).max(500)).min(1)
  ).required(),
  caseSensitive: Joi.boolean().default(false)
});

// Base question validation
const baseQuestionSchema = {
  questionText: Joi.string().min(10).max(2000).required().messages({
    'string.min': 'Question text must be at least 10 characters long',
    'string.max': 'Question text cannot exceed 2000 characters',
    'any.required': 'Question text is required'
  }),
  questionType: Joi.string().valid(...Object.values(QuestionType)).required(),
  explanation: Joi.string().max(1000).allow(''),
  hints: Joi.array().items(Joi.string().min(1).max(200)).max(3),
  difficultyLevel: Joi.number().integer().min(1).max(4).required(),
  estimatedTime: Joi.number().integer().min(5).max(600).default(30),
  points: Joi.number().integer().min(1).max(100).required(),
  tags: Joi.array().items(tagSchema).max(10).default([]),
  metadata: questionMetadataSchema
};

// Create question validation
export const createQuestionValidation = Joi.object({
  ...baseQuestionSchema,
  options: Joi.any().optional(),
  correctAnswer: Joi.any().required(),
  categoryIds: Joi.array().items(Joi.number().integer().min(1)).min(1).max(5).required()
});

// Update question validation
export const updateQuestionValidation = Joi.object({
  ...baseQuestionSchema,
  categoryIds: Joi.array().items(Joi.number().integer().min(1)).min(1).max(5),
  isPublished: Joi.boolean()
}).fork(
  ['questionText', 'questionType', 'difficultyLevel', 'points'],
  (schema) => schema.optional()
);

// Category validation
export const createCategoryValidation = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Category name must be at least 2 characters long',
    'string.max': 'Category name cannot exceed 100 characters',
    'any.required': 'Category name is required'
  }),
  slug: slugSchema.optional(),
  description: Joi.string().max(500).allow(''),
  icon: Joi.string().max(50),
  color: colorSchema,
  parentId: Joi.number().integer().min(1),
  sortOrder: Joi.number().integer().min(0).default(0)
});

export const updateCategoryValidation = Joi.object({
  name: Joi.string().min(2).max(100),
  slug: slugSchema,
  description: Joi.string().max(500).allow(''),
  icon: Joi.string().max(50),
  color: colorSchema,
  parentId: Joi.number().integer().min(1).allow(null),
  sortOrder: Joi.number().integer().min(0),
  isActive: Joi.boolean()
});

// Search parameters validation
export const questionSearchValidation = Joi.object({
  search: Joi.string().max(200).allow(''),
  categoryIds: Joi.alternatives().try(
    Joi.array().items(Joi.number().integer().min(1)),
    Joi.number().integer().min(1),
    Joi.string().pattern(/^\d+(,\d+)*$/).custom((value) => value.split(',').map((id: string) => parseInt(id, 10)))
  ).custom((value) => Array.isArray(value) ? value : [value]),
  
  // Support both singular and plural forms for backward compatibility
  questionType: Joi.string().valid(...Object.values(QuestionType)),
  questionTypes: Joi.alternatives().try(
    Joi.array().items(Joi.string().valid(...Object.values(QuestionType))),
    Joi.string().valid(...Object.values(QuestionType)),
    Joi.string().pattern(/^[A-Z_]+(,[A-Z_]+)*$/).custom((value) => value.split(','))
  ).custom((value) => Array.isArray(value) ? value : [value]),
  
  difficultyLevel: Joi.alternatives().try(
    Joi.array().items(Joi.number().integer().min(1).max(4)),
    Joi.number().integer().min(1).max(4),
    Joi.string().pattern(/^\d+(,\d+)*$/).custom((value) => value.split(',').map((id: string) => parseInt(id, 10)))
  ).custom((value) => Array.isArray(value) ? value : [value]),
  difficultyLevels: Joi.alternatives().try(
    Joi.array().items(Joi.number().integer().min(1).max(4)),
    Joi.number().integer().min(1).max(4),
    Joi.string().pattern(/^\d+(,\d+)*$/).custom((value) => value.split(',').map((id: string) => parseInt(id, 10)))
  ).custom((value) => Array.isArray(value) ? value : [value]),
  
  tags: Joi.alternatives().try(
    Joi.array().items(tagSchema),
    tagSchema
  ).custom((value) => Array.isArray(value) ? value : [value]),
  source: Joi.string().valid(...Object.values(QuestionSource)),
  isPublished: Joi.boolean(),
  createdBy: uuidSchema.optional(),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso().min(Joi.ref('dateFrom')),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'questionText', 'difficultyLevel', 'points').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
}).custom((value, helpers) => {
  // Normalize plural forms to singular forms
  if (value.questionTypes && !value.questionType) {
    value.questionType = Array.isArray(value.questionTypes) ? value.questionTypes[0] : value.questionTypes;
  }
  if (value.difficultyLevels && !value.difficultyLevel) {
    value.difficultyLevel = value.difficultyLevels;
  }
  
  // Clean up plural forms
  delete value.questionTypes;
  delete value.difficultyLevels;
  
  return value;
});

// Bulk operations validation
export const bulkQuestionOperationValidation = Joi.object({
  questionIds: Joi.array().items(uuidSchema).min(1).max(100).required(),
  operation: Joi.string().valid('delete', 'publish', 'unpublish', 'archive', 'assignCategory', 'removeTags', 'addTags').required(),
  data: Joi.object({
    categoryIds: Joi.array().items(Joi.number().integer().min(1)),
    tags: Joi.array().items(tagSchema)
  })
}).custom((value, helpers) => {
  const { operation, data } = value;
  
  if (operation === 'assignCategory' && (!data?.categoryIds || data.categoryIds.length === 0)) {
    return helpers.error('bulkOperation.missingCategories');
  }
  
  if ((operation === 'addTags' || operation === 'removeTags') && (!data?.tags || data.tags.length === 0)) {
    return helpers.error('bulkOperation.missingTags');
  }
  
  return value;
}).messages({
  'bulkOperation.missingCategories': 'Category assignment requires at least one category ID',
  'bulkOperation.missingTags': 'Tag operations require at least one tag'
});

// Question import validation (simplified)
export const questionImportValidation = Joi.object({
  questions: Joi.array().items(
    Joi.object({
      ...baseQuestionSchema,
      categoryNames: Joi.array().items(Joi.string().min(1).max(100)),
      options: Joi.any().optional(),
      correctAnswer: Joi.any().required()
    })
  ).min(1).max(1000).required(),
  categories: Joi.array().items(createCategoryValidation)
});

// Common parameter validations
export const commonValidation = {
  // UUID parameter validation
  uuidParams: Joi.object({
    id: uuidSchema
  }),
  
  // Numeric ID parameter validation
  numericIdParams: Joi.object({
    id: Joi.number().integer().min(1).required()
  }),
  
  // Pagination validation
  paginationQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

// Validation helper functions
export const validateQuestionType = (questionType: string, options: any, correctAnswer: any): string | null => {
  switch (questionType) {
    case QuestionType.MULTIPLE_CHOICE:
      if (!options || !options.options || !Array.isArray(options.options)) {
        return 'Multiple choice questions must have options array';
      }
      if (options.options.length < 2) {
        return 'Multiple choice questions must have at least 2 options';
      }
      if (!correctAnswer || !Array.isArray(correctAnswer.indices)) {
        return 'Multiple choice questions must have correct answer indices';
      }
      const maxIndex = options.options.length - 1;
      const invalidIndices = correctAnswer.indices.filter((index: number) => index < 0 || index > maxIndex);
      if (invalidIndices.length > 0) {
        return 'Correct answer indices must be valid option indices';
      }
      break;
      
    case QuestionType.TRUE_FALSE:
      if (!correctAnswer || typeof correctAnswer.value !== 'boolean') {
        return 'True/false questions must have a boolean correct answer';
      }
      break;
      
    case QuestionType.TEXT_INPUT:
      if (!correctAnswer || !correctAnswer.value) {
        return 'Text input questions must have a correct answer value';
      }
      if (!['exact', 'contains', 'regex'].includes(correctAnswer.type)) {
        return 'Text input questions must specify answer type (exact, contains, or regex)';
      }
      break;
      
    default:
      return 'Invalid question type';
  }
  
  return null;
};

// Question difficulty validation
export const validateDifficulty = (level: number): boolean => {
  return level >= 1 && level <= 4;
};

// Tag validation
export const validateTags = (tags: string[]): string | null => {
  if (tags.length > 10) {
    return 'Maximum 10 tags allowed per question';
  }
  
  for (const tag of tags) {
    if (tag.length === 0 || tag.length > 50) {
      return 'Tags must be between 1 and 50 characters';
    }
  }
  
  return null;
};
