'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  CategoryFormData,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CategoryResponse,
  DEFAULT_CATEGORY_FORM,
} from '@/types/question';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { questionUtils } from '@/utils/questionApi';

interface CategoryFormProps {
  category?: CategoryResponse;
  categories: CategoryResponse[];
  onSubmit: (data: CreateCategoryRequest | UpdateCategoryRequest) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const CATEGORY_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
];

const CATEGORY_ICONS = [
  '📚', '🔬', '🏛️', '🌍', '⚽', '🎬', '💻', '🎵', '🎨', '🏥',
  '⚖️', '🚗', '🍳', '🏠', '💼', '📈', '🔧', '🎯', '🌱', '🎪'
];

export function CategoryForm({
  category,
  categories,
  onSubmit,
  onCancel,
  isLoading = false,
}: CategoryFormProps) {
  const isEditing = !!category;

  // Get default values
  const getDefaultValues = (): CategoryFormData => {
    if (category) {
      return {
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        icon: category.icon || '',
        color: category.color || '#0ea5e9',
        sortOrder: category.sortOrder,
        ...(category.parentId && { parentId: category.parentId }),
      };
    }
    return DEFAULT_CATEGORY_FORM;
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
    reset,
  } = useForm<CategoryFormData>({
    defaultValues: getDefaultValues(),
  });

  const watchedValues = watch();

  // Reset form when category changes
  useEffect(() => {
    reset(getDefaultValues());
  }, [category, reset]);

  // Auto-generate slug from name
  useEffect(() => {
    if (watchedValues.name && !isEditing) {
      const slug = questionUtils.generateSlug(watchedValues.name);
      setValue('slug', slug);
    }
  }, [watchedValues.name, isEditing, setValue]);

  // Handle form submission
  const onFormSubmit = async (data: CategoryFormData) => {
    try {
      const requestData: CreateCategoryRequest = {
        name: data.name,
        slug: data.slug,
        sortOrder: data.sortOrder,
        ...(data.color && { color: data.color }),
        ...(data.description && { description: data.description }),
        ...(data.icon && { icon: data.icon }),
        ...(data.parentId && { parentId: data.parentId }),
      };

      await onSubmit(requestData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  // Get available parent categories (excluding current category if editing)
  const getAvailableParents = () => {
    if (isEditing) {
      return categories.filter(c => c.id !== category!.id);
    }
    return categories;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
            {isEditing ? 'Edit Category' : 'Create New Category'}
          </h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              {/* Category Name */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Category Name *
                </label>
                <Input
                  {...register('name', { 
                    required: 'Category name is required',
                    minLength: { value: 2, message: 'Name must be at least 2 characters' },
                    maxLength: { value: 100, message: 'Name must be less than 100 characters' }
                  })}
                  placeholder="Enter category name..."
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  URL Slug *
                </label>
                <Input
                  {...register('slug', { 
                    required: 'Slug is required',
                    pattern: {
                      value: /^[a-z0-9-]+$/,
                      message: 'Slug can only contain lowercase letters, numbers, and hyphens'
                    }
                  })}
                  placeholder="category-slug"
                />
                {errors.slug && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors.slug.message}
                  </p>
                )}
                <p className="mt-1 text-xs text-secondary-500">
                  Used in URLs. Will be auto-generated if left empty.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-secondary-800"
                  placeholder="Describe what this category contains..."
                />
              </div>
            </div>

            {/* Visual Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                Visual Settings
              </h3>

              {/* Icon Selection */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Icon
                </label>
                <div className="grid grid-cols-10 gap-2 p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg">
                  {CATEGORY_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setValue('icon', icon)}
                      className={`p-2 text-xl text-center rounded hover:bg-secondary-100 dark:hover:bg-secondary-700 ${
                        watchedValues.icon === icon 
                          ? 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500' 
                          : ''
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <Input
                  {...register('icon')}
                  placeholder="Or enter custom emoji/icon"
                  className="mt-2"
                />
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Color
                </label>
                <div className="flex items-center space-x-3">
                  <div className="grid grid-cols-5 gap-2">
                    {CATEGORY_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setValue('color', color)}
                        className={`w-8 h-8 rounded-full border-2 ${
                          watchedValues.color === color 
                            ? 'border-secondary-900 dark:border-white' 
                            : 'border-secondary-300 dark:border-secondary-600'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <Input
                    {...register('color')}
                    type="color"
                    className="w-16 h-8 p-1 border-0"
                  />
                </div>
              </div>
            </div>

            {/* Organization Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                Organization
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Parent Category */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Parent Category (Optional)
                  </label>
                  <select
                    {...register('parentId')}
                    className="w-full p-2 border border-secondary-300 dark:border-secondary-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-secondary-800"
                  >
                    <option value="">None (Root Category)</option>
                    {getAvailableParents().map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                    Sort Order
                  </label>
                  <Input
                    type="number"
                    min="0"
                    {...register('sortOrder', { 
                      min: { value: 0, message: 'Sort order cannot be negative' }
                    })}
                    placeholder="0"
                  />
                  {errors.sortOrder && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {errors.sortOrder.message}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-secondary-500">
                    Lower numbers appear first
                  </p>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                Preview
              </h3>
              <div className="p-4 border border-secondary-300 dark:border-secondary-600 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{watchedValues.icon || '📁'}</span>
                  <div className="flex-1">
                    <h4 className="font-semibold text-secondary-900 dark:text-white">
                      {watchedValues.name || 'Category Name'}
                    </h4>
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">
                      {watchedValues.description || 'No description provided'}
                    </p>
                  </div>
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: watchedValues.color }}
                  />
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end space-x-4 pt-6 border-t border-secondary-200 dark:border-secondary-700">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={isLoading || !isDirty}
              >
                {isLoading 
                  ? 'Saving...' 
                  : isEditing 
                    ? 'Update Category' 
                    : 'Create Category'
                }
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
