import { PrismaClient } from '@prisma/client';
import { QuestionService } from '@/services/questionService';
import { testDb, createTestUser, createTestCategory } from '../setup';

// Mock the prisma client
jest.mock('@/config/database', () => ({
  prisma: testDb,
}));

describe('QuestionService - Unit Tests', () => {
  let questionService: QuestionService;

  beforeEach(() => {
    questionService = new QuestionService();
  });

  describe('createQuestion', () => {
    it('should create a question successfully', async () => {
      const user = await createTestUser({ email: 'test@example.com' });
      const category = await createTestCategory({ name: 'Test Category' });

      const questionData = {
        questionText: 'What is the capital of France?',
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        correctAnswer: 2,
        explanation: 'Paris is the capital of France',
        difficultyLevel: 2,
        categoryIds: [category.id],
        tags: ['geography', 'europe'],
      };

      const result = await questionService.createQuestion(user.id, questionData);

      expect(result.success).toBe(true);
      expect(result.data.question.questionText).toBe(questionData.questionText);
      expect(result.data.question.questionType).toBe(questionData.questionType);
      expect(result.data.question.correctAnswer).toBe(questionData.correctAnswer);
      expect(result.data.question.createdById).toBe(user.id);
    });

    it('should validate required fields', async () => {
      const user = await createTestUser();

      const invalidData = {
        questionText: '', // Empty required field
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['A', 'B'],
        correctAnswer: 0,
      };

      await expect(
        questionService.createQuestion(user.id, invalidData as any)
      ).rejects.toThrow();
    });

    it('should validate correct answer index for multiple choice', async () => {
      const user = await createTestUser();

      const invalidData = {
        questionText: 'Test question?',
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['A', 'B'],
        correctAnswer: 5, // Invalid index
      };

      await expect(
        questionService.createQuestion(user.id, invalidData as any)
      ).rejects.toThrow('correct answer index');
    });

    it('should handle duplicate questions gracefully', async () => {
      const user = await createTestUser();

      const questionData = {
        questionText: 'Duplicate question?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: true,
        explanation: 'Test explanation',
      };

      // Create first question
      await questionService.createQuestion(user.id, questionData);

      // Attempt to create duplicate
      const result = await questionService.createQuestion(user.id, questionData);
      
      // Should either succeed with new ID or handle gracefully
      expect(result.success).toBe(true);
    });
  });

  describe('getQuestions', () => {
    it('should retrieve questions with pagination', async () => {
      const user = await createTestUser();

      // Create multiple test questions
      for (let i = 0; i < 5; i++) {
        await questionService.createQuestion(user.id, {
          questionText: `Test question ${i}?`,
          questionType: 'MULTIPLE_CHOICE' as const,
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 0,
        });
      }

      const result = await questionService.getQuestions({
        page: 1,
        limit: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data.questions).toHaveLength(3);
      expect(result.data.pagination.page).toBe(1);
      expect(result.data.pagination.totalPages).toBeGreaterThan(0);
    });

    it('should filter questions by category', async () => {
      const user = await createTestUser();
      const category1 = await createTestCategory({ name: 'Math' });
      const category2 = await createTestCategory({ name: 'Science' });

      await questionService.createQuestion(user.id, {
        questionText: 'Math question?',
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['1', '2', '3', '4'],
        correctAnswer: 0,
        categoryIds: [category1.id],
      });

      await questionService.createQuestion(user.id, {
        questionText: 'Science question?',
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 1,
        categoryIds: [category2.id],
      });

      const result = await questionService.getQuestions({
        categoryIds: [category1.id],
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.questions).toHaveLength(1);
      expect(result.data.questions[0].questionText).toBe('Math question?');
    });

    it('should filter questions by difficulty level', async () => {
      const user = await createTestUser();

      await questionService.createQuestion(user.id, {
        questionText: 'Easy question?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: true,
        difficultyLevel: 1,
      });

      await questionService.createQuestion(user.id, {
        questionText: 'Hard question?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: false,
        difficultyLevel: 4,
      });

      const result = await questionService.getQuestions({
        difficultyLevels: [1],
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.questions).toHaveLength(1);
      expect(result.data.questions[0].difficultyLevel).toBe(1);
    });
  });

  describe('updateQuestion', () => {
    it('should update question successfully', async () => {
      const user = await createTestUser();

      const question = await questionService.createQuestion(user.id, {
        questionText: 'Original question?',
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['A', 'B'],
        correctAnswer: 0,
      });

      const updateData = {
        questionText: 'Updated question?',
        explanation: 'Updated explanation',
      };

      const result = await questionService.updateQuestion(
        question.data.question.id,
        user.id,
        updateData
      );

      expect(result.success).toBe(true);
      expect(result.data.question.questionText).toBe(updateData.questionText);
      expect(result.data.question.explanation).toBe(updateData.explanation);
    });

    it('should reject unauthorized updates', async () => {
      const user1 = await createTestUser({ email: 'user1@example.com' });
      const user2 = await createTestUser({ email: 'user2@example.com' });

      const question = await questionService.createQuestion(user1.id, {
        questionText: 'Original question?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: true,
      });

      await expect(
        questionService.updateQuestion(
          question.data.question.id,
          user2.id,
          { questionText: 'Hacked question?' }
        )
      ).rejects.toThrow();
    });
  });

  describe('deleteQuestion', () => {
    it('should delete question successfully', async () => {
      const user = await createTestUser();

      const question = await questionService.createQuestion(user.id, {
        questionText: 'To be deleted?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: true,
      });

      const result = await questionService.deleteQuestion(
        question.data.question.id,
        user.id
      );

      expect(result.success).toBe(true);

      // Verify question is deleted
      const getResult = await questionService.getQuestion(question.data.question.id);
      expect(getResult.success).toBe(false);
    });

    it('should reject unauthorized deletions', async () => {
      const user1 = await createTestUser({ email: 'owner@example.com' });
      const user2 = await createTestUser({ email: 'hacker@example.com' });

      const question = await questionService.createQuestion(user1.id, {
        questionText: 'Protected question?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: true,
      });

      await expect(
        questionService.deleteQuestion(question.data.question.id, user2.id)
      ).rejects.toThrow();
    });
  });

  describe('searchQuestions', () => {
    it('should search questions by text', async () => {
      const user = await createTestUser();

      await questionService.createQuestion(user.id, {
        questionText: 'What is JavaScript?',
        questionType: 'TEXT_INPUT' as const,
        correctAnswer: 'programming language',
        tags: ['programming', 'javascript'],
      });

      await questionService.createQuestion(user.id, {
        questionText: 'What is Python?',
        questionType: 'TEXT_INPUT' as const,
        correctAnswer: 'programming language',
        tags: ['programming', 'python'],
      });

      const result = await questionService.searchQuestions('JavaScript', {
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.questions).toHaveLength(1);
      expect(result.data.questions[0].questionText).toContain('JavaScript');
    });

    it('should search questions by tags', async () => {
      const user = await createTestUser();

      await questionService.createQuestion(user.id, {
        questionText: 'Programming question 1?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: true,
        tags: ['programming', 'beginner'],
      });

      await questionService.createQuestion(user.id, {
        questionText: 'Math question 1?',
        questionType: 'TRUE_FALSE' as const,
        correctAnswer: false,
        tags: ['math', 'algebra'],
      });

      const result = await questionService.getQuestions({
        tags: ['programming'],
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.questions).toHaveLength(1);
      expect(result.data.questions[0].tags).toContain('programming');
    });
  });

  describe('validateQuestion', () => {
    it('should validate question structure', async () => {
      const validQuestion = {
        questionText: 'Valid question?',
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 2,
        explanation: 'C is correct',
      };

      const result = questionService.validateQuestionData(validQuestion);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid question types', async () => {
      const invalidQuestion = {
        questionText: 'Invalid question?',
        questionType: 'INVALID_TYPE' as any,
        options: ['A', 'B'],
        correctAnswer: 0,
      };

      const result = questionService.validateQuestionData(invalidQuestion);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate multiple choice options', async () => {
      const invalidQuestion = {
        questionText: 'Question with no options?',
        questionType: 'MULTIPLE_CHOICE' as const,
        options: [], // Empty options array
        correctAnswer: 0,
      };

      const result = questionService.validateQuestionData(invalidQuestion);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('options'))).toBe(true);
    });
  });
});
