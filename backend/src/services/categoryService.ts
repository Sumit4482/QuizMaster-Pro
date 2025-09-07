import { PrismaClient, Category, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CategoryResponse,
  CategoryWithRelations
} from '../types/question';
import { logger } from '../config/logger';

export class CategoryService {
  private readonly prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  // Create a new category
  async createCategory(data: CreateCategoryRequest): Promise<CategoryResponse> {
    try {
      // Generate slug if not provided
      const slug = data.slug || this.generateSlug(data.name);

      // Check if slug is unique
      const existingCategory = await this.prisma.category.findUnique({
        where: { slug }
      });

      if (existingCategory) {
        throw new Error('Category slug already exists');
      }

      // Validate parent category if provided
      if (data.parentId) {
        const parentCategory = await this.prisma.category.findUnique({
          where: { id: data.parentId, isActive: true }
        });

        if (!parentCategory) {
          throw new Error('Parent category not found or inactive');
        }
      }

      const category = await this.prisma.category.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          icon: data.icon,
          color: data.color,
          parentId: data.parentId,
          sortOrder: data.sortOrder || 0,
          isActive: true
        }
      });

      logger.info('Category created successfully', {
        categoryId: category.id,
        name: category.name,
        slug: category.slug
      });

      return this.formatCategoryResponse(category);
    } catch (error) {
      logger.error('Failed to create category', {
        error: error instanceof Error ? error.message : 'Unknown error',
        data
      });
      throw error;
    }
  }

  // Get category by ID
  async getCategoryById(id: number, includeInactive: boolean = false): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({
      where: { 
        id,
        ...(includeInactive ? {} : { isActive: true })
      },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' }
        },
        questionCategories: {
          where: {
            question: {
              isActive: true
            }
          }
        }
      }
    });

    if (!category) {
      throw new Error('Category not found');
    }

    return this.formatCategoryResponseWithRelations(category as CategoryWithRelations);
  }

  // Get category by slug
  async getCategoryBySlug(slug: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({
      where: { 
        slug,
        isActive: true
      },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' }
        },
        questionCategories: {
          where: {
            question: {
              isActive: true
            }
          }
        }
      }
    });

    if (!category) {
      throw new Error('Category not found');
    }

    return this.formatCategoryResponseWithRelations(category as CategoryWithRelations);
  }

  // Update category
  async updateCategory(id: number, data: UpdateCategoryRequest): Promise<CategoryResponse> {
    try {
      const existingCategory = await this.prisma.category.findUnique({
        where: { id }
      });

      if (!existingCategory) {
        throw new Error('Category not found');
      }

      // Check slug uniqueness if updating slug
      if (data.slug && data.slug !== existingCategory.slug) {
        const slugExists = await this.prisma.category.findUnique({
          where: { slug: data.slug }
        });

        if (slugExists) {
          throw new Error('Category slug already exists');
        }
      }

      // Validate parent category if updating parentId
      if (data.parentId !== undefined) {
        if (data.parentId === id) {
          throw new Error('Category cannot be its own parent');
        }

        if (data.parentId) {
          const parentCategory = await this.prisma.category.findUnique({
            where: { id: data.parentId, isActive: true }
          });

          if (!parentCategory) {
            throw new Error('Parent category not found or inactive');
          }

          // Check for circular reference
          const isCircular = await this.checkCircularReference(id, data.parentId);
          if (isCircular) {
            throw new Error('Circular parent-child relationship detected');
          }
        }
      }

      const updatedCategory = await this.prisma.category.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        }
      });

      logger.info('Category updated successfully', {
        categoryId: id,
        changes: Object.keys(data)
      });

      return this.formatCategoryResponse(updatedCategory);
    } catch (error) {
      logger.error('Failed to update category', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryId: id,
        data
      });
      throw error;
    }
  }

  // Delete category (soft delete)
  async deleteCategory(id: number): Promise<void> {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id },
        include: {
          children: true,
          questionCategories: {
            where: {
              question: {
                isActive: true
              }
            }
          }
        }
      });

      if (!category) {
        throw new Error('Category not found');
      }

      // Check if category has active child categories
      const activeChildren = category.children.filter(child => child.isActive);
      if (activeChildren.length > 0) {
        throw new Error('Cannot delete category with active child categories');
      }

      await this.prisma.$transaction(async (tx) => {
        // Soft delete the category
        await tx.category.update({
          where: { id },
          data: { isActive: false }
        });

        // Remove question-category relationships
        await tx.questionCategory.deleteMany({
          where: { categoryId: id }
        });
      });

      logger.info('Category deleted successfully', {
        categoryId: id,
        questionCount: category.questionCategories.length
      });
    } catch (error) {
      logger.error('Failed to delete category', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryId: id
      });
      throw error;
    }
  }

  // Get all categories (hierarchical)
  async getAllCategories(includeInactive: boolean = false): Promise<CategoryResponse[]> {
    try {
      const categories = await this.prisma.category.findMany({
        where: includeInactive ? {} : { isActive: true },
        include: {
          parent: true,
          children: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: { sortOrder: 'asc' }
          },
          questionCategories: {
            where: {
              question: {
                isActive: true
              }
            }
          }
        },
        orderBy: [
          { parentId: 'asc' },
          { sortOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      return categories.map(category => 
        this.formatCategoryResponseWithRelations(category as CategoryWithRelations)
      );
    } catch (error) {
      logger.error('Failed to get all categories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        includeInactive
      });
      throw error;
    }
  }

  // Get root categories (categories without parents)
  async getRootCategories(): Promise<CategoryResponse[]> {
    try {
      const categories = await this.prisma.category.findMany({
        where: {
          parentId: null,
          isActive: true
        },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              children: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' }
              },
              questionCategories: {
                where: {
                  question: {
                    isActive: true
                  }
                }
              }
            }
          },
          questionCategories: {
            where: {
              question: {
                isActive: true
              }
            }
          }
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      return categories.map(category => 
        this.formatCategoryResponseWithRelations(category as any)
      );
    } catch (error) {
      logger.error('Failed to get root categories', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Get category tree (hierarchical structure)
  async getCategoryTree(): Promise<CategoryResponse[]> {
    try {
      // Get all active categories
      const allCategories = await this.prisma.category.findMany({
        where: { isActive: true },
        include: {
          questionCategories: {
            where: {
              question: {
                isActive: true
              }
            }
          }
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      // Build tree structure
      const categoryMap = new Map<number, CategoryResponse>();
      const tree: CategoryResponse[] = [];

      // First pass: create all categories
      allCategories.forEach(category => {
        const formatted = this.formatCategoryResponse(category);
        formatted.questionCount = category.questionCategories.length;
        formatted.children = [];
        categoryMap.set(category.id, formatted);
      });

      // Second pass: build tree structure
      allCategories.forEach(category => {
        const formattedCategory = categoryMap.get(category.id)!;
        
        if (category.parentId) {
          const parent = categoryMap.get(category.parentId);
          if (parent) {
            parent.children = parent.children || [];
            parent.children.push(formattedCategory);
          }
        } else {
          tree.push(formattedCategory);
        }
      });

      return tree;
    } catch (error) {
      logger.error('Failed to get category tree', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Search categories
  async searchCategories(search: string, parentId?: number): Promise<CategoryResponse[]> {
    try {
      const where: Prisma.CategoryWhereInput = {
        isActive: true,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ],
        ...(parentId !== undefined && { parentId })
      };

      const categories = await this.prisma.category.findMany({
        where,
        include: {
          parent: true,
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
          },
          questionCategories: {
            where: {
              question: {
                isActive: true
              }
            }
          }
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      return categories.map(category => 
        this.formatCategoryResponseWithRelations(category as CategoryWithRelations)
      );
    } catch (error) {
      logger.error('Failed to search categories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        search,
        parentId
      });
      throw error;
    }
  }

  // Reorder categories
  async reorderCategories(categoryOrders: Array<{ id: number; sortOrder: number }>): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const { id, sortOrder } of categoryOrders) {
          await tx.category.update({
            where: { id },
            data: { sortOrder }
          });
        }
      });

      logger.info('Categories reordered successfully', {
        count: categoryOrders.length
      });
    } catch (error) {
      logger.error('Failed to reorder categories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryOrders
      });
      throw error;
    }
  }

  // Get category statistics
  async getCategoryStatistics() {
    try {
      const [
        totalCategories,
        activeCategories,
        rootCategories,
        categoriesWithQuestions,
        questionDistribution
      ] = await Promise.all([
        this.prisma.category.count(),
        this.prisma.category.count({ where: { isActive: true } }),
        this.prisma.category.count({ where: { parentId: null, isActive: true } }),
        this.prisma.category.count({
          where: {
            isActive: true,
            questionCategories: {
              some: {
                question: {
                  isActive: true
                }
              }
            }
          }
        }),
        this.prisma.category.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                questionCategories: {
                  where: {
                    question: {
                      isActive: true
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            questionCategories: {
              _count: 'desc'
            }
          },
          take: 10
        })
      ]);

      // Calculate total questions across all active categories
      const totalQuestions = questionDistribution.reduce(
        (sum, cat) => sum + cat._count.questionCategories, 
        0
      );
      
      // Calculate average questions per category (handle division by zero)
      const averageQuestionsPerCategory = activeCategories > 0 
        ? totalQuestions / activeCategories 
        : 0;

      return {
        totalCategories,
        activeCategories,
        inactiveCategories: totalCategories - activeCategories,
        rootCategories,
        categoriesWithQuestions,
        emptyCategories: activeCategories - categoriesWithQuestions,
        averageQuestionsPerCategory,
        topCategories: questionDistribution.map(cat => ({
          id: cat.id,
          name: cat.name,
          questionCount: cat._count.questionCategories
        }))
      };
    } catch (error) {
      logger.error('Failed to get category statistics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Private helper methods
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async checkCircularReference(categoryId: number, parentId: number): Promise<boolean> {
    let currentParentId: number | undefined = parentId;
    
    while (currentParentId) {
      if (currentParentId === categoryId) {
        return true;
      }
      
      const parent = await this.prisma.category.findUnique({
        where: { id: currentParentId },
        select: { parentId: true }
      });
      
      if (!parent) {
        break;
      }
      
      currentParentId = parent.parentId || undefined;
    }
    
    return false;
  }

  private formatCategoryResponse(category: Category): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || undefined,
      icon: category.icon || undefined,
      color: category.color || undefined,
      parentId: category.parentId || undefined,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    };
  }

  private formatCategoryResponseWithRelations(category: CategoryWithRelations): CategoryResponse {
    return {
      ...this.formatCategoryResponse(category),
      parent: category.parent ? this.formatCategoryResponse(category.parent) : undefined,
      children: category.children?.map(child => this.formatCategoryResponse(child)),
      questionCount: category.questionCategories?.length || 0
    };
  }
}
