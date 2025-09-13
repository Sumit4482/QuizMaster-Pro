import { 
  QuizSession, 
  QuizAnswer, 
  QuizResult, 
  UserStatistics, 
  QuizSessionStatus,
  QuestionType,
  Question
} from '@prisma/client';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import {
  QuizConfiguration,
  CreateQuizSessionRequest,
  QuizSessionResponse,
  QuizSessionSummary,
  QuizQuestion,
  SubmitAnswerRequest,
  SubmitAnswerResponse,
  QuestionSelectionCriteria,
  QuestionPool,
  ScoringConfiguration,
  ScoreCalculation,
  DEFAULT_SCORING_CONFIG,
  SESSION_EXPIRY_HOURS,
  MAX_CONCURRENT_SESSIONS,
  DIFFICULTY_NAMES,
} from '@/types/quiz';
import { QuizResultsService } from './quizResultsService';
import { generateAIQuestions, AIQuestion } from '@/utils/aiQuestionGenerator';

export class QuizSessionService {
  private readonly scoringConfig: ScoringConfiguration;
  private readonly quizResultsService: QuizResultsService;

  constructor(
    scoringConfig: ScoringConfiguration = DEFAULT_SCORING_CONFIG,
    quizResultsService?: QuizResultsService
  ) {
    this.scoringConfig = scoringConfig;
    this.quizResultsService = quizResultsService || new QuizResultsService();
  }

  /**
   * Create a new quiz session
   */
  async createSession(
    userId: string, 
    config: CreateQuizSessionRequest
  ): Promise<QuizSessionResponse> {
    try {
      // Validate user exists and check concurrent session limit
      await this.validateUserAndSessionLimits(userId);

      // Validate configuration
      this.validateQuizConfiguration(config);

      let questionIds: string[] = [];
      let actualTotalQuestions = config.totalQuestions;
      let aiQuestions: AIQuestion[] | null = null;

      if (config.useAI && config.aiTopic) {
        // Generate AI questions
        logger.info('Generating AI questions for quiz session', { 
          topic: config.aiTopic, 
          count: config.totalQuestions 
        });
        
        try {
          const averageDifficulty = config.difficultyLevels.reduce((sum, level) => sum + level, 0) / config.difficultyLevels.length;
          
          aiQuestions = await generateAIQuestions({
            topic: config.aiTopic,
            difficulty: Math.round(averageDifficulty),
            count: config.totalQuestions,
            questionType: config.questionTypes[0] || 'MULTIPLE_CHOICE'
          });
          
          // Generate unique IDs for AI questions and store them in the questions
          const sessionIdPrefix = `${Date.now()}`;
          questionIds = aiQuestions.map((_, index) => `ai_${sessionIdPrefix}_${index}`);
          
          // Add IDs to the AI questions themselves for consistency
          aiQuestions.forEach((question, index) => {
            (question as any).id = questionIds[index];
          });
          
          actualTotalQuestions = aiQuestions.length;
          
          logger.info('AI questions generated successfully', { 
            count: aiQuestions.length,
            topic: config.aiTopic
          });
        } catch (error) {
          logger.error('Failed to generate AI questions', { error, topic: config.aiTopic });
          throw new Error(`Failed to generate AI questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // Use database questions (original logic)
        const questionPool = await this.selectQuestionsForQuiz({
          categoryIds: config.categoryIds,
          difficultyLevels: config.difficultyLevels,
          questionTypes: config.questionTypes,
          count: config.totalQuestions,
          userId,
        });

        // Adjust total questions to available questions if there aren't enough
        if (questionPool.questions.length < config.totalQuestions) {
          actualTotalQuestions = questionPool.questions.length;
          logger.info('Adjusting quiz questions to available count', { 
            requested: config.totalQuestions, 
            available: questionPool.questions.length 
          });
          
          // Ensure we have at least 1 question
          if (actualTotalQuestions < 1) {
            throw new Error(`No questions available for the selected criteria. Please select different categories or criteria.`);
          }
        }

        // Shuffle questions if requested, then take only what we need
        const allQuestionIds = config.shuffleQuestions 
          ? this.shuffleArray(questionPool.questions.map(q => q.id))
          : questionPool.questions.map(q => q.id);
        
        questionIds = allQuestionIds.slice(0, actualTotalQuestions);
      }

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

      // Create the session
      const session = await prisma.quizSession.create({
        data: {
          userId,
          title: config.title,
          description: aiQuestions 
            ? JSON.stringify({ type: 'ai', topic: config.aiTopic, questions: aiQuestions })
            : config.description,
          totalQuestions: actualTotalQuestions,
          timePerQuestion: config.timePerQuestion,
          totalTimeLimit: config.totalTimeLimit,
          categoryIds: config.categoryIds,
          difficultyLevels: config.difficultyLevels,
          questionTypes: config.questionTypes,
          shuffleQuestions: config.shuffleQuestions,
          allowPause: config.allowPause,
          showExplanations: config.showExplanations,
          questionIds,
          expiresAt,
          status: QuizSessionStatus.CREATED,
        },
      });

      logger.info('Quiz session created', { 
        sessionId: session.id, 
        userId, 
        totalQuestions: actualTotalQuestions,
        requestedQuestions: config.totalQuestions
      });

      return this.mapSessionToResponse(session);
    } catch (error) {
      logger.error('Error creating quiz session', { userId, config, error });
      throw error;
    }
  }

  /**
   * Start a quiz session
   */
  async startSession(sessionId: string, userId: string): Promise<QuizSessionResponse> {
    try {
      const session = await this.getSessionWithValidation(sessionId, userId);

      if (session.status !== QuizSessionStatus.CREATED) {
        throw new Error(`Cannot start session in status: ${session.status}`);
      }

      const updatedSession = await prisma.quizSession.update({
        where: { id: sessionId },
        data: {
          status: QuizSessionStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });

      // Update user statistics
      await this.incrementUserStatistic(userId, 'totalQuizzesStarted', 1);

      logger.info('Quiz session started', { sessionId, userId });

      return this.mapSessionToResponse(updatedSession);
    } catch (error) {
      logger.error('Error starting quiz session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Pause a quiz session
   */
  async pauseSession(sessionId: string, userId: string): Promise<QuizSessionResponse> {
    try {
      const session = await this.getSessionWithValidation(sessionId, userId);

      if (session.status !== QuizSessionStatus.IN_PROGRESS) {
        throw new Error(`Cannot pause session in status: ${session.status}`);
      }

      if (!session.allowPause) {
        throw new Error('Pausing is not allowed for this quiz');
      }

      const updatedSession = await prisma.quizSession.update({
        where: { id: sessionId },
        data: {
          status: QuizSessionStatus.PAUSED,
          pausedAt: new Date(),
        },
      });

      logger.info('Quiz session paused', { sessionId, userId });

      return this.mapSessionToResponse(updatedSession);
    } catch (error) {
      logger.error('Error pausing quiz session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Resume a quiz session
   */
  async resumeSession(sessionId: string, userId: string): Promise<QuizSessionResponse> {
    try {
      const session = await this.getSessionWithValidation(sessionId, userId);

      if (session.status !== QuizSessionStatus.PAUSED) {
        throw new Error(`Cannot resume session in status: ${session.status}`);
      }

      // Calculate additional paused time
      const pausedTime = session.pausedAt 
        ? Math.floor((new Date().getTime() - session.pausedAt.getTime()) / 1000)
        : 0;

      const updatedSession = await prisma.quizSession.update({
        where: { id: sessionId },
        data: {
          status: QuizSessionStatus.IN_PROGRESS,
          pausedAt: null,
          totalTimeTaken: session.totalTimeTaken + pausedTime,
        },
      });

      logger.info('Quiz session resumed', { sessionId, userId, pausedTime });

      return this.mapSessionToResponse(updatedSession);
    } catch (error) {
      logger.error('Error resuming quiz session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Get current question for a session
   */
  async getCurrentQuestion(sessionId: string, userId: string): Promise<QuizQuestion | null> {
    try {
      const session = await this.getSessionWithValidation(sessionId, userId);

      if (session.currentQuestionIndex >= session.questionIds.length) {
        return null; // Quiz completed
      }

      // Check if this is an AI-generated quiz
      if (session.description && this.isAISession(session.description)) {
        const aiData = JSON.parse(session.description);
        const aiQuestion = aiData.questions[session.currentQuestionIndex];
        
        if (!aiQuestion) {
          throw new Error(`AI question not found at index: ${session.currentQuestionIndex}`);
        }
        
        return this.mapAIQuestionToQuizQuestion(aiQuestion, session.currentQuestionIndex, sessionId);
      }

      // Original database question logic
      const questionId = session.questionIds[session.currentQuestionIndex];
      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
      });

      if (!question) {
        throw new Error(`Question not found: ${questionId}`);
      }

      return this.mapQuestionToQuizQuestion(question);
    } catch (error) {
      logger.error('Error getting current question', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Submit an answer for the current question
   */
  async submitAnswer(request: SubmitAnswerRequest, userId: string): Promise<SubmitAnswerResponse> {
    const { sessionId, questionId, userAnswer, timeTaken, hintsUsed = 0, skipped = false } = request;
    let session: any = null; // Declare outside try block for access in catch block
    
    try {
      session = await this.getSessionWithValidation(sessionId, userId);

      // Handle PAUSED sessions - auto-resume to prevent race conditions
      if (session.status === QuizSessionStatus.PAUSED) {
        // Calculate paused duration for logging
        const pausedDuration = session.pausedAt 
          ? Math.floor((new Date().getTime() - session.pausedAt.getTime()) / 1000)
          : 0;

        logger.info('Auto-resuming PAUSED session on answer submission', { 
          sessionId, 
          userId, 
          pausedAt: session.pausedAt, 
          pausedDurationSeconds: pausedDuration 
        });
        
        // Auto-resume the session and add paused time to total time
        session = await prisma.quizSession.update({
          where: { id: sessionId },
          data: {
            status: QuizSessionStatus.IN_PROGRESS,
            pausedAt: null,
            totalTimeTaken: session.totalTimeTaken + pausedDuration,
          },
        });
      }

      if (session.status !== QuizSessionStatus.IN_PROGRESS) {
        throw new Error(`Cannot submit answer for session in status: ${session.status}`);
      }

      // Validate session state and question access
      if (!session.questionIds || !Array.isArray(session.questionIds)) {
        logger.error('Invalid session questionIds', { 
          sessionId, 
          questionIds: session.questionIds,
          currentQuestionIndex: session.currentQuestionIndex 
        });
        throw new Error('Session has invalid question list. Please restart the quiz.');
      }

      if (session.currentQuestionIndex < 0 || session.currentQuestionIndex >= session.questionIds.length) {
        logger.error('Invalid currentQuestionIndex', { 
          sessionId, 
          currentQuestionIndex: session.currentQuestionIndex,
          questionIdsLength: session.questionIds.length,
          totalQuestions: session.totalQuestions
        });
        throw new Error('Session question index is out of bounds. Please restart the quiz.');
      }

      // Validate question is current
      const currentQuestionId = session.questionIds[session.currentQuestionIndex];
      if (!currentQuestionId) {
        logger.error('Missing currentQuestionId', { 
          sessionId, 
          currentQuestionIndex: session.currentQuestionIndex,
          questionIds: session.questionIds
        });
        throw new Error('Unable to retrieve current question. Please restart the quiz.');
      }

      // For AI sessions, validate using the consistent ID from the session
      let isValidQuestion = false;
      if (session.description && this.isAISession(session.description)) {
        // For AI questions, check both the stored ID and regenerated ID for backward compatibility
        const aiData = JSON.parse(session.description);
        const aiQuestion = aiData.questions[session.currentQuestionIndex];
        if (aiQuestion && ((aiQuestion as any).id === questionId || currentQuestionId === questionId)) {
          isValidQuestion = true;
        }
      } else {
        // For database questions, use exact match
        isValidQuestion = currentQuestionId === questionId;
      }

      if (!isValidQuestion) {
        logger.error('Question mismatch', { 
          sessionId, 
          requestedQuestionId: questionId,
          currentQuestionId,
          currentQuestionIndex: session.currentQuestionIndex,
          isAI: session.description && this.isAISession(session.description)
        });
        throw new Error('Question is not the current question for this session');
      }

      // Get question details - handle AI vs database questions
      let questionDetails;
      let isCorrect = false;
      
      if (session.description && this.isAISession(session.description)) {
        // For AI questions, get from stored session data
        const aiData = JSON.parse(session.description);
        const aiQuestion = aiData.questions[session.currentQuestionIndex];
        
        if (!aiQuestion) {
          throw new Error(`AI question not found: ${questionId}`);
        }
        
        // Check if answer is correct for AI question
        isCorrect = userAnswer === aiQuestion.correctAnswer;
        
        questionDetails = {
          id: (aiQuestion as any).id || questionId,
          questionText: aiQuestion.questionText,
          correctAnswer: aiQuestion.correctAnswer,
          explanation: aiQuestion.explanation,
          difficultyLevel: aiQuestion.difficulty,
          questionType: aiQuestion.questionType,
          options: aiQuestion.options,
          points: aiQuestion.points || 10, // Default points for AI questions
          estimatedTime: aiQuestion.estimatedTime || 30 // Default time for bonuses
        };
      } else {
        // For database questions, fetch from database
        const question = await prisma.question.findUnique({
          where: { id: questionId },
          include: {
            categories: {
              include: {
                category: true,
              },
            },
          },
        });

        if (!question) {
          throw new Error(`Question not found: ${questionId}`);
        }
        
        // Check if answer is correct for database question
        isCorrect = userAnswer === question.correctAnswer;
        questionDetails = question;
      }

      // Final correctness is already calculated above
      const finalIsCorrect = !skipped && isCorrect;

      logger.info('Answer validation debug', {
        sessionId,
        questionId,
        questionPoints: questionDetails.points || 10, // Default points for AI questions
        userAnswer,
        userAnswerType: typeof userAnswer,
        userAnswerStringified: JSON.stringify(userAnswer),
        correctAnswer: questionDetails.correctAnswer,
        correctAnswerType: typeof questionDetails.correctAnswer,
        correctAnswerStringified: JSON.stringify(questionDetails.correctAnswer),
        finalIsCorrect,
        skipped,
        timeTaken,
        hintsUsed,
        questionText: questionDetails.questionText?.substring(0, 50) + '...'
      });

      // Calculate score
      const scoring = this.calculateScore({
        question: questionDetails,
        isCorrect: finalIsCorrect,
        timeTaken,
        hintsUsed,
        currentStreak: await this.getCurrentStreak(sessionId),
      });

      logger.info('Score calculation result', {
        sessionId,
        questionId,
        scoring,
        scoringTotalPoints: scoring?.totalPoints,
        scoringType: typeof scoring,
        finalIsCorrect
      });

      // Ensure scoring has valid properties
      if (!scoring || typeof scoring.totalPoints !== 'number') {
        logger.error('Invalid scoring result', { sessionId, questionId, scoring });
        throw new Error('Score calculation failed - invalid scoring result');
      }

      // Save the answer - handle AI questions differently since they don't exist in database
      const isAIQuestion = questionId.startsWith('ai_');
      
      if (!isAIQuestion) {
        // Only save to database for actual database questions
        await prisma.quizAnswer.create({
          data: {
            sessionId,
            questionId,
            questionIndex: session.currentQuestionIndex,
            userAnswer,
            isCorrect: finalIsCorrect,
            pointsEarned: scoring.totalPoints,
            timeTaken,
            basePoints: scoring.basePoints,
            timeBonus: scoring.timeBonus,
            streakBonus: scoring.streakBonus,
            difficultyBonus: scoring.difficultyBonus,
            hintsUsed,
            skipped,
          },
        });
      }

      // Update session progress (works for both AI and database questions)
      // Add safety checks for undefined values
      const currentScore = session.totalScore || 0;
      const earnedPoints = scoring.totalPoints || 0;
      const currentTimeTaken = session.totalTimeTaken || 0;

      logger.debug('Session update values', {
        sessionId,
        currentQuestionIndex: session.currentQuestionIndex,
        questionsAnswered: session.questionsAnswered,
        correctAnswers: session.correctAnswers,
        currentScore,
        earnedPoints,
        newTotalScore: currentScore + earnedPoints,
        currentTimeTaken,
        timeTaken,
        newTotalTimeTaken: currentTimeTaken + timeTaken
      });

      const updatedSession = await prisma.quizSession.update({
        where: { id: sessionId },
        data: {
          currentQuestionIndex: session.currentQuestionIndex + 1,
          questionsAnswered: session.questionsAnswered + 1,
          correctAnswers: finalIsCorrect ? session.correctAnswers + 1 : session.correctAnswers,
          totalScore: currentScore + earnedPoints,
          totalTimeTaken: currentTimeTaken + timeTaken,
        },
      });

      // Check if quiz is complete
      let nextQuestion: QuizQuestion | null = null;
      if (updatedSession.currentQuestionIndex < updatedSession.questionIds.length) {
        const nextQuestionId = updatedSession.questionIds[updatedSession.currentQuestionIndex];
        
        // Handle AI vs database questions for next question
        if (nextQuestionId.startsWith('ai_')) {
          // For AI questions, get from stored session data
          if (updatedSession.description && this.isAISession(updatedSession.description)) {
            const aiData = JSON.parse(updatedSession.description);
            const aiQuestion = aiData.questions[updatedSession.currentQuestionIndex];
            
            if (aiQuestion) {
              nextQuestion = this.mapAIQuestionToQuizQuestion(aiQuestion, updatedSession.currentQuestionIndex, sessionId);
            }
          }
        } else {
          // For database questions, fetch from database
          const nextQ = await prisma.question.findUnique({
            where: { id: nextQuestionId },
            include: {
              categories: {
                include: {
                  category: true,
                },
              },
            },
          });
          if (nextQ) {
            nextQuestion = this.mapQuestionToQuizQuestion(nextQ);
          }
        }
      } else {
        // Quiz completed - generate results
        await this.completeQuiz(sessionId);
      }

      const response: SubmitAnswerResponse = {
        isCorrect: finalIsCorrect,
        pointsEarned: scoring.totalPoints,
        explanation: session.showExplanations ? (questionDetails.explanation ?? undefined) : undefined,
        correctAnswer: session.showExplanations ? questionDetails.correctAnswer : undefined,
        scoring: {
          basePoints: scoring.basePoints,
          timeBonus: scoring.timeBonus,
          streakBonus: scoring.streakBonus,
          difficultyBonus: scoring.difficultyBonus,
        },
        nextQuestion: nextQuestion ?? undefined,
        sessionProgress: {
          currentQuestionIndex: updatedSession.currentQuestionIndex,
          questionsAnswered: updatedSession.questionsAnswered,
          totalQuestions: updatedSession.totalQuestions,
          totalScore: updatedSession.totalScore,
          progressPercentage: Math.round((updatedSession.questionsAnswered / updatedSession.totalQuestions) * 100),
        },
      };

      logger.info('Answer submitted successfully', { 
        sessionId, 
        questionId, 
        isCorrect: finalIsCorrect, 
        pointsEarned: scoring.totalPoints,
        oldScore: session.totalScore,
        newScore: updatedSession.totalScore,
        sessionProgress: response.sessionProgress
      });

      return response;
    } catch (error) {
      logger.error('Error submitting answer', { 
        request, 
        userId, 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get session by ID with user validation
   */
  async getSession(sessionId: string, userId: string): Promise<QuizSessionResponse> {
    try {
      const session = await this.getSessionWithValidation(sessionId, userId);
      return this.mapSessionToResponse(session);
    } catch (error) {
      logger.error('Error getting session', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Get user's quiz sessions with pagination
   */
  async getUserSessions(
    userId: string, 
    options: { page?: number; limit?: number; status?: QuizSessionStatus[] } = {}
  ): Promise<{ sessions: QuizSessionSummary[]; total: number; page: number; limit: number }> {
    try {
      const { page = 1, limit = 20, status } = options;
      const offset = (page - 1) * limit;

      const where: any = { userId };
      if (status && status.length > 0) {
        where.status = { in: status };
      }

      const [sessions, total] = await Promise.all([
        prisma.quizSession.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.quizSession.count({ where }),
      ]);

      return {
        sessions: sessions.map(this.mapSessionToSummary),
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error getting user sessions', { userId, options, error });
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const now = new Date();
      
      const expiredSessions = await prisma.quizSession.updateMany({
        where: {
          expiresAt: { lt: now },
          status: { in: [QuizSessionStatus.CREATED, QuizSessionStatus.IN_PROGRESS, QuizSessionStatus.PAUSED] },
        },
        data: {
          status: QuizSessionStatus.EXPIRED,
        },
      });

      logger.info(`Cleaned up ${expiredSessions.count} expired sessions`);
      return expiredSessions.count;
    } catch (error) {
      logger.error('Error cleaning up expired sessions', { error });
      throw error;
    }
  }

  // Private helper methods
  
  private async getSessionWithValidation(sessionId: string, userId: string): Promise<QuizSession> {
    const session = await prisma.quizSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error('Quiz session not found');
    }

    if (session.userId !== userId) {
      throw new Error('Access denied to quiz session');
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      throw new Error('Quiz session has expired');
    }

    return session;
  }

  private async validateUserAndSessionLimits(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Clean up abandoned sessions (older than 2 hours for IN_PROGRESS/PAUSED, or 1 hour for CREATED)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const cleanedUp = await prisma.quizSession.updateMany({
      where: {
        userId,
        OR: [
          {
            status: { in: [QuizSessionStatus.IN_PROGRESS, QuizSessionStatus.PAUSED] },
            updatedAt: { lt: twoHoursAgo },
          },
          {
            status: QuizSessionStatus.CREATED,
            createdAt: { lt: oneHourAgo },
          }
        ],
      },
      data: {
        status: QuizSessionStatus.ABANDONED,
      },
    });

    if (cleanedUp.count > 0) {
      logger.info('Cleaned up abandoned quiz sessions', { userId, count: cleanedUp.count });
    }

    // Check concurrent session limit (after cleanup)
    const activeSessions = await prisma.quizSession.count({
      where: {
        userId,
        status: { in: [QuizSessionStatus.CREATED, QuizSessionStatus.IN_PROGRESS, QuizSessionStatus.PAUSED] },
      },
    });

    if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
      throw new Error(`Maximum concurrent sessions (${MAX_CONCURRENT_SESSIONS}) reached`);
    }
  }

  private validateQuizConfiguration(config: QuizConfiguration): void {
    if (config.totalQuestions < 1 || config.totalQuestions > 100) {
      throw new Error('Total questions must be between 1 and 100');
    }

    // For AI quizzes, categories are optional (AI uses topic instead)
    // For database quizzes, at least one category is required
    const isAIQuiz = config.useAI && config.aiTopic;
    if (!isAIQuiz && config.categoryIds.length === 0) {
      throw new Error('At least one category must be selected for database questions');
    }

    // For AI quizzes, ensure aiTopic is provided
    if (isAIQuiz && (!config.aiTopic || config.aiTopic.trim().length === 0)) {
      throw new Error('AI topic is required for AI-generated questions');
    }

    if (config.difficultyLevels.length === 0) {
      throw new Error('At least one difficulty level must be selected');
    }

    if (config.questionTypes.length === 0) {
      throw new Error('At least one question type must be selected');
    }

    if (config.timePerQuestion && (config.timePerQuestion < 5 || config.timePerQuestion > 300)) {
      throw new Error('Time per question must be between 5 and 300 seconds');
    }

    if (config.totalTimeLimit && (config.totalTimeLimit < 60 || config.totalTimeLimit > 7200)) {
      throw new Error('Total time limit must be between 1 minute and 2 hours');
    }
  }

  private async selectQuestionsForQuiz(criteria: QuestionSelectionCriteria): Promise<QuestionPool> {
    const { categoryIds, difficultyLevels, questionTypes, count, excludeRecentIds = [] } = criteria;

    // Build where clause
    const where: any = {
      isActive: true,
      isPublished: true,
      difficultyLevel: { in: difficultyLevels },
      questionType: { in: questionTypes },
      categories: {
        some: {
          categoryId: { in: categoryIds },
        },
      },
    };

    if (excludeRecentIds.length > 0) {
      where.id = { notIn: excludeRecentIds };
    }

    // Get questions
    const questions = await prisma.question.findMany({
      where,
      include: {
        categories: {
          include: {
            category: true,
          },
        },
      },
      take: count * 2, // Get more than needed for better randomization
    });

    // Shuffle and select the required count
    const shuffledQuestions = this.shuffleArray(questions).slice(0, count);

    // Calculate metadata
    const difficultyDistribution: Record<number, number> = {};
    const typeDistribution: Record<QuestionType, number> = {
      MULTIPLE_CHOICE: 0,
      TRUE_FALSE: 0,
      TEXT_INPUT: 0
    };
    let totalEstimatedTime = 0;
    let totalDifficulty = 0;

    shuffledQuestions.forEach(q => {
      difficultyDistribution[q.difficultyLevel] = (difficultyDistribution[q.difficultyLevel] || 0) + 1;
      typeDistribution[q.questionType] = (typeDistribution[q.questionType] || 0) + 1;
      totalEstimatedTime += q.estimatedTime || 30;
      totalDifficulty += q.difficultyLevel;
    });

    return {
      questions: shuffledQuestions.map(this.mapQuestionToQuizQuestion),
      totalAvailable: questions.length,
      selectionMeta: {
        categoriesUsed: categoryIds,
        difficultyDistribution,
        typeDistribution,
        averageDifficulty: totalDifficulty / shuffledQuestions.length,
        estimatedTotalTime: totalEstimatedTime,
      },
    };
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private isAnswerCorrect(userAnswer: any, correctAnswer: any): boolean {
    // Handle different question types
    if (Array.isArray(correctAnswer)) {
      if (!Array.isArray(userAnswer)) return false;
      return JSON.stringify(userAnswer.sort()) === JSON.stringify(correctAnswer.sort());
    }

    if (typeof correctAnswer === 'boolean') {
      return Boolean(userAnswer) === correctAnswer;
    }

    if (typeof correctAnswer === 'string') {
      return String(userAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
    }

    // Handle case where correctAnswer might be a JSON string (from database)
    // Try to parse it and compare the actual value
    let actualCorrectAnswer = correctAnswer;
    if (typeof correctAnswer === 'string' && correctAnswer.startsWith('"') && correctAnswer.endsWith('"')) {
      try {
        actualCorrectAnswer = JSON.parse(correctAnswer);
      } catch (e) {
        // If parsing fails, use the original value
        actualCorrectAnswer = correctAnswer;
      }
    }

    // Re-run comparison with parsed value
    if (typeof actualCorrectAnswer === 'string') {
      return String(userAnswer).trim().toLowerCase() === String(actualCorrectAnswer).trim().toLowerCase();
    }

    if (typeof actualCorrectAnswer === 'boolean') {
      return Boolean(userAnswer) === actualCorrectAnswer;
    }

    if (Array.isArray(actualCorrectAnswer)) {
      if (!Array.isArray(userAnswer)) return false;
      return JSON.stringify(userAnswer.sort()) === JSON.stringify(actualCorrectAnswer.sort());
    }

    return JSON.stringify(userAnswer) === JSON.stringify(actualCorrectAnswer);
  }

  private calculateScore(params: {
    question: Question;
    isCorrect: boolean;
    timeTaken: number;
    hintsUsed: number;
    currentStreak: number;
  }): ScoreCalculation {
    const { question, isCorrect, timeTaken, hintsUsed, currentStreak } = params;

    logger.info('CalculateScore input', {
      questionId: question.id,
      questionPoints: question.points,
      isCorrect,
      timeTaken,
      hintsUsed,
      currentStreak,
      scoringConfig: this.scoringConfig
    });

    if (!isCorrect) {
      return {
        basePoints: 0,
        timeBonus: 0,
        streakBonus: 0,
        difficultyBonus: 0,
        penalty: this.scoringConfig.penaltyForWrongAnswer,
        totalPoints: Math.max(0, -this.scoringConfig.penaltyForWrongAnswer),
      };
    }

    const basePoints = Math.floor(question.points * this.scoringConfig.basePointsMultiplier);
    
    logger.info('BasePoints calculation', {
      questionPoints: question.points,
      basePointsMultiplier: this.scoringConfig.basePointsMultiplier,
      basePoints
    });

    // Time bonus: More points for answering quickly relative to estimated time
    let timeBonus = 0;
    if (this.scoringConfig.timeBonusEnabled && question.estimatedTime) {
      const timeRatio = timeTaken / question.estimatedTime;
      if (timeRatio < 0.5) {
        timeBonus = Math.floor(basePoints * this.scoringConfig.timeBonusMultiplier);
      } else if (timeRatio < 0.8) {
        timeBonus = Math.floor(basePoints * this.scoringConfig.timeBonusMultiplier * 0.5);
      }
    }

    // Streak bonus
    let streakBonus = 0;
    if (this.scoringConfig.streakBonusEnabled && currentStreak >= 3) {
      streakBonus = Math.floor(basePoints * this.scoringConfig.streakBonusMultiplier * Math.min(currentStreak / 3, 3));
    }

    // Difficulty bonus
    let difficultyBonus = 0;
    if (this.scoringConfig.difficultyBonusEnabled && question.difficultyLevel > 2) {
      difficultyBonus = Math.floor(basePoints * this.scoringConfig.difficultyBonusMultiplier * (question.difficultyLevel - 1));
    }

    // Penalty for using hints
    const hintPenalty = Math.floor(basePoints * 0.1 * hintsUsed);

    const totalPoints = Math.max(0, basePoints + timeBonus + streakBonus + difficultyBonus - hintPenalty);

    return {
      basePoints,
      timeBonus,
      streakBonus,
      difficultyBonus,
      penalty: hintPenalty,
      totalPoints,
    };
  }

  private async getCurrentStreak(sessionId: string): Promise<number> {
    const answers = await prisma.quizAnswer.findMany({
      where: { sessionId },
      orderBy: { questionIndex: 'desc' },
      take: 10, // Check last 10 answers for streak
    });

    let streak = 0;
    for (const answer of answers) {
      if (answer.isCorrect && !answer.skipped) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  private async completeQuiz(sessionId: string): Promise<void> {
    await prisma.quizSession.update({
      where: { id: sessionId },
      data: {
        status: QuizSessionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    // Generate detailed results
    // This will be implemented in a separate method
    await this.generateQuizResults(sessionId);
  }

  private async generateQuizResults(sessionId: string): Promise<void> {
    try {
      await this.quizResultsService.generateQuizResults(sessionId);
      logger.info('Quiz results generated successfully', { sessionId });
    } catch (error) {
      logger.error('Failed to generate quiz results', { sessionId, error });
      throw error;
    }
  }

  private async incrementUserStatistic(userId: string, field: string, value: number): Promise<void> {
    await prisma.userStatistics.upsert({
      where: { userId },
      create: {
        userId,
        strongestCategories: [],
        weakestCategories: [],
        categoryProgress: {},
        [field]: value,
      },
      update: {
        [field]: {
          increment: value,
        },
      },
    });
  }

  private mapSessionToResponse(session: QuizSession): QuizSessionResponse {
    return {
      id: session.id,
      userId: session.userId,
      title: session.title ?? undefined,
      description: session.description ?? undefined,
      totalQuestions: session.totalQuestions,
      timePerQuestion: session.timePerQuestion ?? undefined,
      totalTimeLimit: session.totalTimeLimit ?? undefined,
      categoryIds: session.categoryIds,
      difficultyLevels: session.difficultyLevels,
      questionTypes: session.questionTypes,
      shuffleQuestions: session.shuffleQuestions,
      allowPause: session.allowPause,
      showExplanations: session.showExplanations,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      questionsAnswered: session.questionsAnswered,
      correctAnswers: session.correctAnswers,
      totalScore: session.totalScore,
      startedAt: session.startedAt ?? undefined,
      pausedAt: session.pausedAt ?? undefined,
      completedAt: session.completedAt ?? undefined,
      expiresAt: session.expiresAt ?? undefined,
      totalTimeTaken: session.totalTimeTaken,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private mapSessionToSummary(session: QuizSession): QuizSessionSummary {
    return {
      id: session.id,
      title: session.title ?? undefined,
      status: session.status,
      questionsAnswered: session.questionsAnswered,
      totalQuestions: session.totalQuestions,
      correctAnswers: session.correctAnswers,
      totalScore: session.totalScore,
      progressPercentage: Math.round((session.questionsAnswered / session.totalQuestions) * 100),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private mapQuestionToQuizQuestion(question: any): QuizQuestion {
    return {
      id: question.id,
      questionText: question.questionText,
      questionType: question.questionType,
      options: question.options,
      explanation: question.explanation,
      hints: question.hints,
      difficultyLevel: question.difficultyLevel,
      estimatedTime: question.estimatedTime || 30,
      points: question.points,
      categories: question.categories.map((qc: any) => ({
        id: qc.category.id,
        name: qc.category.name,
        slug: qc.category.slug,
      })),
    };
  }

  /**
   * Check if a session description contains AI data
   */
  private isAISession(description: string): boolean {
    try {
      const parsed = JSON.parse(description);
      return parsed.type === 'ai' && parsed.questions && Array.isArray(parsed.questions);
    } catch {
      return false;
    }
  }

  /**
   * Map AI question to QuizQuestion format
   */
  private mapAIQuestionToQuizQuestion(aiQuestion: AIQuestion, index: number, sessionId?: string): QuizQuestion {
    // Use consistent ID that matches what was stored in the session
    const id = (aiQuestion as any).id || `ai_${sessionId || 'session'}_${index}`;
    return {
      id,
      questionText: aiQuestion.questionText,
      questionType: aiQuestion.questionType as QuestionType,
      options: aiQuestion.options,
      explanation: aiQuestion.explanation,
      hints: {},
      difficultyLevel: aiQuestion.difficulty,
      estimatedTime: 30,
      points: 10,
      categories: [], // AI questions don't have traditional categories
    };
  }
}
