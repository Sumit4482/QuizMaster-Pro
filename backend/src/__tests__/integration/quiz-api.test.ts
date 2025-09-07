import request from 'supertest';
import { createApp } from '@/app';
import { prisma } from '@/config/database';
import { generateAccessToken } from '@/utils/auth';
import { QuizSessionStatus, QuestionType, UserRole } from '@prisma/client';

const app = createApp();

describe('Quiz API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let testUser: any;
  let testCategories: any[];
  let testQuestions: any[];

  beforeAll(async () => {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: 'quiz-test@example.com',
        username: 'quiztest',
        passwordHash: 'hashedpassword',
        role: UserRole.PLAYER,
      },
    });
    userId = testUser.id;

    // Generate auth token
    const tokenData = generateAccessToken({ 
      userId, 
      email: testUser.email,
      username: testUser.username,
      role: UserRole.PLAYER 
    });
    authToken = tokenData.token;

    // Create test categories
    testCategories = await Promise.all([
      prisma.category.create({
        data: {
          name: 'Science',
          slug: 'science',
          description: 'Science questions',
          isActive: true,
        },
      }),
      prisma.category.create({
        data: {
          name: 'History',
          slug: 'history',
          description: 'History questions',
          isActive: true,
        },
      }),
    ]);

    // Create test questions
    testQuestions = await Promise.all([
      prisma.question.create({
        data: {
          questionText: 'What is the chemical symbol for water?',
          questionType: QuestionType.MULTIPLE_CHOICE,
          options: {
            options: ['H2O', 'CO2', 'O2', 'N2'],
            shuffle: false,
          },
          correctAnswer: 'H2O',
          explanation: 'Water is composed of two hydrogen atoms and one oxygen atom.',
          difficultyLevel: 1,
          points: 10,
          estimatedTime: 30,
          isActive: true,
          isPublished: true,
          createdById: userId,
          categories: {
            create: {
              categoryId: testCategories[0].id,
            },
          },
        },
      }),
      prisma.question.create({
        data: {
          questionText: 'The Earth is round.',
          questionType: QuestionType.TRUE_FALSE,
          correctAnswer: true,
          explanation: 'The Earth is an oblate spheroid.',
          difficultyLevel: 1,
          points: 5,
          estimatedTime: 15,
          isActive: true,
          isPublished: true,
          createdById: userId,
          categories: {
            create: {
              categoryId: testCategories[0].id,
            },
          },
        },
      }),
      prisma.question.create({
        data: {
          questionText: 'Who was the first president of the United States?',
          questionType: QuestionType.TEXT_INPUT,
          correctAnswer: 'George Washington',
          explanation: 'George Washington served as the first president from 1789 to 1797.',
          difficultyLevel: 2,
          points: 15,
          estimatedTime: 45,
          isActive: true,
          isPublished: true,
          createdById: userId,
          categories: {
            create: {
              categoryId: testCategories[1].id,
            },
          },
        },
      }),
    ]);
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.quizAnswer.deleteMany({ where: { session: { userId } } });
    await prisma.quizResult.deleteMany({ where: { userId } });
    await prisma.userStatistics.deleteMany({ where: { userId } });
    await prisma.quizSession.deleteMany({ where: { userId } });
    await prisma.questionCategory.deleteMany({ where: { questionId: { in: testQuestions.map(q => q.id) } } });
    await prisma.question.deleteMany({ where: { id: { in: testQuestions.map(q => q.id) } } });
    await prisma.category.deleteMany({ where: { id: { in: testCategories.map(c => c.id) } } });
    await prisma.user.delete({ where: { id: userId } });
  });

  describe('POST /api/quiz/sessions', () => {
    it('should create a new quiz session', async () => {
      const quizConfig = {
        title: 'Test Quiz',
        description: 'A test quiz for integration testing',
        totalQuestions: 2,
        timePerQuestion: 60,
        categoryIds: [testCategories[0].id],
        difficultyLevels: [1, 2],
        questionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'],
        shuffleQuestions: true,
        allowPause: true,
        showExplanations: true,
      };

      const response = await request(app)
        .post('/api/quiz/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(quizConfig)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        title: 'Test Quiz',
        totalQuestions: 2,
        status: QuizSessionStatus.CREATED,
        userId,
      });
    });

    it('should reject request without authentication', async () => {
      const quizConfig = {
        totalQuestions: 2,
        categoryIds: [testCategories[0].id],
        difficultyLevels: [1],
        questionTypes: ['MULTIPLE_CHOICE'],
        shuffleQuestions: true,
        allowPause: true,
        showExplanations: true,
      };

      await request(app)
        .post('/api/quiz/sessions')
        .send(quizConfig)
        .expect(401);
    });

    it('should reject invalid configuration', async () => {
      const invalidConfig = {
        totalQuestions: 0, // Invalid
        categoryIds: [], // Empty
        difficultyLevels: [],
        questionTypes: [],
        shuffleQuestions: true,
        allowPause: true,
        showExplanations: true,
      };

      const response = await request(app)
        .post('/api/quiz/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidConfig)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Quiz Session Flow', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session for each test
      const session = await prisma.quizSession.create({
        data: {
          userId,
          title: 'Flow Test Quiz',
          totalQuestions: 2,
          timePerQuestion: 60,
          categoryIds: [testCategories[0].id],
          difficultyLevels: [1],
          questionTypes: [QuestionType.MULTIPLE_CHOICE, QuestionType.TRUE_FALSE],
          shuffleQuestions: false,
          allowPause: true,
          showExplanations: true,
          questionIds: [testQuestions[0].id, testQuestions[1].id],
          status: QuizSessionStatus.CREATED,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      sessionId = session.id;
    });

    afterEach(async () => {
      // Clean up session data
      await prisma.quizAnswer.deleteMany({ where: { sessionId } });
      await prisma.quizResult.deleteMany({ where: { sessionId } });
      await prisma.quizSession.delete({ where: { id: sessionId } });
    });

    it('should complete full quiz flow', async () => {
      // 1. Start the session
      const startResponse = await request(app)
        .post(`/api/quiz/sessions/${sessionId}/start`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(startResponse.body.data.status).toBe(QuizSessionStatus.IN_PROGRESS);

      // 2. Get current question
      const questionResponse = await request(app)
        .get(`/api/quiz/sessions/${sessionId}/current-question`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(questionResponse.body.data).toMatchObject({
        id: testQuestions[0].id,
        questionText: expect.any(String),
      });

      // 3. Submit first answer
      const answer1Response = await request(app)
        .post(`/api/quiz/sessions/${sessionId}/submit-answer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          questionId: testQuestions[0].id,
          userAnswer: 'H2O',
          timeTaken: 25,
          hintsUsed: 0,
        })
        .expect(200);

      expect(answer1Response.body.data.isCorrect).toBe(true);
      expect(answer1Response.body.data.pointsEarned).toBeGreaterThan(0);

      // 4. Get next question
      const question2Response = await request(app)
        .get(`/api/quiz/sessions/${sessionId}/current-question`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(question2Response.body.data.id).toBe(testQuestions[1].id);

      // 5. Submit second answer
      const answer2Response = await request(app)
        .post(`/api/quiz/sessions/${sessionId}/submit-answer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          questionId: testQuestions[1].id,
          userAnswer: true,
          timeTaken: 15,
          hintsUsed: 0,
        })
        .expect(200);

      expect(answer2Response.body.data.isCorrect).toBe(true);

      // 6. Quiz should be completed, no more questions
      const finalQuestionResponse = await request(app)
        .get(`/api/quiz/sessions/${sessionId}/current-question`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalQuestionResponse.body.data).toBeNull();

      // 7. Get results
      const resultsResponse = await request(app)
        .get(`/api/quiz/sessions/${sessionId}/results`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(resultsResponse.body.data).toMatchObject({
        sessionId,
        totalQuestions: 2,
        correctAnswers: 2,
        accuracyRate: 100,
      });
    });

    it('should handle pause and resume', async () => {
      // Start session
      await request(app)
        .post(`/api/quiz/sessions/${sessionId}/start`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Pause session
      const pauseResponse = await request(app)
        .post(`/api/quiz/sessions/${sessionId}/pause`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(pauseResponse.body.data.status).toBe(QuizSessionStatus.PAUSED);

      // Resume session
      const resumeResponse = await request(app)
        .post(`/api/quiz/sessions/${sessionId}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(resumeResponse.body.data.status).toBe(QuizSessionStatus.IN_PROGRESS);
    });

    it('should reject unauthorized access to session', async () => {
      // Try to access another user's session
      const anotherUser = await prisma.user.create({
        data: {
          email: 'another@example.com',
          username: 'another',
          passwordHash: 'hashedpassword',
          role: UserRole.PLAYER,
        },
      });

            const anotherTokenData = generateAccessToken({
        userId: anotherUser.id,
        email: anotherUser.email,
        username: anotherUser.username,
        role: UserRole.PLAYER
      });
      const anotherToken = anotherTokenData.token;

      await request(app)
        .get(`/api/quiz/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .expect(500); // Should throw error for unauthorized access

      // Clean up
      await prisma.user.delete({ where: { id: anotherUser.id } });
    });
  });

  describe('GET /api/quiz/sessions', () => {
    beforeAll(async () => {
      // Create some test sessions
      await Promise.all([
        prisma.quizSession.create({
          data: {
            userId,
            title: 'Completed Quiz',
            totalQuestions: 1,
            categoryIds: [testCategories[0].id],
            difficultyLevels: [1],
            questionTypes: [QuestionType.MULTIPLE_CHOICE],
            shuffleQuestions: true,
            allowPause: true,
            showExplanations: true,
            questionIds: [testQuestions[0].id],
            status: QuizSessionStatus.COMPLETED,
            questionsAnswered: 1,
            correctAnswers: 1,
            totalScore: 10,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        }),
        prisma.quizSession.create({
          data: {
            userId,
            title: 'In Progress Quiz',
            totalQuestions: 2,
            categoryIds: [testCategories[0].id],
            difficultyLevels: [1],
            questionTypes: [QuestionType.MULTIPLE_CHOICE],
            shuffleQuestions: true,
            allowPause: true,
            showExplanations: true,
            questionIds: [testQuestions[0].id, testQuestions[1].id],
            status: QuizSessionStatus.IN_PROGRESS,
            questionsAnswered: 0,
            correctAnswers: 0,
            totalScore: 0,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        }),
      ]);
    });

    afterAll(async () => {
      await prisma.quizSession.deleteMany({ where: { userId } });
    });

    it('should get user quiz sessions', async () => {
      const response = await request(app)
        .get('/api/quiz/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toBeDefined();
      expect(response.body.data.sessions.length).toBeGreaterThanOrEqual(2);
      
      // Check session structure
      const session = response.body.data.sessions[0];
      expect(session).toMatchObject({
        id: expect.any(String),
        status: expect.any(String),
        totalQuestions: expect.any(Number),
        questionsAnswered: expect.any(Number),
        correctAnswers: expect.any(Number),
        totalScore: expect.any(Number),
        progressPercentage: expect.any(Number),
      });
    });

    it('should filter sessions by status', async () => {
      const response = await request(app)
        .get('/api/quiz/sessions?status=COMPLETED')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.sessions).toBeDefined();
      response.body.data.sessions.forEach((session: any) => {
        expect(session.status).toBe(QuizSessionStatus.COMPLETED);
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/quiz/sessions?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.sessions).toBeDefined();
      expect(response.body.data.sessions.length).toBe(1);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(1);
    });
  });

  describe('GET /api/quiz/statistics', () => {
    beforeAll(async () => {
      // Create some test statistics
      await prisma.userStatistics.create({
        data: {
          userId,
          totalQuizzesCompleted: 5,
          totalQuizzesStarted: 6,
          completionRate: 83.33,
          totalQuestionsAnswered: 50,
          totalCorrectAnswers: 35,
          overallAccuracy: 70,
          averageScore: 75,
          totalTimeSpent: 1800,
          averageQuizTime: 360,
          averageQuestionTime: 36,
          bestScore: 95,
          longestStreak: 8,
          perfectQuizzes: 1,
          strongestCategories: JSON.stringify([]),
          weakestCategories: JSON.stringify([]),
          categoryProgress: JSON.stringify({}),
          currentStreak: 3,
          longestDailyStreak: 7,
          experiencePoints: 2500,
          level: 3,
        },
      });
    });

    afterAll(async () => {
      await prisma.userStatistics.deleteMany({ where: { userId } });
    });

    it('should get user statistics', async () => {
      const response = await request(app)
        .get('/api/quiz/statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalQuizzesCompleted: 5,
        overallAccuracy: 70,
        averageScore: 75,
        bestScore: 95,
        level: 3,
        experiencePoints: 2500,
        currentStreak: 3,
      });

      expect(response.body.data.strongestCategories).toBeDefined();
      expect(response.body.data.weakestCategories).toBeDefined();
    });
  });

  describe('GET /api/quiz/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/quiz/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        services: {
          quizSession: 'operational',
          quizResults: 'operational',
        },
      });
    });
  });
});
