import { PrismaClient, QuestionType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  CreateQuestionRequest,
  UpdateQuestionRequest,
  QuestionResponse,
  QuestionSearchParams,
  QuestionSearchResponse,
  BulkQuestionOperation,
  BulkOperationResponse,
  QuestionWithRelations,
  DifficultyLevel,
  QuestionSource,
  QuestionAuditAction,
  QuestionImportData,
  QuestionExportData
} from '../types/question';
import { validateQuestionType, validateDifficulty, validateTags } from '../utils/questionValidation';
import { logger } from '../config/logger';

export class QuestionService {
  private readonly prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  // Create a new question
  async createQuestion(data: CreateQuestionRequest, createdById: string): Promise<QuestionResponse> {
    try {
      // Validate question type specific data
      const validationError = validateQuestionType(data.questionType, data.options, data.correctAnswer);
      if (validationError) {
        throw new Error(validationError);
      }

      // Validate difficulty level
      if (!validateDifficulty(data.difficultyLevel)) {
        throw new Error('Invalid difficulty level');
      }

      // Validate tags
      const tagValidationError = validateTags(data.tags);
      if (tagValidationError) {
        throw new Error(tagValidationError);
      }

      // Validate categories exist
      const categories = await this.prisma.category.findMany({
        where: {
          id: { in: data.categoryIds },
          isActive: true
        }
      });

      if (categories.length !== data.categoryIds.length) {
        throw new Error('One or more categories not found or inactive');
      }

      // Create question with categories in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the question
        const question = await tx.question.create({
          data: {
            questionText: data.questionText,
            questionType: data.questionType,
            options: data.options || undefined,
            correctAnswer: data.correctAnswer,
            explanation: data.explanation,
            hints: data.hints || undefined,
            difficultyLevel: data.difficultyLevel,
            estimatedTime: data.estimatedTime || 30,
            points: data.points,
            tags: data.tags,
            metadata: data.metadata || undefined,
            createdById,
            isActive: true,
            isPublished: false
          },
          include: {
            createdBy: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          }
        });

        // Create question-category relationships
        await tx.questionCategory.createMany({
          data: data.categoryIds.map(categoryId => ({
            questionId: question.id,
            categoryId
          }))
        });

        // Create audit log
        await tx.questionAudit.create({
          data: {
            questionId: question.id,
            action: QuestionAuditAction.CREATED,
            changes: {
              questionType: data.questionType,
              difficultyLevel: data.difficultyLevel,
              categoryIds: data.categoryIds
            },
            userId: createdById
          }
        });

        return question;
      });

      logger.info('Question created successfully', {
        questionId: result.id,
        questionType: result.questionType,
        createdBy: createdById
      });

      // Return formatted response
      return await this.getQuestionById(result.id, createdById);
    } catch (error) {
      logger.error('Failed to create question', {
        error: error instanceof Error ? error.message : 'Unknown error',
        data,
        createdById
      });
      throw error;
    }
  }

  // Get question by ID
  async getQuestionById(id: string, userId?: string, includeCorrectAnswer: boolean = true): Promise<QuestionResponse> {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        categories: {
          include: {
            category: true
          }
        },
        createdBy: {
          select: {
            id: true,
            username: true
          }
        },
        lastModifiedBy: {
          select: {
            id: true,
            username: true
          }
        },
        usage: {
          orderBy: {
            lastUsed: 'desc'
          },
          take: 1
        }
      }
    });

    if (!question) {
      throw new Error('Question not found');
    }

    return this.formatQuestionResponse(question as QuestionWithRelations, includeCorrectAnswer);
  }

  // Update question
  async updateQuestion(id: string, data: UpdateQuestionRequest, userId: string): Promise<QuestionResponse> {
    try {
      // Check if question exists and user has permission
      const existingQuestion = await this.prisma.question.findUnique({
        where: { id },
        include: {
          createdBy: true
        }
      });

      if (!existingQuestion) {
        throw new Error('Question not found');
      }

      // Validate question type specific data if provided
      if (data.questionType && data.options && data.correctAnswer) {
        const validationError = validateQuestionType(data.questionType, data.options, data.correctAnswer);
        if (validationError) {
          throw new Error(validationError);
        }
      }

      // Validate difficulty level if provided
      if (data.difficultyLevel && !validateDifficulty(data.difficultyLevel)) {
        throw new Error('Invalid difficulty level');
      }

      // Validate tags if provided
      if (data.tags) {
        const tagValidationError = validateTags(data.tags);
        if (tagValidationError) {
          throw new Error(tagValidationError);
        }
      }

      // Update in transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Update question
        const updatedQuestion = await tx.question.update({
          where: { id },
          data: {
            ...data,
            lastModifiedById: userId,
            publishedAt: data.isPublished && !existingQuestion.isPublished ? new Date() : existingQuestion.publishedAt,
            version: { increment: 1 }
          }
        });

        // Update category relationships if provided
        if (data.categoryIds) {
          // Delete existing relationships
          await tx.questionCategory.deleteMany({
            where: { questionId: id }
          });

          // Create new relationships
          if (data.categoryIds.length > 0) {
            await tx.questionCategory.createMany({
              data: data.categoryIds.map(categoryId => ({
                questionId: id,
                categoryId
              }))
            });
          }
        }

        // Create audit log
        await tx.questionAudit.create({
          data: {
            questionId: id,
            action: data.isPublished && !existingQuestion.isPublished 
              ? QuestionAuditAction.PUBLISHED 
              : QuestionAuditAction.UPDATED,
            changes: data as any,
            userId
          }
        });

        return updatedQuestion;
      });

      logger.info('Question updated successfully', {
        questionId: id,
        updatedBy: userId,
        changes: Object.keys(data)
      });

      return await this.getQuestionById(id, userId);
    } catch (error) {
      logger.error('Failed to update question', {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId: id,
        data,
        userId
      });
      throw error;
    }
  }

  // Delete question (soft delete)
  async deleteQuestion(id: string, userId: string): Promise<void> {
    try {
      const question = await this.prisma.question.findUnique({
        where: { id }
      });

      if (!question) {
        throw new Error('Question not found');
      }

      await this.prisma.$transaction(async (tx) => {
        // Soft delete the question
        await tx.question.update({
          where: { id },
          data: {
            isActive: false,
            lastModifiedById: userId
          }
        });

        // Create audit log
        await tx.questionAudit.create({
          data: {
            questionId: id,
            action: QuestionAuditAction.DELETED,
            userId
          }
        });
      });

      logger.info('Question deleted successfully', {
        questionId: id,
        deletedBy: userId
      });
    } catch (error) {
      logger.error('Failed to delete question', {
        error: error instanceof Error ? error.message : 'Unknown error',
        questionId: id,
        userId
      });
      throw error;
    }
  }

  // Search questions with filters and pagination
  async searchQuestions(params: QuestionSearchParams, userId?: string): Promise<QuestionSearchResponse> {
    try {
      const {
        search,
        categoryIds,
        questionType,
        difficultyLevel,
        tags,
        source,
        isPublished,
        createdBy,
        dateFrom,
        dateTo,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 20
      } = params;

      // Build where clause
      const where: Prisma.QuestionWhereInput = {
        isActive: true,
        ...(search && {
          OR: [
            { questionText: { contains: search, mode: 'insensitive' } },
            { explanation: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } }
          ]
        }),
        ...(categoryIds?.length && {
          categories: {
            some: {
              categoryId: { in: categoryIds }
            }
          }
        }),
        ...(questionType && { questionType }),
        ...(difficultyLevel?.length && { difficultyLevel: { in: difficultyLevel } }),
        ...(tags?.length && { tags: { hasSome: tags } }),
        ...(source && { source }),
        ...(typeof isPublished === 'boolean' && { isPublished }),
        ...(createdBy && { createdById: createdBy }),
        ...(dateFrom && { createdAt: { gte: dateFrom } }),
        ...(dateTo && { createdAt: { lte: dateTo } })
      };

      // Build order by clause
      const orderBy: Prisma.QuestionOrderByWithRelationInput = {};
      orderBy[sortBy as keyof Prisma.QuestionOrderByWithRelationInput] = sortOrder;

      // Calculate offset
      const offset = (page - 1) * limit;

      // Execute search with pagination
      const [questions, total] = await Promise.all([
        this.prisma.question.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          include: {
            categories: {
              include: {
                category: true
              }
            },
            createdBy: {
              select: {
                id: true,
                username: true
              }
            },
            lastModifiedBy: {
              select: {
                id: true,
                username: true
              }
            },
            usage: {
              orderBy: {
                lastUsed: 'desc'
              },
              take: 1
            }
          }
        }),
        this.prisma.question.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        questions: questions.map(q => this.formatQuestionResponse(q as QuestionWithRelations, false)),
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      };
    } catch (error) {
      logger.error('Failed to search questions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params
      });
      throw error;
    }
  }

  // Bulk operations on questions
  async bulkOperation(operation: BulkQuestionOperation, userId: string): Promise<BulkOperationResponse> {
    const { questionIds, operation: op, data } = operation;
    const results: BulkOperationResponse = {
      success: false,
      processed: 0,
      failed: 0,
      errors: []
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const questionId of questionIds) {
          try {
            switch (op) {
              case 'delete':
                await tx.question.update({
                  where: { id: questionId },
                  data: { isActive: false, lastModifiedById: userId }
                });
                break;

              case 'publish':
                await tx.question.update({
                  where: { id: questionId },
                  data: { 
                    isPublished: true, 
                    publishedAt: new Date(),
                    lastModifiedById: userId 
                  }
                });
                break;

              case 'unpublish':
                await tx.question.update({
                  where: { id: questionId },
                  data: { 
                    isPublished: false,
                    lastModifiedById: userId 
                  }
                });
                break;

              case 'assignCategory':
                if (data?.categoryIds?.length) {
                  // Remove existing categories
                  await tx.questionCategory.deleteMany({
                    where: { questionId }
                  });
                  
                  // Add new categories
                  await tx.questionCategory.createMany({
                    data: data.categoryIds.map(categoryId => ({
                      questionId,
                      categoryId
                    }))
                  });
                }
                break;

              case 'addTags':
                if (data?.tags?.length) {
                  const question = await tx.question.findUnique({
                    where: { id: questionId },
                    select: { tags: true }
                  });
                  
                  if (question) {
                    const newTags = [...new Set([...question.tags, ...data.tags])];
                    await tx.question.update({
                      where: { id: questionId },
                      data: { tags: newTags, lastModifiedById: userId }
                    });
                  }
                }
                break;

              case 'removeTags':
                if (data?.tags?.length) {
                  const question = await tx.question.findUnique({
                    where: { id: questionId },
                    select: { tags: true }
                  });
                  
                  if (question) {
                    const filteredTags = question.tags.filter(tag => !data.tags!.includes(tag));
                    await tx.question.update({
                      where: { id: questionId },
                      data: { tags: filteredTags, lastModifiedById: userId }
                    });
                  }
                }
                break;
            }

            // Create audit log
            await tx.questionAudit.create({
              data: {
                questionId,
                action: op as QuestionAuditAction,
                changes: data,
                userId
              }
            });

            results.processed++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              questionId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      });

      results.success = results.failed === 0;

      logger.info('Bulk operation completed', {
        operation: op,
        processed: results.processed,
        failed: results.failed,
        userId
      });

      return results;
    } catch (error) {
      logger.error('Bulk operation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operation: op,
        userId
      });
      throw error;
    }
  }

  // Import questions from data
  async importQuestions(importData: QuestionImportData, userId: string): Promise<BulkOperationResponse> {
    const results: BulkOperationResponse = {
      success: false,
      processed: 0,
      failed: 0,
      errors: []
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        // Create categories first if provided
        const categoryMap = new Map<string, number>();
        
        if (importData.categories?.length) {
          for (const categoryData of importData.categories) {
            try {
              const category = await tx.category.create({
                data: {
                  name: categoryData.name,
                  slug: categoryData.slug || categoryData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  description: categoryData.description,
                  icon: categoryData.icon,
                  color: categoryData.color,
                  parentId: categoryData.parentId,
                  sortOrder: categoryData.sortOrder || 0
                }
              });
              categoryMap.set(categoryData.name, category.id);
            } catch (error) {
              // Category might already exist, try to find it
              const existingCategory = await tx.category.findFirst({
                where: { name: categoryData.name }
              });
              if (existingCategory) {
                categoryMap.set(categoryData.name, existingCategory.id);
              }
            }
          }
        }

        // Import questions
        for (const questionData of importData.questions) {
          try {
            // Resolve category IDs from names
            const categoryIds: number[] = [];
            if (questionData.categoryNames?.length) {
              for (const categoryName of questionData.categoryNames) {
                const categoryId = categoryMap.get(categoryName);
                if (categoryId) {
                  categoryIds.push(categoryId);
                }
              }
            }

            // Create question
            const question = await tx.question.create({
              data: {
                questionText: questionData.questionText,
                questionType: questionData.questionType,
                options: questionData.options || null,
                correctAnswer: questionData.correctAnswer,
                explanation: questionData.explanation,
                hints: questionData.hints || undefined,
                difficultyLevel: questionData.difficultyLevel,
                estimatedTime: questionData.estimatedTime || 30,
                points: questionData.points,
                tags: questionData.tags,
                metadata: questionData.metadata || undefined,
                source: QuestionSource.IMPORTED,
                createdById: userId,
                isActive: true,
                isPublished: false
              }
            });

            // Create category relationships
            if (categoryIds.length > 0) {
              await tx.questionCategory.createMany({
                data: categoryIds.map(categoryId => ({
                  questionId: question.id,
                  categoryId
                }))
              });
            }

            results.processed++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              questionId: `Question ${results.processed + results.failed + 1}`,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      });

      results.success = results.failed === 0;

      logger.info('Question import completed', {
        processed: results.processed,
        failed: results.failed,
        userId
      });

      return results;
    } catch (error) {
      logger.error('Question import failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    }
  }

  // Export questions
  async exportQuestions(categoryIds?: number[], userId?: string): Promise<QuestionExportData> {
    try {
      const where: Prisma.QuestionWhereInput = {
        isActive: true,
        ...(categoryIds?.length && {
          categories: {
            some: {
              categoryId: { in: categoryIds }
            }
          }
        })
      };

      const [questions, categories] = await Promise.all([
        this.prisma.question.findMany({
          where,
          include: {
            categories: {
              include: {
                category: true
              }
            },
            createdBy: {
              select: {
                id: true,
                username: true
              }
            },
            lastModifiedBy: {
              select: {
                id: true,
                username: true
              }
            }
          }
        }),
        this.prisma.category.findMany({
          where: categoryIds?.length ? { id: { in: categoryIds } } : undefined
        })
      ]);

      return {
        questions: questions.map(q => this.formatQuestionResponse(q as QuestionWithRelations, true)),
        categories: categories.map(this.formatCategoryResponse),
        exportedAt: new Date(),
        exportedBy: userId || 'system'
      };
    } catch (error) {
      logger.error('Failed to export questions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryIds,
        userId
      });
      throw error;
    }
  }

  // Get question statistics
  async getQuestionStatistics(categoryIds?: number[]) {
    try {
      const where: Prisma.QuestionWhereInput = {
        isActive: true,
        ...(categoryIds?.length && {
          categories: {
            some: {
              categoryId: { in: categoryIds }
            }
          }
        })
      };

      const [
        totalQuestions,
        publishedQuestions,
        draftQuestions,
        difficultyStats,
        typeStats,
        tagStats
      ] = await Promise.all([
        this.prisma.question.count({ where }),
        this.prisma.question.count({ where: { ...where, isPublished: true } }),
        this.prisma.question.count({ where: { ...where, isPublished: false } }),
        this.prisma.question.groupBy({
          by: ['difficultyLevel'],
          where,
          _count: true
        }),
        this.prisma.question.groupBy({
          by: ['questionType'],
          where,
          _count: true
        }),
        this.prisma.$queryRaw<Array<{ tag: string; count: number }>>`
          SELECT unnest(tags) as tag, COUNT(*) as count
          FROM questions
          WHERE is_active = true
          ${categoryIds?.length ? Prisma.sql`AND id IN (
            SELECT question_id FROM question_categories 
            WHERE category_id IN (${Prisma.join(categoryIds)})
          )` : Prisma.empty}
          GROUP BY tag
          ORDER BY count DESC
          LIMIT 20
        `
      ]);

      return {
        totalQuestions,
        publishedQuestions,
        draftQuestions,
        difficultyDistribution: difficultyStats.map(d => ({
          level: d.difficultyLevel,
          count: d._count
        })),
        typeDistribution: typeStats.map(t => ({
          type: t.questionType,
          count: t._count
        })),
        popularTags: tagStats.map(t => ({
          tag: t.tag,
          count: Number(t.count)
        }))
      };
    } catch (error) {
      logger.error('Failed to get question statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryIds
      });
      throw error;
    }
  }

  // Private helper methods
  private formatQuestionResponse(question: QuestionWithRelations, includeCorrectAnswer: boolean = false): QuestionResponse {
    const usage = question.usage[0];
    
    return {
      id: question.id,
      questionText: question.questionText,
      questionType: question.questionType,
      options: question.options,
      ...(includeCorrectAnswer && { correctAnswer: question.correctAnswer }),
      explanation: question.explanation || undefined,
      hints: question.hints as string[] | undefined,
      difficultyLevel: question.difficultyLevel as DifficultyLevel,
      estimatedTime: question.estimatedTime || 30,
      points: question.points,
      tags: question.tags,
      metadata: question.metadata,
      version: question.version,
      source: question.source,
      isActive: question.isActive,
      isPublished: question.isPublished,
      publishedAt: question.publishedAt || undefined,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      categories: question.categories.map(qc => this.formatCategoryResponse(qc.category)),
      createdBy: {
        id: question.createdBy.id,
        username: question.createdBy.username
      },
      lastModifiedBy: question.lastModifiedBy ? {
        id: question.lastModifiedBy.id,
        username: question.lastModifiedBy.username
      } : undefined,
      usage: usage ? {
        timesUsed: usage.timesUsed,
        timesCorrect: usage.timesCorrect,
        successRate: usage.timesUsed > 0 ? (usage.timesCorrect / usage.timesUsed) * 100 : 0,
        averageTime: usage.averageTime || undefined,
        lastUsed: usage.lastUsed || undefined
      } : undefined
    };
  }

  private formatCategoryResponse(category: any): any {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      icon: category.icon,
      color: category.color,
      parentId: category.parentId,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    };
  }
}
