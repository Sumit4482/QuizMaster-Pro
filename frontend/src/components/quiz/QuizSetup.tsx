'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useQuizStore, useQuizActions, useQuizSetupForm, useQuizLoading, useQuizError } from '@/stores/quizStore';
import { categoryApi } from '@/utils/questionApi';
import {
  QuizSetupFormData,
  QuizCategory,
} from '@/types/quiz';

interface QuizSetupProps {
  onSessionCreated?: (sessionId: string) => void;
}

export const QuizSetup: React.FC<QuizSetupProps> = ({ onSessionCreated }) => {
  const setupForm = useQuizSetupForm();
  const isLoading = useQuizLoading();
  const error = useQuizError();
  const session = useQuizStore((state) => state.session);
  const { createSession, startSession, updateSetupForm, resetSetupForm } = useQuizActions();

  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Load categories on component mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true);
        setCategoryError(null);
        
        const response = await categoryApi.getAll();
        const categoriesWithCount = response.map(cat => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description || '',
          icon: cat.icon || '',
          color: cat.color || '#0ea5e9',
          questionCount: 0, // Will be updated when we have real data
        }));
        
        setCategories(categoriesWithCount);
      } catch (err) {
        setCategoryError('Failed to load categories');
        console.error('Error loading categories:', err);
      } finally {
        setLoadingCategories(false);
      }
    };

    loadCategories();
  }, []);

  const handleInputChange = (field: keyof QuizSetupFormData, value: any) => {
    updateSetupForm({ [field]: value });
  };

  const handleCategoryToggle = (categoryId: number) => {
    const currentCategories = setupForm.selectedCategories;
    const isSelected = currentCategories.includes(categoryId);
    
    const newCategories = isSelected
      ? currentCategories.filter(id => id !== categoryId)
      : [...currentCategories, categoryId];
    
    handleInputChange('selectedCategories', newCategories);
  };

  const handleSelectAllCategories = () => {
    handleInputChange('selectedCategories', categories.map(cat => cat.id));
  };

  const handleDeselectAllCategories = () => {
    handleInputChange('selectedCategories', []);
  };



  const handleSubmit = async (e?: React.FormEvent) => {
    if (e?.preventDefault) {
      e.preventDefault();
    }

    // Simple validation - just need categories
    if (setupForm.selectedCategories.length === 0) {
      alert('Please select at least one category');
      return;
    }

    try {
      // Create quiz with sensible defaults
      await createSession({
        totalQuestions: 10, // Fixed at 10 questions for simplicity
        categoryIds: setupForm.selectedCategories,
        difficultyLevels: [1, 2, 3], // Mixed difficulty (Easy, Medium, Hard)
        questionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'], // Popular question types
        shuffleQuestions: true, // Always shuffle for variety
        allowPause: true, // Always allow pause
        showExplanations: true, // Always show explanations for learning
        timePerQuestion: 30, // 30 seconds per question
        title: setupForm.selectedCategories.length === categories.length 
          ? 'Random Mix Quiz' 
          : `${categories.filter(c => setupForm.selectedCategories.includes(c.id)).map(c => c.name).join(' & ')} Quiz`
      });

      // Session will be available in the store after creation
      const session = useQuizStore.getState().session;
      if (session) {
        onSessionCreated?.(session.id);
      }
    } catch (err) {
      console.error('Failed to create quiz session:', err);
    }
  };

  const handleStartQuiz = async () => {
    if (!session) return;

    try {
      await startSession(session.id);
    } catch (err) {
      console.error('Failed to start quiz session:', err);
    }
  };



  if (loadingCategories) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
        <span className="ml-2">Loading quiz setup...</span>
      </div>
    );
  }

  // Show session created confirmation if session exists and is in CREATED status
  if (session && session.status === 'CREATED') {
    const selectedCategoryNames = categories
      .filter(cat => session.categoryIds.includes(cat.id))
      .map(cat => cat.name)
      .slice(0, 3)
      .join(', ');

    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="p-8">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">🎯</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              Your Quiz is Ready! 🎉
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
              {session.totalQuestions} questions about{' '}
              {selectedCategoryNames || 'your selected topics'}
            </p>
            <div className="flex justify-center gap-6 text-sm text-gray-500 dark:text-gray-400 mb-6">
              <div className="flex items-center gap-1">
                <span>⏱️</span>
                <span>30s per question</span>
              </div>
              <div className="flex items-center gap-1">
                <span>🎯</span>
                <span>Mixed difficulty</span>
              </div>
              <div className="flex items-center gap-1">
                <span>💡</span>
                <span>Explanations included</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Button
              type="button"
              onClick={handleStartQuiz}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-bold py-4 text-lg rounded-lg transform hover:scale-105 transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Starting your quiz...
                </>
              ) : (
                '🚀 Start Quiz Now!'
              )}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetSetupForm();
                // Reset session state to go back to setup
                useQuizStore.setState({ session: null });
              }}
              disabled={isLoading}
              className="w-full"
            >
              ← Choose Different Topics
            </Button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          🎯 Choose Your Quiz Topic
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300">
          What would you like to be quizzed on?
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {categoryError && (
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200">{categoryError}</p>
        </div>
      )}

      {/* Random Option */}
      <div 
        className="cursor-pointer"
        onClick={() => {
          // Set random configuration
          const allCategoryIds = categories.map(cat => cat.id);
          handleInputChange('selectedCategories', allCategoryIds);
          handleSubmit({ preventDefault: () => {} } as any);
        }}
      >
        <Card className="p-8 transform hover:scale-105 transition-all duration-200 border-2 hover:border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-4xl mb-4">
            🎲
          </div>
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            🎲 Surprise Me!
          </h3>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
            Random mix from all categories - perfect for discovering new topics!
          </p>
          <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">
            ⚡ Click to start instantly
          </div>
        </div>
        </Card>
      </div>

      {/* Categories Selection */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Or Pick Your Favorite Topics
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Select one or more categories that interest you
          </p>
        </div>
        
        {/* Select All/Deselect All Controls */}
        {categories.length > 0 && (
          <div className="flex justify-center space-x-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAllCategories}
              disabled={setupForm.selectedCategories.length === categories.length}
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeselectAllCategories}
              disabled={setupForm.selectedCategories.length === 0}
            >
              Deselect All
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((category) => (
            <div
              key={category.id}
              className="cursor-pointer"
              onClick={() => handleCategoryToggle(category.id)}
            >
              <Card
                className={`transform hover:scale-105 transition-all duration-200 border-2 ${
                  setupForm.selectedCategories.includes(category.id)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                    : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                }`}
              >
              <div className="p-6 text-center">
                <div className="text-4xl mb-3">
                  {category.icon || '📚'}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {category.description}
                  </p>
                )}
                {setupForm.selectedCategories.includes(category.id) && (
                  <div className="mt-3">
                    <Badge className="bg-blue-500 text-white">
                      ✓ Selected
                    </Badge>
                  </div>
                )}
              </div>
              </Card>
            </div>
          ))}
        </div>

        {/* Start Quiz Button */}
        {setupForm.selectedCategories.length > 0 && (
          <div className="text-center">
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 text-lg rounded-lg transform hover:scale-105 transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Setting up your quiz...
                </>
              ) : (
                `🚀 Start Quiz (${setupForm.selectedCategories.length} ${setupForm.selectedCategories.length === 1 ? 'topic' : 'topics'} selected)`
              )}
            </Button>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              10 questions • Mixed difficulty • 30 seconds per question
            </p>
          </div>
        )}

        {/* Instructions */}
        {setupForm.selectedCategories.length === 0 && (
          <div className="text-center">
            <Card className="p-6 bg-gray-50 dark:bg-gray-800">
              <p className="text-gray-600 dark:text-gray-400">
                👆 Choose the "Surprise Me" option for instant play, or select your favorite topics below to get started!
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
