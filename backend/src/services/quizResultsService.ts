import { 
  QuizSession, 
  QuizAnswer, 
  QuizResult, 
  UserStatistics,
  Question,
  Category
} from '@prisma/client';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import {
  QuizResultSummary,
  DetailedQuizResult,
  CategoryPerformance,
  DifficultyPerformance,
  QuestionTypePerformance,
  QuestionResult,
  UserStatisticsResponse,
  CategoryStrength,
  DIFFICULTY_NAMES,
} from '@/types/quiz';

export class QuizResultsService {

  /**
   * Generate comprehensive quiz results
   */
  async generateQuizResults(sessionId: string): Promise<DetailedQuizResult> {
    try {
      const session = await prisma.quizSession.findUnique({
        where: { id: sessionId },
        include: {
          answers: {
            orderBy: { questionIndex: 'asc' },
          },
          user: true,
        },
      });

      if (!session) {
        throw new Error('Quiz session not found');
      }

      // Get all questions used in the quiz (filter out AI questions)
      const databaseQuestionIds = session.questionIds.filter(id => !id.startsWith('ai_'));
      const questions = databaseQuestionIds.length > 0 ? await prisma.question.findMany({
        where: {
          id: { in: databaseQuestionIds },
        },
        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
      }) : [];

      // Calculate basic stats from actual answer records
      const totalQuestions = session.totalQuestions;
      const totalSubmissions = session.answers.length; // Total answers submitted (including skipped)
      const skippedAnswers = session.answers.filter(answer => answer.skipped);
      const nonSkippedAnswers = session.answers.filter(answer => !answer.skipped);
      
      // Handle questions that were never reached (if quiz was abandoned early)
      const questionsNotReached = Math.max(0, totalQuestions - totalSubmissions);
      const skippedQuestions = skippedAnswers.length;
      const questionsAnswered = nonSkippedAnswers.length; // Only count non-skipped as "answered"
      const correctAnswers = nonSkippedAnswers.filter(answer => answer.isCorrect).length;
      const incorrectAnswers = questionsAnswered - correctAnswers;
      
      logger.info('Quiz results calculation', {
        sessionId,
        totalQuestions,
        totalSubmissions,
        questionsAnswered,
        skippedQuestions,
        questionsNotReached,
        correctAnswers,
        incorrectAnswers
      });
      const totalScore = session.totalScore;
      
      // Calculate maximum possible score
      const maxPossibleScore = questions.reduce((sum, q) => sum + q.points, 0);
      
      const scorePercentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
      const accuracyRate = questionsAnswered > 0 ? (correctAnswers / questionsAnswered) * 100 : 0;
      const averageTimePerQuestion = questionsAnswered > 0 ? session.totalTimeTaken / questionsAnswered : 0;
      
      // Calculate longest streak
      const streakCount = this.calculateLongestStreak(session.answers);
      
      // Calculate time efficiency (points per second)
      const timeEfficiency = session.totalTimeTaken > 0 ? totalScore / session.totalTimeTaken : 0;

      // Generate category performance stats
      const categoryStats = await this.calculateCategoryPerformance(session.answers, questions);
      
      // Generate difficulty performance stats
      const difficultyStats = await this.calculateDifficultyPerformance(session.answers, questions);
      
      // Generate question type performance stats
      const questionTypeStats = await this.calculateQuestionTypePerformance(session.answers, questions);
      
      // Generate detailed question results
      const questionResults = await this.generateQuestionResults(session.answers, questions);

      // Calculate achievements
      const achievements = await this.calculateAchievements(session, {
        totalScore,
        accuracyRate,
        streakCount,
        timeEfficiency,
        perfectScore: totalScore === maxPossibleScore,
      });

      // Create or update quiz result record
      const result = await prisma.quizResult.upsert({
        where: { sessionId },
        create: {
          sessionId,
          userId: session.userId,
          totalQuestions,
          questionsAnswered,
          correctAnswers,
          incorrectAnswers,
          skippedQuestions,
          totalScore,
          maxPossibleScore,
          scorePercentage,
          totalTimeTaken: session.totalTimeTaken,
          averageTimePerQuestion,
          accuracyRate,
          streakCount,
          timeEfficiency,
          categoryStats: JSON.stringify(categoryStats),
          difficultyStats: JSON.stringify(difficultyStats),
          questionTypeStats: JSON.stringify(questionTypeStats),
          achievements,
          completedAt: session.completedAt || new Date(),
        },
        update: {
          totalQuestions,
          questionsAnswered,
          correctAnswers,
          incorrectAnswers,
          skippedQuestions,
          totalScore,
          maxPossibleScore,
          scorePercentage,
          totalTimeTaken: session.totalTimeTaken,
          averageTimePerQuestion,
          accuracyRate,
          streakCount,
          timeEfficiency,
          categoryStats: JSON.stringify(categoryStats),
          difficultyStats: JSON.stringify(difficultyStats),
          questionTypeStats: JSON.stringify(questionTypeStats),
          achievements,
        },
      });

      // Update user statistics
      await this.updateUserStatistics(session.userId, result, session);

      logger.info('Quiz results generated successfully', { 
        sessionId, 
        totalScore, 
        accuracyRate: accuracyRate.toFixed(2) 
      });

      return {
        id: result.id,
        sessionId: result.sessionId,
        totalQuestions: result.totalQuestions,
        questionsAnswered: result.questionsAnswered,
        correctAnswers: result.correctAnswers,
        incorrectAnswers: result.incorrectAnswers,
        skippedQuestions: result.skippedQuestions,
        totalScore: result.totalScore,
        maxPossibleScore: result.maxPossibleScore,
        scorePercentage: result.scorePercentage,
        totalTimeTaken: result.totalTimeTaken,
        averageTimePerQuestion: result.averageTimePerQuestion,
        accuracyRate: result.accuracyRate,
        streakCount: result.streakCount,
        timeEfficiency: result.timeEfficiency,
        completedAt: result.completedAt,
        rank: result.rank ?? undefined,
        achievements: result.achievements,
        categoryStats,
        difficultyStats,
        questionTypeStats,
        questionResults,
      };
    } catch (error) {
      logger.error('Error generating quiz results', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get quiz result by session ID
   */
  async getQuizResult(sessionId: string, userId: string): Promise<DetailedQuizResult | null> {
    try {
      const result = await prisma.quizResult.findUnique({
        where: { sessionId },
        include: {
          session: true,
        },
      });

      if (!result || result.userId !== userId) {
        return null;
      }

      // Get detailed question results
      const session = await prisma.quizSession.findUnique({
        where: { id: sessionId },
        include: {
          answers: {
            orderBy: { questionIndex: 'asc' },
          },
        },
      });

      // Filter out AI questions before querying database
      const databaseQuestionIds = (session?.questionIds || []).filter(id => !id.startsWith('ai_'));
      const questions = databaseQuestionIds.length > 0 ? await prisma.question.findMany({
        where: { id: { in: databaseQuestionIds } },
        include: {
          categories: {
            include: { category: true },
          },
        },
      }) : [];

      const questionResults = session ? await this.generateQuestionResults(session.answers, questions) : [];

      return {
        id: result.id,
        sessionId: result.sessionId,
        totalQuestions: result.totalQuestions,
        questionsAnswered: result.questionsAnswered,
        correctAnswers: result.correctAnswers,
        incorrectAnswers: result.incorrectAnswers,
        skippedQuestions: result.skippedQuestions,
        totalScore: result.totalScore,
        maxPossibleScore: result.maxPossibleScore,
        scorePercentage: result.scorePercentage,
        totalTimeTaken: result.totalTimeTaken,
        averageTimePerQuestion: result.averageTimePerQuestion,
        accuracyRate: result.accuracyRate,
        streakCount: result.streakCount,
        timeEfficiency: result.timeEfficiency,
        completedAt: result.completedAt,
        rank: result.rank ?? undefined,
        achievements: result.achievements,
        categoryStats: JSON.parse(result.categoryStats as string) as CategoryPerformance[],
        difficultyStats: JSON.parse(result.difficultyStats as string) as DifficultyPerformance[],
        questionTypeStats: JSON.parse(result.questionTypeStats as string) as QuestionTypePerformance[],
        questionResults,
      };
    } catch (error) {
      logger.error('Error getting quiz result', { sessionId, userId, error });
      throw error;
    }
  }

  /**
   * Get user's quiz history with results
   */
  async getUserQuizHistory(
    userId: string,
    options: { page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}
  ) {
    try {
      const { page = 1, limit = 20, sortBy = 'completedAt', sortOrder = 'desc' } = options;
      const offset = (page - 1) * limit;

      const [results, total] = await Promise.all([
        prisma.quizResult.findMany({
          where: { userId },
          orderBy: { [sortBy]: sortOrder },
          skip: offset,
          take: limit,
          include: {
            session: {
              select: {
                title: true,
                description: true,
                categoryIds: true,
              },
            },
          },
        }),
        prisma.quizResult.count({ where: { userId } }),
      ]);

      return {
        results: results.map(result => ({
          id: result.id,
          sessionId: result.sessionId,
          title: result.session.title,
          totalQuestions: result.totalQuestions,
          correctAnswers: result.correctAnswers,
          totalScore: result.totalScore,
          scorePercentage: result.scorePercentage,
          accuracyRate: result.accuracyRate,
          completedAt: result.completedAt,
          achievements: result.achievements,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      };
    } catch (error) {
      logger.error('Error getting user quiz history', { userId, options, error });
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(userId: string): Promise<UserStatisticsResponse> {
    try {
      let stats = await prisma.userStatistics.findUnique({
        where: { userId },
      });

      if (!stats) {
        // Create initial statistics record
        stats = await prisma.userStatistics.create({
          data: { 
            userId,
            strongestCategories: [],
            weakestCategories: [],
            categoryProgress: {}
          },
        });
      }

      // Calculate strongest and weakest categories
      const categoryProgress = stats.categoryProgress as any || {};
      const strongestCategories: CategoryStrength[] = [];
      const weakestCategories: CategoryStrength[] = [];

      // Get category names - filter out invalid IDs
      const categoryIds = Object.keys(categoryProgress)
        .map(Number)
        .filter(id => !isNaN(id) && id > 0);
      
      const categories = categoryIds.length > 0 ? await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      }) : [];

      for (const [categoryIdStr, progress] of Object.entries(categoryProgress)) {
        const categoryId = parseInt(categoryIdStr);
        const category = categories.find(c => c.id === categoryId);
        const prog = progress as any;
        
        if (category && prog.quizzesCompleted > 0) {
          const categoryStrength: CategoryStrength = {
            categoryId,
            categoryName: category.name,
            accuracyRate: prog.accuracyRate || 0,
            averageScore: prog.averageScore || 0,
            quizzesCompleted: prog.quizzesCompleted || 0,
          };

          if (prog.accuracyRate >= 80) {
            strongestCategories.push(categoryStrength);
          } else if (prog.accuracyRate <= 50) {
            weakestCategories.push(categoryStrength);
          }
        }
      }

      // Sort by accuracy rate
      strongestCategories.sort((a, b) => b.accuracyRate - a.accuracyRate);
      weakestCategories.sort((a, b) => a.accuracyRate - b.accuracyRate);

      return {
        totalQuizzesCompleted: stats.totalQuizzesCompleted,
        totalQuizzesStarted: stats.totalQuizzesStarted,
        completionRate: stats.completionRate,
        totalQuestionsAnswered: stats.totalQuestionsAnswered,
        totalCorrectAnswers: stats.totalCorrectAnswers,
        overallAccuracy: stats.overallAccuracy,
        averageScore: stats.averageScore,
        totalTimeSpent: stats.totalTimeSpent,
        averageQuizTime: stats.averageQuizTime,
        averageQuestionTime: stats.averageQuestionTime,
        bestScore: stats.bestScore,
        longestStreak: stats.longestStreak,
        perfectQuizzes: stats.perfectQuizzes,
        strongestCategories: strongestCategories.slice(0, 5),
        weakestCategories: weakestCategories.slice(0, 5),
        lastQuizDate: stats.lastQuizDate ?? undefined,
        currentStreak: stats.currentStreak,
        longestDailyStreak: stats.longestDailyStreak,
        experiencePoints: stats.experiencePoints,
        level: stats.level,
        rank: stats.rank ?? undefined,
      };
    } catch (error) {
      logger.error('Error getting user statistics', { userId, error });
      throw error;
    }
  }

  // Private helper methods

  private calculateLongestStreak(answers: QuizAnswer[]): number {
    let longestStreak = 0;
    let currentStreak = 0;

    for (const answer of answers) {
      if (answer.isCorrect && !answer.skipped) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return longestStreak;
  }

  private async calculateCategoryPerformance(
    answers: QuizAnswer[],
    questions: any[]
  ): Promise<CategoryPerformance[]> {
    const categoryMap = new Map<number, {
      name: string;
      total: number;
      correct: number;
      totalScore: number;
      totalTime: number;
    }>();

    // Group answers by category
    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (!question) continue;

      for (const qc of question.categories) {
        const categoryId = qc.category.id;
        const categoryName = qc.category.name;

        if (!categoryMap.has(categoryId)) {
          categoryMap.set(categoryId, {
            name: categoryName,
            total: 0,
            correct: 0,
            totalScore: 0,
            totalTime: 0,
          });
        }

        const stats = categoryMap.get(categoryId)!;
        stats.total++;
        if (answer.isCorrect) stats.correct++;
        stats.totalScore += answer.pointsEarned;
        stats.totalTime += answer.timeTaken;
      }
    }

    // Convert to performance array
    return Array.from(categoryMap.entries()).map(([categoryId, stats]) => ({
      categoryId,
      categoryName: stats.name,
      questionsTotal: stats.total,
      questionsCorrect: stats.correct,
      accuracyRate: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      averageScore: stats.total > 0 ? stats.totalScore / stats.total : 0,
      averageTime: stats.total > 0 ? stats.totalTime / stats.total : 0,
    }));
  }

  private async calculateDifficultyPerformance(
    answers: QuizAnswer[],
    questions: any[]
  ): Promise<DifficultyPerformance[]> {
    const difficultyMap = new Map<number, {
      total: number;
      correct: number;
      totalScore: number;
      totalTime: number;
    }>();

    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (!question) continue;

      const difficulty = question.difficultyLevel;
      if (!difficultyMap.has(difficulty)) {
        difficultyMap.set(difficulty, {
          total: 0,
          correct: 0,
          totalScore: 0,
          totalTime: 0,
        });
      }

      const stats = difficultyMap.get(difficulty)!;
      stats.total++;
      if (answer.isCorrect) stats.correct++;
      stats.totalScore += answer.pointsEarned;
      stats.totalTime += answer.timeTaken;
    }

    return Array.from(difficultyMap.entries()).map(([level, stats]) => ({
      difficultyLevel: level,
      difficultyName: DIFFICULTY_NAMES[level as keyof typeof DIFFICULTY_NAMES] || 'Unknown',
      questionsTotal: stats.total,
      questionsCorrect: stats.correct,
      accuracyRate: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      averageScore: stats.total > 0 ? stats.totalScore / stats.total : 0,
      averageTime: stats.total > 0 ? stats.totalTime / stats.total : 0,
    }));
  }

  private async calculateQuestionTypePerformance(
    answers: QuizAnswer[],
    questions: any[]
  ): Promise<QuestionTypePerformance[]> {
    const typeMap = new Map<string, {
      total: number;
      correct: number;
      totalScore: number;
      totalTime: number;
    }>();

    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (!question) continue;

      const type = question.questionType;
      if (!typeMap.has(type)) {
        typeMap.set(type, {
          total: 0,
          correct: 0,
          totalScore: 0,
          totalTime: 0,
        });
      }

      const stats = typeMap.get(type)!;
      stats.total++;
      if (answer.isCorrect) stats.correct++;
      stats.totalScore += answer.pointsEarned;
      stats.totalTime += answer.timeTaken;
    }

    return Array.from(typeMap.entries()).map(([type, stats]) => ({
      questionType: type as any,
      questionsTotal: stats.total,
      questionsCorrect: stats.correct,
      accuracyRate: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      averageScore: stats.total > 0 ? stats.totalScore / stats.total : 0,
      averageTime: stats.total > 0 ? stats.totalTime / stats.total : 0,
    }));
  }

  private async generateQuestionResults(
    answers: QuizAnswer[],
    questions: any[]
  ): Promise<QuestionResult[]> {
    return answers.map(answer => {
      const question = questions.find(q => q.id === answer.questionId);
      const categoryName = question?.categories?.[0]?.category?.name || 'Unknown';

      // Extract readable correct answer
      const correctAnswer = this.extractReadableAnswer(question?.correctAnswer, question?.options);
      
      // Extract readable user answer (convert index to option text for multiple choice)
      const readableUserAnswer = this.extractReadableAnswer(answer.userAnswer, question?.options);

      return {
        questionId: answer.questionId,
        questionText: question?.questionText || 'Question not found',
        questionType: question?.questionType || 'MULTIPLE_CHOICE',
        difficultyLevel: question?.difficultyLevel || 1,
        categoryName,
        userAnswer: readableUserAnswer,
        correctAnswer,
        isCorrect: answer.isCorrect,
        timeTaken: answer.timeTaken,
        pointsEarned: answer.pointsEarned,
        hintsUsed: answer.hintsUsed,
        skipped: answer.skipped,
        explanation: question?.explanation,
      };
    });
  }

  /**
   * Extract readable answer from the database correctAnswer field
   */
  private extractReadableAnswer(correctAnswer: any, options: any): string {
    // If it's already a string, return as-is
    if (typeof correctAnswer === 'string') {
      return correctAnswer;
    }

    // If it's a boolean, convert to string
    if (typeof correctAnswer === 'boolean') {
      return correctAnswer.toString();
    }

    // If it's a number, check if it's an index into options array
    if (typeof correctAnswer === 'number') {
      // For multiple choice questions, number represents index
      if (options && options.options && Array.isArray(options.options) && options.options[correctAnswer] !== undefined) {
        return options.options[correctAnswer];
      }
      // Otherwise, convert to string (for other question types)
      return correctAnswer.toString();
    }

    // Handle JSON object format for multiple choice questions
    if (typeof correctAnswer === 'object' && correctAnswer !== null) {
      // Format: {"type": "single", "indices": [1]}
      if (correctAnswer.type === 'single' && Array.isArray(correctAnswer.indices)) {
        const index = correctAnswer.indices[0];
        if (options && options.options && Array.isArray(options.options) && options.options[index] !== undefined) {
          return options.options[index];
        }
      }

      // Format: {"type": "multiple", "indices": [0, 2]}
      if (correctAnswer.type === 'multiple' && Array.isArray(correctAnswer.indices)) {
        if (options && options.options && Array.isArray(options.options)) {
          const answers = correctAnswer.indices
            .filter((index: number) => options.options[index] !== undefined)
            .map((index: number) => options.options[index]);
          return answers.join(', ');
        }
      }

      // If we can't parse it, try to JSON.stringify as fallback
      try {
        return JSON.stringify(correctAnswer);
      } catch {
        return 'Unknown';
      }
    }

    // Fallback for unknown types
    return 'Unknown';
  }

  private async calculateAchievements(
    session: any,
    performance: {
      totalScore: number;
      accuracyRate: number;
      streakCount: number;
      timeEfficiency: number;
      perfectScore: boolean;
    }
  ): Promise<string[]> {
    const achievements: string[] = [];

    // Perfect score achievement
    if (performance.perfectScore) {
      achievements.push('perfect_score');
    }

    // High accuracy achievements
    if (performance.accuracyRate === 100) {
      achievements.push('flawless_victory');
    } else if (performance.accuracyRate >= 90) {
      achievements.push('excellence');
    } else if (performance.accuracyRate >= 80) {
      achievements.push('high_achiever');
    }

    // Streak achievements
    if (performance.streakCount >= 10) {
      achievements.push('streak_master');
    } else if (performance.streakCount >= 5) {
      achievements.push('on_fire');
    }

    // Speed achievements
    if (performance.timeEfficiency >= 2) {
      achievements.push('speed_demon');
    } else if (performance.timeEfficiency >= 1) {
      achievements.push('quick_thinker');
    }

    // Quiz length achievements
    if (session.totalQuestions >= 50) {
      achievements.push('marathon_runner');
    } else if (session.totalQuestions >= 25) {
      achievements.push('dedicated_learner');
    }

    return achievements;
  }

  private async updateUserStatistics(userId: string, result: any, session: any): Promise<void> {
    try {
      const currentStats = await prisma.userStatistics.findUnique({
        where: { userId },
      });

      const now = new Date();
      const isNewDay = currentStats?.lastQuizDate && 
        now.toDateString() !== currentStats.lastQuizDate.toDateString();

      // Calculate new values
      const newTotalCompleted = (currentStats?.totalQuizzesCompleted || 0) + 1;
      const newTotalQuestionsAnswered = (currentStats?.totalQuestionsAnswered || 0) + result.questionsAnswered;
      const newTotalCorrectAnswers = (currentStats?.totalCorrectAnswers || 0) + result.correctAnswers;
      const newTotalTimeSpent = (currentStats?.totalTimeSpent || 0) + result.totalTimeTaken;
      const newTotalScore = (currentStats?.bestScore || 0) < result.totalScore ? result.totalScore : (currentStats?.bestScore || 0);
      
      const newOverallAccuracy = newTotalQuestionsAnswered > 0 ? 
        (newTotalCorrectAnswers / newTotalQuestionsAnswered) * 100 : 0;
      
      const newAverageScore = newTotalCompleted > 0 ? 
        (((currentStats?.averageScore || 0) * (newTotalCompleted - 1)) + result.totalScore) / newTotalCompleted : 
        result.totalScore;

      const newAverageQuizTime = newTotalCompleted > 0 ?
        (((currentStats?.averageQuizTime || 0) * (newTotalCompleted - 1)) + result.totalTimeTaken) / newTotalCompleted :
        result.totalTimeTaken;

      const newAverageQuestionTime = newTotalQuestionsAnswered > 0 ?
        newTotalTimeSpent / newTotalQuestionsAnswered : 0;

      // Update streak logic
      let currentStreak = currentStats?.currentStreak || 0;
      if (isNewDay) {
        currentStreak = 1;
      } else if (!currentStats?.lastQuizDate || isNewDay) {
        currentStreak = 1;
      }

      const longestDailyStreak = Math.max(currentStreak, currentStats?.longestDailyStreak || 0);
      const longestStreak = Math.max(result.streakCount, currentStats?.longestStreak || 0);
      
      // Perfect quiz count
      const perfectQuizzes = (currentStats?.perfectQuizzes || 0) + 
        (result.scorePercentage === 100 ? 1 : 0);

      // Calculate experience points
      const expGained = Math.floor(result.totalScore * 0.1) + 
        (result.scorePercentage === 100 ? 50 : 0) + 
        (result.accuracyRate >= 80 ? 25 : 0);
      const totalExp = (currentStats?.experiencePoints || 0) + expGained;
      const newLevel = Math.floor(totalExp / 1000) + 1;

      // Update category progress
      const categoryProgress = currentStats?.categoryProgress as any || {};
      
      for (const categoryId of session.categoryIds) {
        if (!categoryProgress[categoryId]) {
          categoryProgress[categoryId] = {
            quizzesCompleted: 0,
            totalScore: 0,
            accuracyRate: 0,
            totalQuestions: 0,
            correctAnswers: 0,
          };
        }

        const categoryStats = categoryProgress[categoryId];
        categoryStats.quizzesCompleted++;
        categoryStats.totalQuestions += result.questionsAnswered;
        categoryStats.correctAnswers += result.correctAnswers;
        categoryStats.totalScore += result.totalScore;
        categoryStats.accuracyRate = (categoryStats.correctAnswers / categoryStats.totalQuestions) * 100;
      }

      // Update the statistics
      await prisma.userStatistics.upsert({
        where: { userId },
        create: {
          userId,
          strongestCategories: [],
          weakestCategories: [],
          totalQuizzesCompleted: 1,
          totalQuizzesStarted: currentStats?.totalQuizzesStarted || 1,
          completionRate: 100,
          totalQuestionsAnswered: result.questionsAnswered,
          totalCorrectAnswers: result.correctAnswers,
          overallAccuracy: newOverallAccuracy,
          averageScore: result.totalScore,
          totalTimeSpent: result.totalTimeTaken,
          averageQuizTime: result.totalTimeTaken,
          averageQuestionTime: result.averageTimePerQuestion,
          bestScore: result.totalScore,
          longestStreak: result.streakCount,
          perfectQuizzes: result.scorePercentage === 100 ? 1 : 0,
          categoryProgress,
          lastQuizDate: now,
          currentStreak: 1,
          longestDailyStreak: 1,
          experiencePoints: expGained,
          level: newLevel,
        },
        update: {
          totalQuizzesCompleted: newTotalCompleted,
          completionRate: (newTotalCompleted / (currentStats?.totalQuizzesStarted || 1)) * 100,
          totalQuestionsAnswered: newTotalQuestionsAnswered,
          totalCorrectAnswers: newTotalCorrectAnswers,
          overallAccuracy: newOverallAccuracy,
          averageScore: newAverageScore,
          totalTimeSpent: newTotalTimeSpent,
          averageQuizTime: newAverageQuizTime,
          averageQuestionTime: newAverageQuestionTime,
          bestScore: newTotalScore,
          longestStreak,
          perfectQuizzes,
          categoryProgress,
          lastQuizDate: now,
          currentStreak,
          longestDailyStreak,
          experiencePoints: totalExp,
          level: newLevel,
        },
      });

      logger.info('User statistics updated', { 
        userId, 
        newLevel, 
        expGained, 
        newOverallAccuracy: newOverallAccuracy.toFixed(2) 
      });
    } catch (error) {
      logger.error('Error updating user statistics', { userId, error });
      // Don't throw error to avoid breaking quiz completion
    }
  }
}
