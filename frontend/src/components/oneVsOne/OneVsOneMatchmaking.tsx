'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { categoryApi } from '@/utils/questionApi';

interface QuizCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
}

interface OneVsOneMatchmakingProps {
  onStartSearch: (params: {
    useAI: boolean;
    aiTopic?: string;
    categoryIds?: number[];
    difficulty: number;
    questionCount: number;
  }) => void;
  onBackToDashboard: () => void;
  isConnected: boolean;
}

export const OneVsOneMatchmaking: React.FC<OneVsOneMatchmakingProps> = ({
  onStartSearch,
  onBackToDashboard,
  isConnected,
}) => {
  const [useAI, setUseAI] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState(2); // Medium by default
  const [questionCount, setQuestionCount] = useState(5);
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
        }));
        
        setCategories(categoriesWithCount);
        
        // Auto-select some categories for quick start
        if (categoriesWithCount.length > 0 && categoriesWithCount[0]) {
          setSelectedCategories([categoriesWithCount[0].id]);
        }
      } catch (err) {
        setCategoryError('Failed to load categories');
        console.error('Error loading categories:', err);
      } finally {
        setLoadingCategories(false);
      }
    };

    if (!useAI) {
      loadCategories();
    }
  }, [useAI]);

  const handleCategoryToggle = (categoryId: number) => {
    const isSelected = selectedCategories.includes(categoryId);
    
    const newCategories = isSelected
      ? selectedCategories.filter(id => id !== categoryId)
      : [...selectedCategories, categoryId];
    
    setSelectedCategories(newCategories);
  };

  const handleStartSearch = () => {
    if (useAI) {
      if (!aiTopic.trim()) {
        alert('Please enter a topic for AI questions');
        return;
      }
    } else {
      if (selectedCategories.length === 0) {
        alert('Please select at least one category');
        return;
      }
    }

    const searchParams = {
      useAI,
      difficulty,
      questionCount,
      ...(useAI ? { aiTopic: aiTopic.trim() } : { categoryIds: selectedCategories })
    };
    onStartSearch(searchParams);
  };

  const difficultyNames = ['Easy', 'Medium', 'Hard'];
  const difficultyColors = ['text-green-600', 'text-yellow-600', 'text-red-600'];

  if (loadingCategories && !useAI) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
        <span className="ml-2">Loading matchmaking setup...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Back Button */}
      <div className="text-left">
        <Button
          variant="outline"
          onClick={onBackToDashboard}
          className="flex items-center space-x-2"
        >
          <span>←</span>
          <span>Back to Dashboard</span>
        </Button>
      </div>

      {/* AI/Library Toggle */}
      <div className="flex justify-center mb-6">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex">
          <button
            type="button"
            onClick={() => setUseAI(false)}
            className={`px-6 py-3 rounded-md transition-all font-medium ${
              !useAI
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            📚 Library Questions
          </button>
          <button
            type="button"
            onClick={() => setUseAI(true)}
            className={`px-6 py-3 rounded-md transition-all font-medium ${
              useAI
                ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            🤖 AI Questions
          </button>
        </div>
      </div>

      {/* Game Settings */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            ⚙️ Game Settings
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Difficulty */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Difficulty Level
              </label>
              <div className="flex space-x-2">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    onClick={() => setDifficulty(level)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
                      difficulty === level
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <div className={`font-medium ${difficultyColors[level - 1]}`}>
                      {difficultyNames[level - 1]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Question Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Number of Questions
              </label>
              <div className="flex space-x-2">
                {[3, 5, 7, 10].map((count) => (
                  <button
                    key={count}
                    onClick={() => setQuestionCount(count)}
                    className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
                      questionCount === count
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topic/Category Selection */}
      {useAI ? (
        /* AI Topic Input */
        <Card>
          <CardContent className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-3xl mb-4">
                🤖
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                🎯 AI Topic Battle
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Enter a topic and let AI generate custom questions for both players!
              </p>
              
              <div className="max-w-md mx-auto">
                <Input
                  type="text"
                  placeholder="e.g., JavaScript, World History, Biology..."
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  className="w-full text-lg p-4 rounded-lg border-2 border-purple-200 dark:border-purple-600 focus:border-purple-500 dark:focus:border-purple-400"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Category Selection */
        <Card>
          <CardContent className="p-6">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">
              📚 Choose Battle Categories
            </h3>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
              Select categories that both you and your opponent will face
            </p>
            
            {categoryError && (
              <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
                <p className="text-yellow-800 dark:text-yellow-200">{categoryError}</p>
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
                      selectedCategories.includes(category.id)
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 shadow-lg'
                        : 'border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-500'
                    }`}
                  >
                    <CardContent className="p-4 text-center">
                      <div className="text-3xl mb-2">
                        {category.icon || '📚'}
                      </div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                        {category.name}
                      </h4>
                      {category.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                          {category.description}
                        </p>
                      )}
                      {selectedCategories.includes(category.id) && (
                        <div className="mt-2">
                          <Badge className="bg-red-500 text-white text-xs">
                            ✓ Selected
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Battle Button */}
      <div className="text-center">
        <Button
          onClick={handleStartSearch}
          disabled={!isConnected || (useAI ? !aiTopic.trim() : selectedCategories.length === 0)}
          className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold py-4 px-12 text-xl rounded-lg transform hover:scale-105 transition-all duration-200 shadow-lg"
        >
          {!isConnected ? (
            <>
              🔌 Connecting...
            </>
          ) : (
            <>
              ⚔️ Find Opponent & Battle!
            </>
          )}
        </Button>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          {questionCount} questions • {difficultyNames[difficulty - 1]} difficulty • 30 seconds per question
        </p>
      </div>
    </div>
  );
};
