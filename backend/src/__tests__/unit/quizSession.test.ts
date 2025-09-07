import { QuizSessionService } from '@/services/quizSessionService';
import { QuizResultsService } from '@/services/quizResultsService';
import { prisma } from '@/config/database';
import { QuizSessionStatus, QuestionType } from '@prisma/client';

// Mock Prisma
jest.mock('@/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    quizSession: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    question: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    quizAnswer: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    quizResult: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    userStatistics: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

// Mock logger
jest.mock('@/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('QuizSessionService', () => {
  let quizSessionService: QuizSessionService;

  beforeEach(() => {
    quizSessionService = new QuizSessionService();
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new quiz session successfully', async () => {
      const userId = 'user-123';
      const config = {
        title: 'Test Quiz',
        description: 'A test quiz',
        totalQuestions: 5,
        categoryIds: [1, 2],
        difficultyLevels: [1, 2],
        questionTypes: ['MULTIPLE_CHOICE' as QuestionType],
        shuffleQuestions: true,
        allowPause: true,
        showExplanations: true,
      };

      // Mock user validation
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: userId });
      (prisma.quizSession.count as jest.Mock).mockResolvedValue(0);

      // Mock question selection
      (prisma.question.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'q1',
          questionText: 'Question 1',
          questionType: 'MULTIPLE_CHOICE',
          difficultyLevel: 1,
          points: 10,
          estimatedTime: 30,
          categories: [{ category: { id: 1, name: 'Category 1' } }],
        },
        {
          id: 'q2',
          questionText: 'Question 2',
          questionType: 'MULTIPLE_CHOICE',
          difficultyLevel: 2,
          points: 15,
          estimatedTime: 45,
          categories: [{ category: { id: 2, name: 'Category 2' } }],
        },
      ]);

      // Mock session creation
      const mockSession = {
        id: 'session-123',
        userId,
        ...config,
        status: QuizSessionStatus.CREATED,
        currentQuestionIndex: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        totalScore: 0,
        totalTimeTaken: 0,
        questionIds: ['q1', 'q2'],
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (prisma.quizSession.create as jest.Mock).mockResolvedValue(mockSession);

      const result = await quizSessionService.createSession(userId, config);

      expect(result).toMatchObject({
        id: 'session-123',
        userId,
        title: 'Test Quiz',
        totalQuestions: 5,
        status: QuizSessionStatus.CREATED,
      });

      expect(prisma.quizSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            title: config.title,
            totalQuestions: config.totalQuestions,
          }),
        })
      );
    });

    it('should throw error when user not found', async () => {
      const userId = 'invalid-user';
      const config = {
        totalQuestions: 5,
        categoryIds: [1],
        difficultyLevels: [1],
        questionTypes: ['MULTIPLE_CHOICE' as QuestionType],
        shuffleQuestions: true,
        allowPause: true,
        showExplanations: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(quizSessionService.createSession(userId, config))
        .rejects.toThrow('User not found');
    });

    it('should throw error when too many concurrent sessions', async () => {
      const userId = 'user-123';
      const config = {
        totalQuestions: 5,
        categoryIds: [1],
        difficultyLevels: [1],
        questionTypes: ['MULTIPLE_CHOICE' as QuestionType],
        shuffleQuestions: true,
        allowPause: true,
        showExplanations: true,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: userId });
      (prisma.quizSession.count as jest.Mock).mockResolvedValue(5); // Max concurrent sessions

      await expect(quizSessionService.createSession(userId, config))
        .rejects.toThrow('Maximum concurrent sessions');
    });
  });

  describe('startSession', () => {
    it('should start a quiz session successfully', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';

      const mockSession = {
        id: sessionId,
        userId,
        status: QuizSessionStatus.CREATED,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const updatedSession = {
        ...mockSession,
        status: QuizSessionStatus.IN_PROGRESS,
        startedAt: new Date(),
      };

      (prisma.quizSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.quizSession.update as jest.Mock).mockResolvedValue(updatedSession);
      (prisma.userStatistics.upsert as jest.Mock).mockResolvedValue({});

      const result = await quizSessionService.startSession(sessionId, userId);

      expect(result.status).toBe(QuizSessionStatus.IN_PROGRESS);
      expect(result.startedAt).toBeDefined();
      expect(prisma.quizSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionId },
          data: expect.objectContaining({
            status: QuizSessionStatus.IN_PROGRESS,
            startedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should throw error when session not found', async () => {
      const sessionId = 'invalid-session';
      const userId = 'user-123';

      (prisma.quizSession.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(quizSessionService.startSession(sessionId, userId))
        .rejects.toThrow('Quiz session not found');
    });

    it('should throw error when starting non-CREATED session', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';

      const mockSession = {
        id: sessionId,
        userId,
        status: QuizSessionStatus.IN_PROGRESS,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (prisma.quizSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      await expect(quizSessionService.startSession(sessionId, userId))
        .rejects.toThrow('Cannot start session in status: IN_PROGRESS');
    });
  });

  describe('submitAnswer', () => {
    it('should submit answer and calculate score correctly', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';
      const questionId = 'question-123';

      const mockSession = {
        id: sessionId,
        userId,
        status: QuizSessionStatus.IN_PROGRESS,
        currentQuestionIndex: 0,
        questionIds: [questionId],
        questionsAnswered: 0,
        correctAnswers: 0,
        totalScore: 0,
        totalTimeTaken: 0,
        showExplanations: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockQuestion = {
        id: questionId,
        questionText: 'Test Question',
        questionType: 'MULTIPLE_CHOICE',
        correctAnswer: 'A',
        explanation: 'Test explanation',
        points: 10,
        difficultyLevel: 1,
        estimatedTime: 30,
        categories: [{ category: { id: 1, name: 'Category 1' } }],
      };

      const answerRequest = {
        sessionId,
        questionId,
        userAnswer: 'A',
        timeTaken: 20,
        hintsUsed: 0,
        skipped: false,
      };

      (prisma.quizSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.question.findUnique as jest.Mock).mockResolvedValue(mockQuestion);
      (prisma.quizAnswer.create as jest.Mock).mockResolvedValue({});
      (prisma.quizAnswer.findMany as jest.Mock).mockResolvedValue([]); // No previous answers for streak
      (prisma.quizSession.update as jest.Mock).mockResolvedValue({
        ...mockSession,
        currentQuestionIndex: 1,
        questionsAnswered: 1,
        correctAnswers: 1,
        totalScore: 10,
        totalTimeTaken: 20,
      });

      const result = await quizSessionService.submitAnswer(answerRequest, userId);

      expect(result.isCorrect).toBe(true);
      expect(result.pointsEarned).toBeGreaterThan(0);
      expect(result.explanation).toBe('Test explanation');
      expect(result.scoring.basePoints).toBe(10);

      expect(prisma.quizAnswer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId,
            questionId,
            userAnswer: 'A',
            isCorrect: true,
            timeTaken: 20,
            hintsUsed: 0,
            skipped: false,
          }),
        })
      );
    });

    it('should handle incorrect answer', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';
      const questionId = 'question-123';

      const mockSession = {
        id: sessionId,
        userId,
        status: QuizSessionStatus.IN_PROGRESS,
        currentQuestionIndex: 0,
        questionIds: [questionId],
        questionsAnswered: 0,
        correctAnswers: 0,
        totalScore: 0,
        totalTimeTaken: 0,
        showExplanations: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockQuestion = {
        id: questionId,
        questionText: 'Test Question',
        questionType: 'MULTIPLE_CHOICE',
        correctAnswer: 'A',
        points: 10,
        difficultyLevel: 1,
        categories: [{ category: { id: 1, name: 'Category 1' } }],
      };

      const answerRequest = {
        sessionId,
        questionId,
        userAnswer: 'B', // Wrong answer
        timeTaken: 20,
        hintsUsed: 0,
        skipped: false,
      };

      (prisma.quizSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.question.findUnique as jest.Mock).mockResolvedValue(mockQuestion);
      (prisma.quizAnswer.create as jest.Mock).mockResolvedValue({});
      (prisma.quizAnswer.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.quizSession.update as jest.Mock).mockResolvedValue({
        ...mockSession,
        currentQuestionIndex: 1,
        questionsAnswered: 1,
        correctAnswers: 0,
        totalScore: 0,
        totalTimeTaken: 20,
      });

      const result = await quizSessionService.submitAnswer(answerRequest, userId);

      expect(result.isCorrect).toBe(false);
      expect(result.pointsEarned).toBe(0);
      expect(result.scoring.basePoints).toBe(0);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      const mockUpdateResult = { count: 3 };
      (prisma.quizSession.updateMany as jest.Mock).mockResolvedValue(mockUpdateResult);

      const result = await quizSessionService.cleanupExpiredSessions();

      expect(result).toBe(3);
      expect(prisma.quizSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expiresAt: { lt: expect.any(Date) },
            status: { in: [QuizSessionStatus.CREATED, QuizSessionStatus.IN_PROGRESS, QuizSessionStatus.PAUSED] },
          }),
          data: { status: QuizSessionStatus.EXPIRED },
        })
      );
    });
  });
});

describe('QuizResultsService', () => {
  let quizResultsService: QuizResultsService;

  beforeEach(() => {
    quizResultsService = new QuizResultsService();
    jest.clearAllMocks();
  });

  describe('generateQuizResults', () => {
    it('should generate comprehensive quiz results', async () => {
      const sessionId = 'session-123';
      
      const mockSession = {
        id: sessionId,
        userId: 'user-123',
        totalQuestions: 2,
        questionsAnswered: 2,
        correctAnswers: 1,
        totalScore: 15,
        totalTimeTaken: 60,
        completedAt: new Date(),
        questionIds: ['q1', 'q2'],
        answers: [
          {
            id: 'a1',
            questionId: 'q1',
            questionIndex: 0,
            userAnswer: 'A',
            isCorrect: true,
            pointsEarned: 15,
            timeTaken: 25,
            basePoints: 10,
            timeBonus: 5,
            streakBonus: 0,
            difficultyBonus: 0,
            hintsUsed: 0,
            skipped: false,
          },
          {
            id: 'a2',
            questionId: 'q2',
            questionIndex: 1,
            userAnswer: 'B',
            isCorrect: false,
            pointsEarned: 0,
            timeTaken: 35,
            basePoints: 0,
            timeBonus: 0,
            streakBonus: 0,
            difficultyBonus: 0,
            hintsUsed: 1,
            skipped: false,
          },
        ],
        user: { id: 'user-123', username: 'testuser' },
      };

      const mockQuestions = [
        {
          id: 'q1',
          questionText: 'Question 1',
          questionType: 'MULTIPLE_CHOICE',
          correctAnswer: 'A',
          points: 10,
          difficultyLevel: 1,
          categories: [{ category: { id: 1, name: 'Science' } }],
        },
        {
          id: 'q2',
          questionText: 'Question 2',
          questionType: 'TRUE_FALSE',
          correctAnswer: 'A',
          points: 10,
          difficultyLevel: 2,
          categories: [{ category: { id: 2, name: 'History' } }],
        },
      ];

      const mockResult = {
        id: 'result-123',
        sessionId,
        userId: 'user-123',
        totalQuestions: 2,
        questionsAnswered: 2,
        correctAnswers: 1,
        incorrectAnswers: 1,
        skippedQuestions: 0,
        totalScore: 15,
        maxPossibleScore: 20,
        scorePercentage: 75,
        totalTimeTaken: 60,
        averageTimePerQuestion: 30,
        accuracyRate: 50,
        streakCount: 1,
        timeEfficiency: 0.25,
        categoryStats: JSON.stringify([]),
        difficultyStats: JSON.stringify([]),
        questionTypeStats: JSON.stringify([]),
        achievements: ['high_achiever'],
        completedAt: new Date(),
      };

      (prisma.quizSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.question.findMany as jest.Mock).mockResolvedValue(mockQuestions);
      (prisma.quizResult.upsert as jest.Mock).mockResolvedValue(mockResult);
      (prisma.userStatistics.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.userStatistics.upsert as jest.Mock).mockResolvedValue({});

      const result = await quizResultsService.generateQuizResults(sessionId);

      expect(result).toMatchObject({
        sessionId,
        totalQuestions: 2,
        correctAnswers: 1,
        totalScore: 15,
        scorePercentage: 75,
        accuracyRate: 50,
      });

      expect(result.categoryStats).toBeDefined();
      expect(result.difficultyStats).toBeDefined();
      expect(result.questionTypeStats).toBeDefined();
      expect(result.questionResults).toBeDefined();
      expect(result.achievements).toContain('high_achiever');
    });
  });

  describe('getUserStatistics', () => {
    it('should return user statistics', async () => {
      const userId = 'user-123';
      const mockStats = {
        id: 'stats-123',
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
        lastQuizDate: new Date(),
        currentStreak: 3,
        longestDailyStreak: 7,
        experiencePoints: 2500,
        level: 3,
        rank: 150,
      };

      (prisma.userStatistics.findUnique as jest.Mock).mockResolvedValue(mockStats);
      (prisma.category.findMany as jest.Mock).mockResolvedValue([]);

      const result = await quizResultsService.getUserStatistics(userId);

      expect(result).toMatchObject({
        totalQuizzesCompleted: 5,
        overallAccuracy: 70,
        averageScore: 75,
        bestScore: 95,
        level: 3,
      });

      expect(result.strongestCategories).toBeDefined();
      expect(result.weakestCategories).toBeDefined();
    });

    it('should create initial statistics if not found', async () => {
      const userId = 'user-123';
      
      const mockNewStats = {
        id: 'stats-123',
        userId,
        totalQuizzesCompleted: 0,
        totalQuizzesStarted: 0,
        completionRate: 0,
        totalQuestionsAnswered: 0,
        totalCorrectAnswers: 0,
        overallAccuracy: 0,
        averageScore: 0,
        totalTimeSpent: 0,
        averageQuizTime: 0,
        averageQuestionTime: 0,
        bestScore: 0,
        longestStreak: 0,
        perfectQuizzes: 0,
        strongestCategories: JSON.stringify([]),
        weakestCategories: JSON.stringify([]),
        categoryProgress: JSON.stringify({}),
        lastQuizDate: null,
        currentStreak: 0,
        longestDailyStreak: 0,
        experiencePoints: 0,
        level: 1,
        rank: null,
      };

      (prisma.userStatistics.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.userStatistics.create as jest.Mock).mockResolvedValue(mockNewStats);
      (prisma.category.findMany as jest.Mock).mockResolvedValue([]);

      const result = await quizResultsService.getUserStatistics(userId);

      expect(result.totalQuizzesCompleted).toBe(0);
      expect(result.level).toBe(1);
      expect(prisma.userStatistics.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId },
        })
      );
    });
  });
});
