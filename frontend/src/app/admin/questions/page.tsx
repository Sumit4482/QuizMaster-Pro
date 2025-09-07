'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, useRequireRole } from '@/hooks/useAuth';
import {
  Question,
  QuestionSearchParams,
  QuestionSearchResponse,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  CategoryResponse,
  BulkQuestionOperation,
  QuestionStatistics,
} from '@/types/question';
import { questionApi, categoryApi } from '@/utils/questionApi';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingPage } from '@/components/ui/Loading';
import { QuestionList } from '@/components/questions/QuestionList';
import { QuestionSearch } from '@/components/questions/QuestionSearch';
import { QuestionForm } from '@/components/questions/QuestionForm';
import { QuestionDisplay } from '@/components/questions/QuestionDisplay';
import toast from 'react-hot-toast';

type ViewMode = 'list' | 'grid' | 'compact';
type PageMode = 'browse' | 'create' | 'edit' | 'view';

export default function AdminQuestionsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAuthenticated, isInitialized } = useRequireRole(['ADMIN', 'HOST']);

  // State - ALL hooks must be called before any early returns
  const [pageMode, setPageMode] = useState<PageMode>('browse');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [searchResponse, setSearchResponse] = useState<QuestionSearchResponse | null>(null);
  const [statistics, setStatistics] = useState<QuestionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState(false);
  const [searchParams, setSearchParams] = useState<QuestionSearchParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  // Track if initial data has been loaded to prevent infinite loops
  const hasLoadedInitialData = useRef(false);

  // Load initial data - Define functions before early returns
  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [categoriesResponse, statisticsResponse] = await Promise.all([
        categoryApi.getAll(),
        questionApi.getStatistics(),
      ]);
      
      setCategories(categoriesResponse);
      setStatistics(statisticsResponse);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Search questions
  const handleSearch = useCallback(async (params: QuestionSearchParams) => {
    try {
      setLoading(true);
      setSearchParams(params);
      const response = await questionApi.search(params);
      setQuestions(response.questions);
      setSearchResponse(response);
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Failed to search questions');
      setQuestions([]);
      setSearchResponse(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Effects - ALL must be called before early returns
  // Initial load - only run once when user is authenticated and authorized
  useEffect(() => {
    if (
      isAuthenticated && 
      user && 
      (user.role === 'ADMIN' || user.role === 'HOST') && 
      !hasLoadedInitialData.current
    ) {
      hasLoadedInitialData.current = true;
      loadInitialData();
      handleSearch(searchParams);
    }
  }, [isAuthenticated, user?.id, user?.role]); // Only depend on user id and role, not the whole user object

  // Show loading while checking authentication
  if (!isInitialized || authLoading || !isAuthenticated) {
    return <LoadingPage message="Loading admin panel..." />;
  }

  // Check if user has admin or host role
  if (user?.role !== 'ADMIN' && user?.role !== 'HOST') {
    return (
      <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950 flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-4">
              Access Denied
            </h2>
            <p className="text-secondary-600 dark:text-secondary-400 mb-6">
              You need admin or host privileges to access question management.
            </p>
            <Button onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Question operations  
  const handleCreateQuestion = async (data: CreateQuestionRequest | UpdateQuestionRequest) => {
    try {
      setOperationLoading(true);
      const newQuestion = await questionApi.create(data as CreateQuestionRequest);
      toast.success('Question created successfully');
      setPageMode('browse');
      handleSearch(searchParams); // Refresh list
      
      // Update statistics
      const newStats = await questionApi.getStatistics();
      setStatistics(newStats);
    } catch (error) {
      console.error('Failed to create question:', error);
      toast.error('Failed to create question');
      throw error;
    } finally {
      setOperationLoading(false);
    }
  };

  const handleUpdateQuestion = async (data: CreateQuestionRequest | UpdateQuestionRequest) => {
    if (!selectedQuestion) return;
    
    try {
      setOperationLoading(true);
      const updatedQuestion = await questionApi.update(selectedQuestion.id, data as UpdateQuestionRequest);
      toast.success('Question updated successfully');
      setPageMode('browse');
      setSelectedQuestion(null);
      handleSearch(searchParams); // Refresh list
    } catch (error) {
      console.error('Failed to update question:', error);
      toast.error('Failed to update question');
      throw error;
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      setOperationLoading(true);
      await questionApi.delete(questionId);
      toast.success('Question deleted successfully');
      handleSearch(searchParams); // Refresh list
      
      // Update statistics
      const newStats = await questionApi.getStatistics();
      setStatistics(newStats);
    } catch (error) {
      console.error('Failed to delete question:', error);
      toast.error('Failed to delete question');
    } finally {
      setOperationLoading(false);
    }
  };

  const handlePublishQuestion = async (questionId: string) => {
    try {
      setOperationLoading(true);
      await questionApi.publish(questionId);
      toast.success('Question published successfully');
      handleSearch(searchParams); // Refresh list
    } catch (error) {
      console.error('Failed to publish question:', error);
      toast.error('Failed to publish question');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleUnpublishQuestion = async (questionId: string) => {
    try {
      setOperationLoading(true);
      await questionApi.unpublish(questionId);
      toast.success('Question unpublished successfully');
      handleSearch(searchParams); // Refresh list
    } catch (error) {
      console.error('Failed to unpublish question:', error);
      toast.error('Failed to unpublish question');
    } finally {
      setOperationLoading(false);
    }
  };

  // Bulk operations
  const handleBulkOperation = async (operation: string) => {
    if (selectedQuestions.length === 0) {
      toast.error('No questions selected');
      return;
    }

    const confirmMessage = `Are you sure you want to ${operation} ${selectedQuestions.length} question(s)?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      setOperationLoading(true);
      const bulkOperation: BulkQuestionOperation = {
        operation: operation as any,
        questionIds: selectedQuestions,
      };
      
      const result = await questionApi.bulkOperation(bulkOperation);
      
      if (result.success) {
        toast.success(`Bulk ${operation} completed successfully`);
      } else {
        toast.error(`Bulk ${operation} completed with ${result.failed} errors`);
      }
      
      setSelectedQuestions([]);
      handleSearch(searchParams); // Refresh list
      
      // Update statistics
      const newStats = await questionApi.getStatistics();
      setStatistics(newStats);
    } catch (error) {
      console.error(`Bulk ${operation} failed:`, error);
      toast.error(`Failed to ${operation} questions`);
    } finally {
      setOperationLoading(false);
    }
  };

  // Selection handlers
  const handleQuestionSelect = (questionId: string, selected: boolean) => {
    setSelectedQuestions(prev => 
      selected 
        ? [...prev, questionId]
        : prev.filter(id => id !== questionId)
    );
  };

  const handleSelectAll = () => {
    setSelectedQuestions(
      selectedQuestions.length === questions.length 
        ? [] 
        : questions.map(q => q.id)
    );
  };

  // Navigation handlers
  const handleEditQuestion = (question: Question) => {
    setSelectedQuestion(question);
    setPageMode('edit');
  };

  const handleViewQuestion = (question: Question) => {
    setSelectedQuestion(question);
    setPageMode('view');
  };

  // Pagination
  const handlePageChange = (page: number) => {
    handleSearch({ ...searchParams, page });
  };

  if (loading && questions.length === 0) {
    return <LoadingPage message="Loading questions..." />;
  }

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950">
      {/* Header */}
      <div className="bg-white dark:bg-secondary-900 border-b border-secondary-200 dark:border-secondary-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
                Question Management
              </h1>
              {searchResponse && (
                <span className="text-sm text-secondary-600 dark:text-secondary-400">
                  {searchResponse.total} questions found
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {pageMode === 'browse' && (
                <>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary-100 text-primary-700' : 'text-secondary-600 hover:text-secondary-900'}`}
                    >
                      ⊞
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary-100 text-primary-700' : 'text-secondary-600 hover:text-secondary-900'}`}
                    >
                      ☰
                    </button>
                    <button
                      onClick={() => setViewMode('compact')}
                      className={`p-2 rounded ${viewMode === 'compact' ? 'bg-primary-100 text-primary-700' : 'text-secondary-600 hover:text-secondary-900'}`}
                    >
                      ▦
                    </button>
                  </div>
                  <Button onClick={() => setPageMode('create')}>
                    Create Question
                  </Button>
                </>
              )}
              {pageMode !== 'browse' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPageMode('browse');
                    setSelectedQuestion(null);
                  }}
                >
                  Back to Questions
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
                      {statistics.totalQuestions}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Total Questions
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {statistics.publishedQuestions}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Published
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-yellow-600">
                      {statistics.draftQuestions}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Drafts
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-primary-600">
                      {categories.length}
                    </div>
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Categories
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Search */}
            <QuestionSearch
              initialParams={searchParams}
              categories={categories}
              onSearch={handleSearch}
              isLoading={loading}
              showAdvanced={true}
              key="question-search" // Prevent re-mounting
            />

            {/* Bulk Actions */}
            {selectedQuestions.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                      {selectedQuestions.length} question(s) selected
                    </span>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkOperation('publish')}
                        disabled={operationLoading}
                      >
                        Publish
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkOperation('unpublish')}
                        disabled={operationLoading}
                      >
                        Unpublish
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkOperation('delete')}
                        disabled={operationLoading}
                        className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                      >
                        Delete
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedQuestions([])}
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Select All */}
            {questions.length > 0 && (
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedQuestions.length === questions.length && questions.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-secondary-700 dark:text-secondary-300">
                    Select All
                  </span>
                </label>
              </div>
            )}

            {/* Question List */}
            <QuestionList
              questions={questions}
              loading={loading}
              selectedQuestions={selectedQuestions}
              onQuestionSelect={handleQuestionSelect}
              onQuestionEdit={handleEditQuestion}
              onQuestionDelete={handleDeleteQuestion}
              onQuestionPublish={handlePublishQuestion}
              onQuestionUnpublish={handleUnpublishQuestion}
              onQuestionView={handleViewQuestion}
              viewMode={viewMode}
              showActions={true}
              showSelection={true}
              emptyMessage="No questions match your search criteria"
            />

            {/* Pagination */}
            {searchResponse && searchResponse.totalPages > 1 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-secondary-600 dark:text-secondary-400">
                      Showing {((searchResponse.page - 1) * searchResponse.limit) + 1} to{' '}
                      {Math.min(searchResponse.page * searchResponse.limit, searchResponse.total)} of{' '}
                      {searchResponse.total} questions
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(searchResponse.page - 1)}
                        disabled={!searchResponse.hasPrev}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-secondary-600 dark:text-secondary-400">
                        Page {searchResponse.page} of {searchResponse.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(searchResponse.page + 1)}
                        disabled={!searchResponse.hasNext}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {pageMode === 'create' && (
          <QuestionForm
            categories={categories}
            onSubmit={handleCreateQuestion}
            onCancel={() => setPageMode('browse')}
            isLoading={operationLoading}
          />
        )}

        {pageMode === 'edit' && selectedQuestion && (
          <QuestionForm
            question={selectedQuestion}
            categories={categories}
            onSubmit={handleUpdateQuestion}
            onCancel={() => {
              setPageMode('browse');
              setSelectedQuestion(null);
            }}
            isLoading={operationLoading}
          />
        )}

        {pageMode === 'view' && selectedQuestion && (
          <div className="max-w-4xl mx-auto">
            <QuestionDisplay
              question={selectedQuestion}
              showAnswer={true}
              showExplanation={true}
              showMetadata={true}
              isPreview={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
