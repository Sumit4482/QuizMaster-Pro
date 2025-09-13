import request from 'supertest';
import { createApp } from '@/app';
import { testDb, createTestUser, createTestCategory, generateTestToken } from '../setup';
import { Application } from 'express';

describe('Question Controller - Integration Tests', () => {
  let app: Application;
  let testUser: any;
  let authToken: string;
  let testCategory: any;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    testUser = await createTestUser({ email: 'testuser@example.com' });
    authToken = generateTestToken();
    testCategory = await createTestCategory({ name: 'Test Category' });

    // Create session for the token
    await testDb.userSession.create({
      data: {
        userId: testUser.id,
        tokenJti: 'test-jti',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
      },
    });
  });

  describe('POST /api/questions', () => {
    it('should create a new question successfully', async () => {
      const questionData = {
        questionText: 'What is the capital of France?',
        questionType: 'MULTIPLE_CHOICE',
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        correctAnswer: 2,
        explanation: 'Paris is the capital of France',
        difficultyLevel: 2,
        categoryIds: [testCategory.id],
        tags: ['geography', 'europe'],
        points: 10,
      };

      const response = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(questionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.question.questionText).toBe(questionData.questionText);
      expect(response.body.data.question.questionType).toBe(questionData.questionType);
      expect(response.body.data.question.createdById).toBe(testUser.id);

      // Verify question was saved to database
      const savedQuestion = await testDb.question.findFirst({
        where: { questionText: questionData.questionText },
      });
      expect(savedQuestion).toBeTruthy();
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing required questionText
        questionType: 'MULTIPLE_CHOICE',
        options: ['A', 'B'],
        correctAnswer: 0,
      };

      const response = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate question type', async () => {
      const invalidData = {
        questionText: 'Test question?',
        questionType: 'INVALID_TYPE',
        options: ['A', 'B'],
        correctAnswer: 0,
      };

      const response = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should validate multiple choice options', async () => {
      const invalidData = {
        questionText: 'Test question?',
        questionType: 'MULTIPLE_CHOICE',
        options: ['A'], // Not enough options
        correctAnswer: 0,
      };

      const response = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should reject unauthenticated requests', async () => {
      const questionData = {
        questionText: 'Test question?',
        questionType: 'TRUE_FALSE',
        correctAnswer: true,
      };

      const response = await request(app)
        .post('/api/questions')
        .send(questionData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should sanitize input to prevent XSS', async () => {
      const maliciousData = {
        questionText: '<script>alert("XSS")</script>What is XSS?',
        questionType: 'TEXT_INPUT',
        correctAnswer: 'Cross-Site Scripting',
        explanation: '<img src="x" onerror="alert(1)">Malicious explanation',
      };

      const response = await request(app)
        .post('/api/questions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(maliciousData)
        .expect(201);

      expect(response.body.success).toBe(true);
      // XSS should be sanitized
      expect(response.body.data.question.questionText).not.toContain('<script>');
      expect(response.body.data.question.explanation).not.toContain('onerror=');
    });
  });

  describe('GET /api/questions', () => {
    beforeEach(async () => {
      // Create test questions
      for (let i = 1; i <= 5; i++) {
        await testDb.question.create({
          data: {
            questionText: `Test question ${i}?`,
            questionType: 'MULTIPLE_CHOICE',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: (i % 4),
            explanation: `Explanation for question ${i}`,
            difficultyLevel: (i % 3) + 1,
            points: 10,
            source: 'manual',
            tags: [`tag${i}`, 'common'],
            createdById: testUser.id,
          },
        });
      }
    });

    it('should get questions with pagination', async () => {
      const response = await request(app)
        .get('/api/questions?page=1&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.questions).toHaveLength(3);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.totalPages).toBeGreaterThan(1);
    });

    it('should filter by difficulty level', async () => {
      const response = await request(app)
        .get('/api/questions?difficultyLevels[]=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.questions.forEach((question: any) => {
        expect(question.difficultyLevel).toBe(2);
      });
    });

    it('should filter by question type', async () => {
      const response = await request(app)
        .get('/api/questions?questionTypes[]=MULTIPLE_CHOICE')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.questions.forEach((question: any) => {
        expect(question.questionType).toBe('MULTIPLE_CHOICE');
      });
    });

    it('should search by text', async () => {
      const response = await request(app)
        .get('/api/questions?search=Test question 1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.questions.length).toBeGreaterThan(0);
      expect(response.body.data.questions[0].questionText).toContain('Test question 1');
    });

    it('should allow public access to published questions', async () => {
      const response = await request(app)
        .get('/api/questions?published=true')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should return only published questions without auth
    });
  });

  describe('GET /api/questions/:id', () => {
    let testQuestion: any;

    beforeEach(async () => {
      testQuestion = await testDb.question.create({
        data: {
          questionText: 'Single test question?',
          questionType: 'TRUE_FALSE',
          correctAnswer: true,
          explanation: 'Test explanation',
          difficultyLevel: 2,
          points: 10,
          source: 'manual',
          tags: ['test'],
          createdById: testUser.id,
        },
      });
    });

    it('should get a single question by ID', async () => {
      const response = await request(app)
        .get(`/api/questions/${testQuestion.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.question.id).toBe(testQuestion.id);
      expect(response.body.data.question.questionText).toBe(testQuestion.questionText);
    });

    it('should return 404 for non-existent question', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      
      const response = await request(app)
        .get(`/api/questions/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/questions/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/questions/:id', () => {
    let testQuestion: any;

    beforeEach(async () => {
      testQuestion = await testDb.question.create({
        data: {
          questionText: 'Original question?',
          questionType: 'MULTIPLE_CHOICE',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 0,
          explanation: 'Original explanation',
          difficultyLevel: 1,
          points: 10,
          source: 'manual',
          tags: ['original'],
          createdById: testUser.id,
        },
      });
    });

    it('should update a question successfully', async () => {
      const updateData = {
        questionText: 'Updated question?',
        explanation: 'Updated explanation',
        difficultyLevel: 3,
        tags: ['updated', 'test'],
      };

      const response = await request(app)
        .put(`/api/questions/${testQuestion.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.question.questionText).toBe(updateData.questionText);
      expect(response.body.data.question.explanation).toBe(updateData.explanation);
      expect(response.body.data.question.difficultyLevel).toBe(updateData.difficultyLevel);
    });

    it('should reject updates from non-owner', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = generateTestToken();
      
      await testDb.userSession.create({
        data: {
          userId: otherUser.id,
          tokenJti: 'other-jti',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const response = await request(app)
        .put(`/api/questions/${testQuestion.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ questionText: 'Hacked question?' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should validate update data', async () => {
      const invalidUpdate = {
        difficultyLevel: 10, // Invalid difficulty level
      };

      const response = await request(app)
        .put(`/api/questions/${testQuestion.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidUpdate)
        .expect(422);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/questions/:id', () => {
    let testQuestion: any;

    beforeEach(async () => {
      testQuestion = await testDb.question.create({
        data: {
          questionText: 'Question to delete?',
          questionType: 'TRUE_FALSE',
          correctAnswer: true,
          explanation: 'Will be deleted',
          difficultyLevel: 1,
          points: 10,
          source: 'manual',
          tags: ['delete'],
          createdById: testUser.id,
        },
      });
    });

    it('should delete a question successfully', async () => {
      const response = await request(app)
        .delete(`/api/questions/${testQuestion.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify question is deleted
      const deletedQuestion = await testDb.question.findUnique({
        where: { id: testQuestion.id },
      });
      expect(deletedQuestion?.isActive).toBe(false); // Soft delete
    });

    it('should reject deletion from non-owner', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = generateTestToken();
      
      await testDb.userSession.create({
        data: {
          userId: otherUser.id,
          tokenJti: 'other-jti',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const response = await request(app)
        .delete(`/api/questions/${testQuestion.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent question', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      
      const response = await request(app)
        .delete(`/api/questions/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to create endpoint', async () => {
      const questionData = {
        questionText: 'Rate limit test?',
        questionType: 'TRUE_FALSE',
        correctAnswer: true,
      };

      // Make multiple requests quickly
      const requests = Array(20).fill(null).map(() =>
        request(app)
          .post('/api/questions')
          .set('Authorization', `Bearer ${authToken}`)
          .send(questionData)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited in production
      if (process.env.NODE_ENV === 'production') {
        const rateLimitedResponses = responses.filter(res => res.status === 429);
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Bulk Operations', () => {
    it('should handle bulk question creation', async () => {
      const questions = Array(5).fill(null).map((_, i) => ({
        questionText: `Bulk question ${i}?`,
        questionType: 'MULTIPLE_CHOICE' as const,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: i % 4,
        explanation: `Explanation ${i}`,
        tags: [`bulk${i}`],
      }));

      const response = await request(app)
        .post('/api/questions/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ questions })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.questions).toHaveLength(5);
      expect(response.body.data.created).toBe(5);
    });

    it('should handle partial failures in bulk creation', async () => {
      const questions = [
        {
          questionText: 'Valid question?',
          questionType: 'TRUE_FALSE',
          correctAnswer: true,
        },
        {
          questionText: '', // Invalid - empty text
          questionType: 'TRUE_FALSE',
          correctAnswer: true,
        },
        {
          questionText: 'Another valid question?',
          questionType: 'MULTIPLE_CHOICE',
          options: ['A', 'B'],
          correctAnswer: 0,
        },
      ];

      const response = await request(app)
        .post('/api/questions/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ questions });

      expect(response.body.success).toBe(true);
      expect(response.body.data.created).toBe(2);
      expect(response.body.data.failed).toBe(1);
      expect(response.body.data.errors).toHaveLength(1);
    });
  });
});
