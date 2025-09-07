import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './environment';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'QuizMaster Pro API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for QuizMaster Pro - A modern quiz application with real-time features',
      contact: {
        name: 'QuizMaster Pro Team',
        email: 'support@quizmasterpro.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.PORT}`,
        description: 'Development server',
      },
      {
        url: 'https://api.quizmasterpro.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT Bearer token',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  example: 'Invalid input data',
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  example: ['Email is required', 'Password must be at least 8 characters'],
                },
                stack: {
                  type: 'string',
                  description: 'Stack trace (development only)',
                },
              },
              required: ['code', 'message'],
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
            correlationId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
          },
          required: ['success', 'error', 'timestamp'],
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            username: {
              type: 'string',
              example: 'johndoe',
            },
            firstName: {
              type: 'string',
              example: 'John',
            },
            lastName: {
              type: 'string',
              example: 'Doe',
            },
            role: {
              type: 'string',
              enum: ['PLAYER', 'HOST', 'ADMIN'],
              example: 'PLAYER',
            },
            emailVerified: {
              type: 'boolean',
              example: true,
            },
            avatarUrl: {
              type: 'string',
              nullable: true,
              example: 'https://example.com/avatar.jpg',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2024-01-01T12:00:00.000Z',
            },
          },
          required: ['id', 'email', 'username', 'firstName', 'lastName', 'role', 'emailVerified', 'createdAt'],
        },
        Question: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            questionText: {
              type: 'string',
              example: 'What is the capital of France?',
            },
            questionType: {
              type: 'string',
              enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT_INPUT'],
              example: 'MULTIPLE_CHOICE',
            },
            options: {
              type: 'object',
              properties: {
                options: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  example: ['Paris', 'London', 'Berlin', 'Rome'],
                },
                shuffle: {
                  type: 'boolean',
                  example: true,
                },
              },
            },
            correctAnswer: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
                { type: 'boolean' },
              ],
              example: 'Paris',
            },
            explanation: {
              type: 'string',
              nullable: true,
              example: 'Paris is the capital and largest city of France.',
            },
            hints: {
              type: 'array',
              items: {
                type: 'string',
              },
              nullable: true,
              example: ['It is known as the City of Light', 'Famous for the Eiffel Tower'],
            },
            difficultyLevel: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              example: 2,
            },
            points: {
              type: 'integer',
              minimum: 1,
              example: 10,
            },
            estimatedTime: {
              type: 'integer',
              description: 'Estimated time in seconds',
              example: 30,
            },
            categories: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Category',
              },
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            isPublished: {
              type: 'boolean',
              example: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
          },
          required: ['id', 'questionText', 'questionType', 'correctAnswer', 'difficultyLevel', 'points', 'isActive', 'isPublished'],
        },
        Category: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            name: {
              type: 'string',
              example: 'Science',
            },
            slug: {
              type: 'string',
              example: 'science',
            },
            description: {
              type: 'string',
              nullable: true,
              example: 'Questions related to various scientific topics',
            },
            icon: {
              type: 'string',
              nullable: true,
              example: '🧪',
            },
            color: {
              type: 'string',
              nullable: true,
              example: '#0ea5e9',
            },
            parentId: {
              type: 'integer',
              nullable: true,
              example: null,
            },
            sortOrder: {
              type: 'integer',
              example: 1,
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
          },
          required: ['id', 'name', 'slug', 'sortOrder', 'isActive', 'createdAt', 'updatedAt'],
        },
        QuizSession: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            userId: {
              type: 'string',
              format: 'uuid',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            totalQuestions: {
              type: 'integer',
              example: 10,
            },
            timePerQuestion: {
              type: 'integer',
              description: 'Time limit per question in seconds',
              example: 60,
            },
            categoryIds: {
              type: 'array',
              items: {
                type: 'integer',
              },
              example: [1, 2, 3],
            },
            difficultyLevels: {
              type: 'array',
              items: {
                type: 'integer',
                minimum: 1,
                maximum: 5,
              },
              example: [1, 2, 3],
            },
            questionTypes: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT_INPUT'],
              },
              example: ['MULTIPLE_CHOICE'],
            },
            shuffleQuestions: {
              type: 'boolean',
              example: true,
            },
            allowPause: {
              type: 'boolean',
              example: true,
            },
            showExplanations: {
              type: 'boolean',
              example: true,
            },
            status: {
              type: 'string',
              enum: ['CREATED', 'STARTED', 'PAUSED', 'COMPLETED', 'EXPIRED'],
              example: 'CREATED',
            },
            currentQuestionIndex: {
              type: 'integer',
              example: 0,
            },
            questionsAnswered: {
              type: 'integer',
              example: 0,
            },
            correctAnswers: {
              type: 'integer',
              example: 0,
            },
            totalScore: {
              type: 'integer',
              example: 0,
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T18:00:00.000Z',
            },
            totalTimeTaken: {
              type: 'integer',
              description: 'Total time taken in seconds',
              example: 0,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T12:00:00.000Z',
            },
          },
          required: ['id', 'userId', 'totalQuestions', 'categoryIds', 'difficultyLevels', 'questionTypes', 'status', 'currentQuestionIndex', 'questionsAnswered', 'correctAnswers', 'totalScore', 'expiresAt', 'totalTimeTaken', 'createdAt', 'updatedAt'],
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Authentication',
        description: 'User authentication and authorization',
      },
      {
        name: 'Users',
        description: 'User management',
      },
      {
        name: 'Categories',
        description: 'Question categories management',
      },
      {
        name: 'Questions',
        description: 'Question management and search',
      },
      {
        name: 'Quiz Sessions',
        description: 'Quiz session lifecycle management',
      },
      {
        name: 'Quiz Gameplay',
        description: 'Quiz gameplay and answer submission',
      },
      {
        name: 'Quiz Results',
        description: 'Quiz results and statistics',
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
