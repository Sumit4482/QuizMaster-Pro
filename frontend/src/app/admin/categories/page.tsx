'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, useRequireRole } from '@/hooks/useAuth';
import {
  CategoryResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CategoryStatistics,
} from '@/types/question';
import { categoryApi } from '@/utils/questionApi';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingPage } from '@/components/ui/Loading';
import { CategoryForm } from '@/components/categories/CategoryForm';
import toast from 'react-hot-toast';

type PageMode = 'browse' | 'create' | 'edit';

export default function AdminCategoriesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAuthenticated, isInitialized } = useRequireRole(['ADMIN']);

  // State - ALL hooks must be called before any early returns
  const [pageMode, setPageMode] = useState<PageMode>('browse');
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryResponse | null>(null);
  const [statistics, setStatistics] = useState<CategoryStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState(false);

  // Functions - Define before early returns
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [categoriesResponse, statisticsResponse] = await Promise.all([
        categoryApi.getAll(true), // Include inactive categories for admin
        categoryApi.getStatistics(),
      ]);
      
      setCategories(categoriesResponse);
      setStatistics(statisticsResponse);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  // Category operations
  const handleCreateCategory = async (data: CreateCategoryRequest | UpdateCategoryRequest) => {
    try {
      setOperationLoading(true);
      await categoryApi.create(data as CreateCategoryRequest);
      toast.success('Category created successfully');
      setPageMode('browse');
      loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to create category:', error);
      toast.error('Failed to create category');
      throw error;
    } finally {
      setOperationLoading(false);
    }
  };

  const handleUpdateCategory = async (data: CreateCategoryRequest | UpdateCategoryRequest) => {
    if (!selectedCategory) return;
    
    try {
      setOperationLoading(true);
      await categoryApi.update(selectedCategory.id, data as UpdateCategoryRequest);
      toast.success('Category updated successfully');
      setPageMode('browse');
      setSelectedCategory(null);
      loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to update category:', error);
      toast.error('Failed to update category');
      throw error;
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!window.confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
      return;
    }

    try {
      setOperationLoading(true);
      await categoryApi.delete(categoryId);
      toast.success('Category deleted successfully');
      loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast.error('Failed to delete category');
    } finally {
      setOperationLoading(false);
    }
  };

  // Navigation handlers
  const handleEditCategory = (category: CategoryResponse) => {
    setSelectedCategory(category);
    setPageMode('edit');
  };

  // Effects - ALL must be called before early returns  
  useEffect(() => {
    if (isAuthenticated && user && user.role === 'ADMIN') {
      loadData();
    }
  }, [isAuthenticated, user, loadData]);

  // Show loading while checking authentication
  if (!isInitialized || authLoading || !isAuthenticated) {
    return <LoadingPage message="Loading admin panel..." />;
  }

  // Check if user has admin role
  if (user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-4">
              Access Denied
            </h2>
            <p className="text-secondary-600 dark:text-secondary-400 mb-6">
              You need admin privileges to manage categories.
            </p>
            <Button onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render category tree
  const renderCategoryTree = (parentCategories: CategoryResponse[], level = 0) => {
    const rootCategories = parentCategories.filter(cat => !cat.parentId);
    const childCategories = parentCategories.filter(cat => cat.parentId);

    const getCategoryChildren = (parentId: number) => {
      return childCategories.filter(cat => cat.parentId === parentId);
    };

    const renderCategory = (category: CategoryResponse, depth: number) => (
      <div key={category.id} className={`ml-${depth * 6}`}>
        <Card className="mb-3 hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">{category.icon || '📁'}</span>
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color || '#0ea5e9' }}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-secondary-900 dark:text-white">
                    {category.name}
                  </h3>
                  <p className="text-sm text-secondary-600 dark:text-secondary-400">
                    {category.description || 'No description'}
                  </p>
                  <div className="flex items-center space-x-4 mt-2 text-xs text-secondary-500">
                    <span>Slug: {category.slug}</span>
                    <span>Order: {category.sortOrder}</span>
                    {!category.isActive && (
                      <span className="px-2 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditCategory(category)}
                  disabled={operationLoading}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteCategory(category.id)}
                  disabled={operationLoading}
                  className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Render children */}
        {getCategoryChildren(category.id).map(child => 
          renderCategory(child, depth + 1)
        )}
      </div>
    );

    return (
      <div className="space-y-3">
        {rootCategories
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(category => renderCategory(category, level))}
      </div>
    );
  };

  if (loading) {
    return <LoadingPage message="Loading categories..." />;
  }

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950">
      {/* Header */}
      <div className="bg-white dark:bg-secondary-900 border-b border-secondary-200 dark:border-secondary-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
                Category Management
              </h1>
              <span className="text-sm text-secondary-600 dark:text-secondary-400">
                {categories.length} categories
              </span>
            </div>
            <div className="flex items-center space-x-4">
              {pageMode === 'browse' && (
                <Button onClick={() => setPageMode('create')}>
                  Create Category
                </Button>
              )}
              {pageMode !== 'browse' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPageMode('browse');
                    setSelectedCategory(null);
                  }}
                >
                  Back to Categories
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {pageMode === 'browse' && (
          <div className="space-y-6">
            {/* Statistics */}
            {statistics && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-secondary-900 dark:text-white">
                      {statistics.totalCategories}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Total Categories
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {statistics.activeCategories}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Active
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {statistics.categoriesWithQuestions}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      With Questions
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-primary-600">
                      {isNaN(statistics.averageQuestionsPerCategory) || !isFinite(statistics.averageQuestionsPerCategory)
                        ? '0' 
                        : Math.round(statistics.averageQuestionsPerCategory)}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Avg Questions
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Categories */}
            <div>
              <Card>
                <CardHeader>
                  <h2 className="text-xl font-semibold text-secondary-900 dark:text-white">
                    Category Hierarchy
                  </h2>
                </CardHeader>
                <CardContent>
                  {categories.length > 0 ? (
                    renderCategoryTree(categories)
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-6xl mb-4">📂</div>
                      <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-2">
                        No Categories Yet
                      </h3>
                      <p className="text-secondary-600 dark:text-secondary-400 mb-6">
                        Create your first category to organize your questions.
                      </p>
                      <Button onClick={() => setPageMode('create')}>
                        Create Category
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {pageMode === 'create' && (
          <CategoryForm
            categories={categories}
            onSubmit={handleCreateCategory}
            onCancel={() => setPageMode('browse')}
            isLoading={operationLoading}
          />
        )}

        {pageMode === 'edit' && selectedCategory && (
          <CategoryForm
            category={selectedCategory}
            categories={categories}
            onSubmit={handleUpdateCategory}
            onCancel={() => {
              setPageMode('browse');
              setSelectedCategory(null);
            }}
            isLoading={operationLoading}
          />
        )}
      </div>
    </div>
  );
}
