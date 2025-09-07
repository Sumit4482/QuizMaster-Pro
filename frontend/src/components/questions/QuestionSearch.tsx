'use client';

import React, { useState, useEffect } from 'react';
import {
  QuestionSearchParams,
  CategoryResponse,
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  SORT_OPTIONS,
  DifficultyLevel,
  QuestionType,
} from '@/types/question';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { questionUtils } from '@/utils/questionApi';

interface QuestionSearchProps {
  initialParams?: Partial<QuestionSearchParams>;
  categories: CategoryResponse[];
  onSearch: (params: QuestionSearchParams) => void;
  isLoading?: boolean;
  showAdvanced?: boolean;
}

export function QuestionSearch({
  initialParams = {},
  categories,
  onSearch,
  isLoading = false,
  showAdvanced = false,
}: QuestionSearchProps) {
  const [searchParams, setSearchParams] = useState<QuestionSearchParams>({
    search: '',
    categoryIds: [],
    difficultyLevel: [],
    tags: [],
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    limit: 20,
    ...initialParams,
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(showAdvanced);
  const [tagInput, setTagInput] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [userInitiatedChange, setUserInitiatedChange] = useState(false);

  // Update search params when initial params change
  useEffect(() => {
    setSearchParams(prev => ({ ...prev, ...initialParams }));
    setIsInitialized(true);
    setUserInitiatedChange(false); // This is not a user change
  }, [initialParams]);

  // Debounced search effect - only run when user actively changes search params
  useEffect(() => {
    if (!isInitialized || !userInitiatedChange) return;
    
    const timeoutId = setTimeout(() => {
      onSearch(searchParams);
      setUserInitiatedChange(false); // Reset after search
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchParams, onSearch, isInitialized, userInitiatedChange]);

  const handleSearchChange = (value: string) => {
    setSearchParams(prev => ({ ...prev, search: value, page: 1 }));
    setUserInitiatedChange(true);
  };

  const handleCategoryChange = (categoryId: number, checked: boolean) => {
    setSearchParams(prev => ({
      ...prev,
      categoryIds: checked
        ? [...(prev.categoryIds || []), categoryId]
        : (prev.categoryIds || []).filter(id => id !== categoryId),
      page: 1,
    }));
    setUserInitiatedChange(true);
  };

  const handleDifficultyChange = (level: DifficultyLevel, checked: boolean) => {
    setSearchParams(prev => ({
      ...prev,
      difficultyLevel: checked
        ? [...(prev.difficultyLevel || []), level]
        : (prev.difficultyLevel || []).filter(l => l !== level),
      page: 1,
    }));
    setUserInitiatedChange(true);
  };

  const handleQuestionTypeChange = (type: QuestionType | undefined) => {
    setSearchParams(prev => ({ 
      ...prev, 
      page: 1,
      ...(type ? { questionType: type } : {}),
    }));
    setUserInitiatedChange(true);
  };

  const handlePublishedChange = (value: string) => {
    const isPublished = value === 'all' ? undefined : value === 'published';
    setSearchParams(prev => ({ 
      ...prev, 
      page: 1,
      ...(isPublished !== undefined ? { isPublished } : {}),
    }));
    setUserInitiatedChange(true);
  };

  const handleSortChange = (sortBy: 'createdAt' | 'updatedAt' | 'questionText' | 'difficultyLevel' | 'points') => {
    setSearchParams(prev => ({ ...prev, sortBy, page: 1 }));
    setUserInitiatedChange(true);
  };

  const handleSortOrderChange = () => {
    setSearchParams(prev => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
    setUserInitiatedChange(true);
  };

  const handleTagsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tagInput.trim()) {
      const newTags = questionUtils.parseTags(tagInput);
      setSearchParams(prev => ({
        ...prev,
        tags: [...new Set([...(prev.tags || []), ...newTags])],
        page: 1,
      }));
      setTagInput('');
      setUserInitiatedChange(true);
    }
  };

  const removeTag = (tagToRemove: string) => {
    setSearchParams(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(tag => tag !== tagToRemove),
      page: 1,
    }));
    setUserInitiatedChange(true);
  };

  const clearFilters = () => {
    setSearchParams({
      search: '',
      categoryIds: [],
      difficultyLevel: [],
      tags: [],
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 1,
      limit: 20,
    });
    setTagInput('');
    setUserInitiatedChange(true);
  };

  const hasActiveFilters = () => {
    return (
      searchParams.search ||
      (searchParams.categoryIds && searchParams.categoryIds.length > 0) ||
      searchParams.questionType ||
      (searchParams.difficultyLevel && searchParams.difficultyLevel.length > 0) ||
      (searchParams.tags && searchParams.tags.length > 0) ||
      searchParams.isPublished !== undefined
    );
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Search Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-secondary-400">🔍</span>
            </div>
            <Input
              type="text"
              placeholder="Search questions..."
              value={searchParams.search || ''}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Status:
              </span>
              <select
                value={
                  searchParams.isPublished === undefined
                    ? 'all'
                    : searchParams.isPublished
                    ? 'published'
                    : 'draft'
                }
                onChange={(e) => handlePublishedChange(e.target.value)}
                className="text-sm border border-secondary-300 dark:border-secondary-600 rounded px-2 py-1 dark:bg-secondary-800"
              >
                <option value="all">All</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Type:
              </span>
              <select
                value={searchParams.questionType || ''}
                onChange={(e) =>
                  handleQuestionTypeChange(e.target.value as QuestionType | undefined)
                }
                className="text-sm border border-secondary-300 dark:border-secondary-600 rounded px-2 py-1 dark:bg-secondary-800"
              >
                <option value="">All Types</option>
                {QUESTION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Sort:
              </span>
              <select
                value={searchParams.sortBy || 'createdAt'}
                onChange={(e) => handleSortChange(e.target.value as 'createdAt' | 'updatedAt' | 'questionText' | 'difficultyLevel' | 'points')}
                className="text-sm border border-secondary-300 dark:border-secondary-600 rounded px-2 py-1 dark:bg-secondary-800"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSortOrderChange}
                className="text-sm px-2 py-1 border border-secondary-300 dark:border-secondary-600 rounded hover:bg-secondary-50 dark:hover:bg-secondary-800"
              >
                {searchParams.sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              {showAdvancedFilters ? 'Hide' : 'Show'} Filters
            </Button>

            {hasActiveFilters() && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
              >
                Clear All
              </Button>
            )}
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="space-y-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
              {/* Categories */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Categories
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-32 overflow-y-auto border border-secondary-300 dark:border-secondary-600 rounded p-3">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className="flex items-center space-x-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={(searchParams.categoryIds || []).includes(category.id)}
                        onChange={(e) => handleCategoryChange(category.id, e.target.checked)}
                        className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="truncate" title={category.name}>
                        {category.icon} {category.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Difficulty Levels */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Difficulty Levels
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTY_LEVELS.map((level) => (
                    <label
                      key={level.value}
                      className="flex items-center space-x-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={(searchParams.difficultyLevel || []).includes(level.value)}
                        onChange={(e) => handleDifficultyChange(level.value, e.target.checked)}
                        className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className={`px-2 py-1 rounded-full bg-${level.color}-100 text-${level.color}-800 dark:bg-${level.color}-900/30 dark:text-${level.color}-300`}>
                        {level.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Tags
                </label>
                <form onSubmit={handleTagsSubmit} className="flex gap-2 mb-2">
                  <Input
                    type="text"
                    placeholder="Add tags..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" size="sm" disabled={!tagInput.trim()}>
                    Add
                  </Button>
                </form>
                {searchParams.tags && searchParams.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {searchParams.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-1 text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Summary */}
          {hasActiveFilters() && (
            <div className="text-sm text-secondary-600 dark:text-secondary-400">
              <span>Active filters: </span>
              {searchParams.search && <span className="font-medium">"{searchParams.search}" </span>}
              {searchParams.categoryIds && searchParams.categoryIds.length > 0 && (
                <span className="font-medium">{searchParams.categoryIds.length} categories </span>
              )}
              {searchParams.questionType && (
                <span className="font-medium">{searchParams.questionType} </span>
              )}
              {searchParams.difficultyLevel && searchParams.difficultyLevel.length > 0 && (
                <span className="font-medium">{searchParams.difficultyLevel.length} difficulties </span>
              )}
              {searchParams.tags && searchParams.tags.length > 0 && (
                <span className="font-medium">{searchParams.tags.length} tags </span>
              )}
              {searchParams.isPublished !== undefined && (
                <span className="font-medium">
                  {searchParams.isPublished ? 'published' : 'draft'} only
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
