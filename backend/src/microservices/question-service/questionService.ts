import { PrismaClient, Question, QuestionDifficulty, QuestionType } from '@prisma/client';
import { logger } from '../../utils/logger';
import { generateSecureToken } from '../../utils/crypto';

interface CreateQuestionData {
  content: string;
  options: string[];
  correctAnswers: number[];
  type: QuestionType;
  difficulty: QuestionDifficulty;
  category: string;
  subject: string;
  tags: string[];
  explanation?: string;
  timeLimit?: number;
  points?: number;
  isActive?: boolean;
}

interface UpdateQuestionData {
  content?: string;
  options?: string[];
  correctAnswers?: number[];
  type?: QuestionType;
  difficulty?: QuestionDifficulty;
  category?: string;
  subject?: string;
  tags?: string[];
  explanation?: string;
  timeLimit?: number;
  points?: number;
  isActive?: boolean;
}

interface QuestionSearchFilters {
  category?: string;
  subject?: string;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
  tags?: string[];
  isActive?: boolean;
  createdBy?: string;
  searchTerm?: string;
}

interface QuestionSearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeInactive?: boolean;
}

interface QuestionStats {
  totalQuestions: number;
  byDifficulty: Record<QuestionDifficulty, number>;
  byType: Record<QuestionType, number>;
  byCategory: Record<string, number>;
  bySubject: Record<string, number>;
  activeQuestions: number;
  inactiveQuestions: number;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
}

export class QuestionService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create a new question
   */
  async createQuestion(data: CreateQuestionData, createdBy: string): Promise<Question> {
    try {
      const question = await this.prisma.question.create({
        data: {
          ...data,
          id: generateSecureToken(16),
          createdBy,
          isActive: data.isActive ?? true,
          metadata: {
            version: 1,
            lastModified: new Date().toISOString(),
            modifiedBy: createdBy
          }
        }
      });

      logger.info('Question created successfully', {
        component: 'QuestionService',
        questionId: question.id,
        category: question.category,
        difficulty: question.difficulty,
        createdBy
      });

      return question;
    } catch (error) {
      logger.error('Failed to create question', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error),
        data
      });
      throw new Error('Failed to create question');
    }
  }

  /**
   * Get question by ID
   */
  async getQuestionById(id: string): Promise<Question | null> {
    try {
      const question = await this.prisma.question.findUnique({
        where: { id }
      });

      if (question) {
        logger.info('Question retrieved successfully', {
          component: 'QuestionService',
          questionId: id
        });
      }

      return question;
    } catch (error) {
      logger.error('Failed to retrieve question', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error),
        questionId: id
      });
      throw new Error('Failed to retrieve question');
    }
  }

  /**
   * Update question
   */
  async updateQuestion(id: string, data: UpdateQuestionData, updatedBy: string): Promise<Question> {
    try {
      const existingQuestion = await this.getQuestionById(id);
      if (!existingQuestion) {
        throw new Error('Question not found');
      }

      const updatedQuestion = await this.prisma.question.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
          metadata: {
            ...(existingQuestion.metadata as object || {}),
            version: ((existingQuestion.metadata as any)?.version || 0) + 1,
            lastModified: new Date().toISOString(),
            modifiedBy: updatedBy
          }
        }
      });

      logger.info('Question updated successfully', {
        component: 'QuestionService',
        questionId: id,
        updatedBy
      });

      return updatedQuestion;
    } catch (error) {
      logger.error('Failed to update question', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error),
        questionId: id
      });
      
      if (error instanceof Error && error.message === 'Question not found') {
        throw error;
      }
      throw new Error('Failed to update question');
    }
  }

  /**
   * Delete question
   */
  async deleteQuestion(id: string): Promise<void> {
    try {
      const existingQuestion = await this.getQuestionById(id);
      if (!existingQuestion) {
        throw new Error('Question not found');
      }

      await this.prisma.question.delete({
        where: { id }
      });

      logger.info('Question deleted successfully', {
        component: 'QuestionService',
        questionId: id
      });
    } catch (error) {
      logger.error('Failed to delete question', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error),
        questionId: id
      });
      
      if (error instanceof Error && error.message === 'Question not found') {
        throw error;
      }
      throw new Error('Failed to delete question');
    }
  }

  /**
   * Search questions with filters and pagination
   */
  async searchQuestions(
    filters: QuestionSearchFilters = {},
    options: QuestionSearchOptions = {}
  ): Promise<{ questions: Question[]; total: number; hasMore: boolean }> {
    try {
      const {
        limit = 20,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        includeInactive = false
      } = options;

      const where: any = {};

      // Apply filters
      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.subject) {
        where.subject = filters.subject;
      }

      if (filters.difficulty) {
        where.difficulty = filters.difficulty;
      }

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.tags && filters.tags.length > 0) {
        where.tags = {
          hasSome: filters.tags
        };
      }

      if (!includeInactive) {
        where.isActive = filters.isActive ?? true;
      } else if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters.createdBy) {
        where.createdBy = filters.createdBy;
      }

      if (filters.searchTerm) {
        where.OR = [
          {
            content: {
              contains: filters.searchTerm,
              mode: 'insensitive'
            }
          },
          {
            explanation: {
              contains: filters.searchTerm,
              mode: 'insensitive'
            }
          }
        ];
      }

      const [questions, total] = await Promise.all([
        this.prisma.question.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { [sortBy]: sortOrder }
        }),
        this.prisma.question.count({ where })
      ]);

      const hasMore = offset + limit < total;

      logger.info('Questions searched successfully', {
        component: 'QuestionService',
        total,
        returned: questions.length,
        filters,
        options
      });

      return { questions, total, hasMore };
    } catch (error) {
      logger.error('Failed to search questions', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error),
        filters,
        options
      });
      throw new Error('Failed to search questions');
    }
  }

  /**
   * Get random questions with filters
   */
  async getRandomQuestions(
    count: number,
    filters: QuestionSearchFilters = {}
  ): Promise<Question[]> {
    try {
      const where: any = {
        isActive: filters.isActive ?? true
      };

      if (filters.category) where.category = filters.category;
      if (filters.subject) where.subject = filters.subject;
      if (filters.difficulty) where.difficulty = filters.difficulty;
      if (filters.type) where.type = filters.type;
      if (filters.tags && filters.tags.length > 0) {
        where.tags = { hasSome: filters.tags };
      }

      // Get total count first
      const totalCount = await this.prisma.question.count({ where });

      if (totalCount === 0) {
        return [];
      }

      if (count >= totalCount) {
        // If requesting all or more questions, return all
        const questions = await this.prisma.question.findMany({
          where,
          orderBy: { createdAt: 'desc' }
        });
        return this.shuffleArray(questions);
      }

      // For random selection, use skip with random offset
      const randomSkips = new Set<number>();
      while (randomSkips.size < count) {
        randomSkips.add(Math.floor(Math.random() * totalCount));
      }

      const questions: Question[] = [];
      for (const skip of randomSkips) {
        const question = await this.prisma.question.findMany({
          where,
          skip,
          take: 1
        });
        if (question.length > 0) {
          questions.push(question[0]);
        }
      }

      logger.info('Random questions retrieved successfully', {
        component: 'QuestionService',
        count: questions.length,
        requested: count,
        filters
      });

      return this.shuffleArray(questions);
    } catch (error) {
      logger.error('Failed to get random questions', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error),
        count,
        filters
      });
      throw new Error('Failed to get random questions');
    }
  }

  /**
   * Get question statistics
   */
  async getQuestionStatistics(): Promise<QuestionStats> {
    try {
      const [
        total,
        byDifficulty,
        byType,
        byCategory,
        bySubject,
        activeCount,
        inactiveCount
      ] = await Promise.all([
        this.prisma.question.count(),
        this.prisma.question.groupBy({
          by: ['difficulty'],
          _count: true
        }),
        this.prisma.question.groupBy({
          by: ['type'],
          _count: true
        }),
        this.prisma.question.groupBy({
          by: ['category'],
          _count: true
        }),
        this.prisma.question.groupBy({
          by: ['subject'],
          _count: true
        }),
        this.prisma.question.count({ where: { isActive: true } }),
        this.prisma.question.count({ where: { isActive: false } })
      ]);

      const stats: QuestionStats = {
        totalQuestions: total,
        byDifficulty: {} as Record<QuestionDifficulty, number>,
        byType: {} as Record<QuestionType, number>,
        byCategory: {},
        bySubject: {},
        activeQuestions: activeCount,
        inactiveQuestions: inactiveCount
      };

      // Initialize with zeros
      Object.values(QuestionDifficulty).forEach(difficulty => {
        stats.byDifficulty[difficulty] = 0;
      });
      Object.values(QuestionType).forEach(type => {
        stats.byType[type] = 0;
      });

      // Fill in actual counts
      byDifficulty.forEach(item => {
        stats.byDifficulty[item.difficulty] = item._count;
      });

      byType.forEach(item => {
        stats.byType[item.type] = item._count;
      });

      byCategory.forEach(item => {
        stats.byCategory[item.category] = item._count;
      });

      bySubject.forEach(item => {
        stats.bySubject[item.subject] = item._count;
      });

      logger.info('Question statistics retrieved successfully', {
        component: 'QuestionService',
        totalQuestions: total
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get question statistics', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Failed to get question statistics');
    }
  }

  /**
   * Bulk import questions
   */
  async bulkImportQuestions(questions: CreateQuestionData[], importedBy: string): Promise<{ imported: number; failed: number }> {
    try {
      let imported = 0;
      let failed = 0;

      for (const questionData of questions) {
        try {
          await this.createQuestion(questionData, importedBy);
          imported++;
        } catch (error) {
          failed++;
          logger.warn('Failed to import question', {
            component: 'QuestionService',
            error: error instanceof Error ? error.message : String(error),
            questionData
          });
        }
      }

      logger.info('Bulk import completed', {
        component: 'QuestionService',
        total: questions.length,
        imported,
        failed,
        importedBy
      });

      return { imported, failed };
    } catch (error) {
      logger.error('Failed to bulk import questions', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('Failed to bulk import questions');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
        service: 'question-service',
        version: '1.0.0',
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Question service health check failed', {
        component: 'QuestionService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        service: 'question-service',
        version: '1.0.0',
        uptime: process.uptime()
      };
    }
  }

  /**
   * Utility method to shuffle array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default QuestionService;

