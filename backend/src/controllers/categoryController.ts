import { Request, Response } from 'express';
import { CategoryService } from '../services/categoryService';
import { AuthenticatedRequest } from '../types/auth';
import { sendSuccessResponse, sendErrorResponse } from '../utils/response';
import { logger } from '../config/logger';
import {
  createCategoryValidation,
  updateCategoryValidation,
  commonValidation
} from '../utils/questionValidation';
import { CreateCategoryRequest, UpdateCategoryRequest } from '../types/question';

export class CategoryController {
  private categoryService: CategoryService;

  constructor() {
    this.categoryService = new CategoryService();
  }

  // Create a new category
  async createCategory(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate request body
      const { error, value } = createCategoryValidation.validate(req.body);
      if (error) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', error.details[0].message);
        return;
      }

      const categoryData: CreateCategoryRequest = value;
      const category = await this.categoryService.createCategory(categoryData);

      logger.info('Category created via API', {
        categoryId: category.id,
        name: category.name,
        slug: category.slug,
        createdBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 201, category, 'Category created successfully');
    } catch (error) {
      logger.error('Failed to create category via API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error) {
        sendErrorResponse(res, 400, 'CREATION_FAILED', error.message);
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create category');
      }
    }
  }

  // Get category by ID
  async getCategoryById(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.numericIdParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      const { id } = params;
      const includeInactive = req.query.includeInactive === 'true';

      const category = await this.categoryService.getCategoryById(id, includeInactive);

      sendSuccessResponse(res, 200, category);
    } catch (error) {
      logger.error('Failed to get category by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Category not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Category not found');
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve category');
      }
    }
  }

  // Get category by slug
  async getCategoryBySlug(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const slug = req.params.slug;

      if (!slug || typeof slug !== 'string') {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Valid slug is required');
        return;
      }

      const category = await this.categoryService.getCategoryBySlug(slug);

      sendSuccessResponse(res, 200, category);
    } catch (error) {
      logger.error('Failed to get category by slug', {
        error: error instanceof Error ? error.message : 'Unknown error',
        slug: req.params.slug,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Category not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Category not found');
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve category');
      }
    }
  }

  // Update category
  async updateCategory(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.numericIdParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      // Validate request body
      const { error, value } = updateCategoryValidation.validate(req.body);
      if (error) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', error.details[0].message);
        return;
      }

      const { id } = params;
      const updateData: UpdateCategoryRequest = value;

      const category = await this.categoryService.updateCategory(id, updateData);

      logger.info('Category updated via API', {
        categoryId: id,
        updatedBy: authReq.user!.username,
        changes: Object.keys(updateData),
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, category, 'Category updated successfully');
    } catch (error) {
      logger.error('Failed to update category via API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Category not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Category not found');
      } else if (error instanceof Error) {
        sendErrorResponse(res, 400, 'UPDATE_FAILED', error.message);
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update category');
      }
    }
  }

  // Delete category
  async deleteCategory(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      // Validate parameters
      const { error: paramError, value: params } = commonValidation.numericIdParams.validate(req.params);
      if (paramError) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', paramError.details[0].message);
        return;
      }

      const { id } = params;
      await this.categoryService.deleteCategory(id);

      logger.info('Category deleted via API', {
        categoryId: id,
        deletedBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, null, 'Category deleted successfully');
    } catch (error) {
      logger.error('Failed to delete category via API', {
        error: error instanceof Error ? error.message : 'Unknown error',
        categoryId: req.params.id,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      if (error instanceof Error && error.message === 'Category not found') {
        sendErrorResponse(res, 404, 'NOT_FOUND', 'Category not found');
      } else if (error instanceof Error) {
        sendErrorResponse(res, 400, 'DELETE_FAILED', error.message);
      } else {
        sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to delete category');
      }
    }
  }

  // Get all categories
  async getAllCategories(req: Request, res: Response): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const categories = await this.categoryService.getAllCategories(includeInactive);

      sendSuccessResponse(res, 200, categories);
    } catch (error) {
      logger.error('Failed to get all categories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve categories');
    }
  }

  // Get root categories
  async getRootCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await this.categoryService.getRootCategories();

      sendSuccessResponse(res, 200, categories);
    } catch (error) {
      logger.error('Failed to get root categories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve root categories');
    }
  }

  // Get category tree
  async getCategoryTree(req: Request, res: Response): Promise<void> {
    try {
      const tree = await this.categoryService.getCategoryTree();

      sendSuccessResponse(res, 200, tree);
    } catch (error) {
      logger.error('Failed to get category tree', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve category tree');
    }
  }

  // Search categories
  async searchCategories(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query.search as string;
      const parentId = req.query.parentId ? parseInt(req.query.parentId as string) : undefined;

      if (!search || typeof search !== 'string' || search.trim().length === 0) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Search query is required');
        return;
      }

      const categories = await this.categoryService.searchCategories(search, parentId);

      sendSuccessResponse(res, 200, categories);
    } catch (error) {
      logger.error('Failed to search categories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        search: req.query.search,
        parentId: req.query.parentId,
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to search categories');
    }
  }

  // Reorder categories
  async reorderCategories(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;

      // Validate request body
      const categoryOrders = req.body.categoryOrders;
      if (!Array.isArray(categoryOrders)) {
        sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'categoryOrders must be an array');
        return;
      }

      // Validate each category order item
      for (const item of categoryOrders) {
        if (typeof item.id !== 'number' || typeof item.sortOrder !== 'number') {
          sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Each item must have numeric id and sortOrder');
          return;
        }
      }

      await this.categoryService.reorderCategories(categoryOrders);

      logger.info('Categories reordered via API', {
        count: categoryOrders.length,
        reorderedBy: authReq.user!.username,
        correlationId: authReq.correlationId
      });

      sendSuccessResponse(res, 200, null, 'Categories reordered successfully');
    } catch (error) {
      logger.error('Failed to reorder categories', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to reorder categories');
    }
  }

  // Get category statistics
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const statistics = await this.categoryService.getCategoryStatistics();

      sendSuccessResponse(res, 200, statistics);
    } catch (error) {
      logger.error('Failed to get category statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (req as AuthenticatedRequest).user?.id,
        correlationId: (req as AuthenticatedRequest).correlationId
      });

      sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve statistics');
    }
  }
}
