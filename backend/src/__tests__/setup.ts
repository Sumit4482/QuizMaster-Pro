import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { connectRedis, disconnectRedis } from '@/config/redis';
import { config } from '@/config/environment';

const execAsync = promisify(exec);

// Test database client
export const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
    },
  },
});

// Setup before all tests
beforeAll(async () => {
  // Connect to Redis for tests
  try {
    await connectRedis();
  } catch (error) {
    console.warn('Redis not available for tests:', error);
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Disconnect from databases
  await testDb.$disconnect();
  
  try {
    await disconnectRedis();
  } catch (error) {
    console.warn('Redis cleanup failed:', error);
  }
});

// Clean database before each test
beforeEach(async () => {
  // Clean up test data in correct order of dependencies
  try {
    // First, delete all dependent records that reference users or questions
    await testDb.questionAudit.deleteMany({});
    await testDb.quizAnswer.deleteMany({});
    await testDb.quizSession.deleteMany({});
    await testDb.quizResult.deleteMany({});
    await testDb.userSession.deleteMany({});
    await testDb.questionCategory.deleteMany({});
    await testDb.aiGeneratedQuestion.deleteMany({});
    await testDb.aiGeneration.deleteMany({});
    await testDb.aiUsage.deleteMany({});
    
    // Then delete main entities
    await testDb.question.deleteMany({});
    await testDb.category.deleteMany({});
    await testDb.user.deleteMany({});
  } catch (error) {
    console.warn('Database cleanup failed, ignoring for tests:', error);
  }
});

// Helper function to create test user
export const createTestUser = async (overrides: any = {}) => {
  return await testDb.user.create({
    data: {
      email: overrides.email || 'test@example.com',
      username: overrides.username || 'testuser',
      passwordHash: overrides.passwordHash || '$2b$12$test.hash.for.testing.only',
      firstName: overrides.firstName || 'Test',
      lastName: overrides.lastName || 'User',
      role: overrides.role || 'PLAYER',
      ...overrides,
    },
  });
};

// Helper function to create test category
export const createTestCategory = async (overrides: any = {}) => {
  return await testDb.category.create({
    data: {
      name: overrides.name || 'Test Category',
      slug: overrides.slug || 'test-category',
      description: overrides.description || 'Test category description',
      ...overrides,
    },
  });
};

// Helper function to create test question
export const createTestQuestion = async (userId: string, overrides: any = {}) => {
  return await testDb.question.create({
    data: {
      questionText: overrides.questionText || 'What is the answer to life?',
      questionType: overrides.questionType || 'MULTIPLE_CHOICE',
      options: overrides.options || ['40', '41', '42', '43'],
      correctAnswer: overrides.correctAnswer || 2,
      explanation: overrides.explanation || 'The answer is 42',
      difficultyLevel: overrides.difficultyLevel || 1,
      points: overrides.points || 10,
      source: overrides.source || 'manual',
      tags: overrides.tags || [],
      createdById: userId,
      ...overrides,
    },
  });
};

// Helper to generate JWT token for testing
export const generateTestToken = () => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      sub: 'test-user-id',
      email: 'test@example.com',
      username: 'testuser',
      role: 'PLAYER',
      jti: 'test-jti',
    },
    config.JWT.SECRET,
    { expiresIn: '1h' }
  );
};
