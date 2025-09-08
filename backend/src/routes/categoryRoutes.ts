import { Router } from 'express';
import { CategoryController } from '../controllers/categoryController';
import { authenticate } from '../middleware/auth';
import {
  requireAdmin,
  requireCategoryPermission,
  auditLog
} from '../middleware/adminAuth';
import { 
  createCategoryValidation,
  updateCategoryValidation,
  commonValidation
} from '../utils/questionValidation';

const router = Router();
const categoryController = new CategoryController();

// Public endpoint for categories (no auth required for basic category list)
/**
 * @route GET /categories/public
 * @description Get all active categories (public access)
 * @access Public
 */
router.get('/public', categoryController.getAllCategories.bind(categoryController));

// Apply authentication to all other category routes
router.use(authenticate);

// Public routes (accessible by all authenticated users)
/**
 * @route GET /categories
 * @description Get all categories
 * @access Authenticated users
 * @query includeInactive - Include inactive categories (admin only)
 */
router.get(
  '/',
  requireCategoryPermission('view'),
  categoryController.getAllCategories.bind(categoryController)
);

/**
 * @route GET /categories/tree
 * @description Get category tree structure
 * @access Authenticated users
 */
router.get(
  '/tree',
  requireCategoryPermission('view'),
  categoryController.getCategoryTree.bind(categoryController)
);

/**
 * @route GET /categories/root
 * @description Get root categories (categories without parents)
 * @access Authenticated users
 */
router.get(
  '/root',
  requireCategoryPermission('view'),
  categoryController.getRootCategories.bind(categoryController)
);

/**
 * @route GET /categories/search
 * @description Search categories
 * @access Authenticated users
 * @query search - Search term (required)
 * @query parentId - Optional parent category ID
 */
router.get(
  '/search',
  requireCategoryPermission('view'),
  categoryController.searchCategories.bind(categoryController)
);

/**
 * @route GET /categories/statistics
 * @description Get category statistics
 * @access Authenticated users
 */
router.get(
  '/statistics',
  requireCategoryPermission('view'),
  categoryController.getStatistics.bind(categoryController)
);

/**
 * @route GET /categories/:id
 * @description Get category by ID
 * @access Authenticated users
 * @query includeInactive - Include if category is inactive (admin only)
 */
router.get(
  '/:id',
  requireCategoryPermission('view'),
  categoryController.getCategoryById.bind(categoryController)
);

/**
 * @route GET /categories/slug/:slug
 * @description Get category by slug
 * @access Authenticated users
 */
router.get(
  '/slug/:slug',
  requireCategoryPermission('view'),
  categoryController.getCategoryBySlug.bind(categoryController)
);

// Admin routes (category management)
/**
 * @route POST /categories
 * @description Create a new category
 * @access Admin only
 */
router.post(
  '/',
  requireAdmin,
  requireCategoryPermission('create'),
  auditLog('category_create'),
  categoryController.createCategory.bind(categoryController)
);

/**
 * @route PUT /categories/:id
 * @description Update a category
 * @access Admin only
 */
router.put(
  '/:id',
  requireAdmin,
  requireCategoryPermission('update'),
  auditLog('category_update'),
  categoryController.updateCategory.bind(categoryController)
);

/**
 * @route DELETE /categories/:id
 * @description Delete a category (soft delete)
 * @access Admin only
 */
router.delete(
  '/:id',
  requireAdmin,
  requireCategoryPermission('delete'),
  auditLog('category_delete'),
  categoryController.deleteCategory.bind(categoryController)
);

/**
 * @route POST /categories/reorder
 * @description Reorder categories
 * @access Admin only
 * @body categoryOrders - Array of {id: number, sortOrder: number}
 */
router.post(
  '/reorder',
  requireAdmin,
  auditLog('category_reorder'),
  categoryController.reorderCategories.bind(categoryController)
);

export default router;
