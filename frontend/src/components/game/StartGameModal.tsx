'use client';

import React, { useState, useEffect } from 'react';
import { useGame } from '@/hooks/useGame';
import { useGameStore } from '@/stores/gameStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { GameConfig, StartGameForm } from '@/types/game';
import { QuestionType } from '@/types/question';
import { getTokens } from '@/utils/api';
import toast from 'react-hot-toast';

interface StartGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  playerCount: number;
}

interface CategoryOption {
  id: number;
  name: string;
  slug: string;
  questionCount?: number;
}

const DIFFICULTY_LEVELS = [
  { value: 1, label: 'Easy', description: 'Basic questions' },
  { value: 2, label: 'Medium', description: 'Standard difficulty' },
  { value: 3, label: 'Hard', description: 'Challenging questions' },
  { value: 4, label: 'Expert', description: 'Very difficult' }
];

const QUESTION_TYPES = [
  { value: 'MULTIPLE_CHOICE' as QuestionType, label: 'Multiple Choice', description: 'Choose from 4 options' },
  { value: 'TRUE_FALSE' as QuestionType, label: 'True/False', description: 'True or false questions' },
  { value: 'TEXT_INPUT' as QuestionType, label: 'Text Input', description: 'Type your answer' }
];

const TIME_OPTIONS = [
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 45, label: '45 seconds' },
  { value: 60, label: '1 minute' },
  { value: 90, label: '1.5 minutes' },
  { value: 120, label: '2 minutes' }
];

export function StartGameModal({ isOpen, onClose, roomId, playerCount }: StartGameModalProps) {
  const { startGame, isLoading } = useGame();
  const gameError = useGameStore(state => state.error);
  
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [useAI, setUseAI] = useState(false); // Toggle for AI vs Library questions
  const [aiGenerating, setAiGenerating] = useState(false); // Loading state for AI generation
  const [aiTopic, setAiTopic] = useState(''); // Custom topic for AI questions
  
  const [formData, setFormData] = useState<StartGameForm>({
    totalQuestions: 5, // Reduced from 10 to 5 for better success rate
    categories: [],
    difficultyLevels: [1, 2, 3], // Include all difficulty levels
    questionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'], // Include more question types
    timePerQuestion: 30,
    allowHints: false,
    showExplanations: true,
    timeBonusEnabled: true,
    streakBonusEnabled: true
  });

  // Debug useAI state changes (placed after formData declaration)
  useEffect(() => {
    console.log('🔄 useAI state changed:', useAI);
    console.log('🔄 Current form categories:', formData.categories.length);
    console.log('🔄 Available categories:', categories.length);
    console.log('🔄 Loading categories:', loadingCategories);
  }, [useAI, formData.categories, categories.length, loadingCategories]);

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      setLoadingCategories(true);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const { accessToken } = getTokens();
        // Try public endpoint first (no auth required)
        let response = await fetch(`${API_BASE}/api/categories/public`, {
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        // Fallback to authenticated endpoint if public fails
        if (!response.ok) {
          console.log('📂 Public categories failed, trying authenticated endpoint...');
          response = await fetch(`${API_BASE}/api/categories`, {
            headers: {
              'Authorization': `Bearer ${accessToken || ''}`,
              'Content-Type': 'application/json',
            }
          });
        }
        
        if (response.ok) {
          const apiResponse = await response.json();
          console.log('📂 Categories API Response:', apiResponse);
          
          const data = apiResponse.success ? apiResponse.data : apiResponse;
          console.log('📂 Categories Data:', data);
          setCategories(data || []);
          
          // Auto-select ALL categories if none selected (ensures enough questions)
          if (data && data.length > 0) {
            const categoryIds = data.map((cat: CategoryOption) => cat.id);
            console.log('📂 Available category IDs:', categoryIds);
            
            setFormData(prev => {
              const shouldAutoSelect = prev.categories.length === 0;
              console.log('📂 Should auto-select categories?', shouldAutoSelect);
              console.log('📂 Current categories:', prev.categories);
              
              if (shouldAutoSelect) {
                console.log('📂 Auto-selecting ALL categories:', categoryIds);
                return {
                  ...prev,
                  categories: categoryIds
                };
              }
              return prev;
            });
          } else {
            console.warn('📂 No categories received from API');
          }
        } else {
          console.error('Categories API response not OK:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
        toast.error('Failed to load categories');
      } finally {
        setLoadingCategories(false);
      }
    };

    if (isOpen) {
      loadCategories();
    }
  }, [isOpen]); // Removed formData.categories.length dependency to prevent loops

  // AI Question Generation Function
  const generateAIQuestions = async (topic: string, difficulty: number, count: number) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const { accessToken } = getTokens();
      const response = await fetch(`${API_BASE}/api/ai/generate/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          topic: topic || 'General Knowledge',
          difficulty: difficulty,
          count: count,
          questionType: 'MULTIPLE_CHOICE'
        })
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate questions');
      }

      // AI API returns questions in data.data.questions
      const questions = data.data?.questions || data.questions || [];
      return questions;
    } catch (error) {
      console.error('AI generation error:', error);
      throw new Error('Failed to generate AI questions. Please try library questions instead.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (formData.totalQuestions < 1 || formData.totalQuestions > 20) {
      toast.error('Number of questions must be between 1 and 20');
      return;
    }
    
    if (playerCount < 2) {
      toast.error('At least 2 players are required to start a game');
      return;
    }

    console.log('🎯 VALIDATION CHECK:');
    console.log('🎯 useAI:', useAI);
    console.log('🎯 formData.categories.length:', formData.categories.length);
    console.log('🎯 formData.categories:', formData.categories);
    console.log('🎯 aiTopic:', aiTopic);
    console.log('🎯 Available categories count:', categories.length);
    
    // Library questions validation (only when NOT using AI)
    if (!useAI) {
      console.log('📚 Running Library Questions Validation...');
      console.log('📚 Categories available:', categories.map(c => `${c.id}: ${c.name}`));
      
      if (formData.categories.length === 0) {
        console.log('❌ Category validation failed - No categories selected');
        console.log('❌ Available categories:', categories.length);
        
        // EMERGENCY FIX: Auto-select all categories if none are selected
        if (categories.length > 0) {
          console.log('🚑 EMERGENCY: Auto-selecting all categories before game start');
          const allCategoryIds = categories.map(cat => cat.id);
          
          setFormData(prev => ({
            ...prev,
            categories: allCategoryIds
          }));
          
          toast.success(`Auto-selected all ${categories.length} categories`);
          
          // Retry game start after a brief delay to let state update
          setTimeout(() => {
            console.log('🚑 Retrying game start with categories:', allCategoryIds);
            handleSubmit(e);
          }, 500);
          return;
        } else {
          toast.error('No categories available. Please check your connection.');
          return;
        }
      }
      
      if (formData.difficultyLevels.length === 0) {
        console.log('❌ Difficulty validation failed');
        toast.error('Please select at least one difficulty level');
        return;
      }
      
      if (formData.questionTypes.length === 0) {
        console.log('❌ Question type validation failed');
        toast.error('Please select at least one question type');
        return;
      }
    } else {
      console.log('🤖 SKIPPING Library Validation - AI Mode Active');
      
      // AI-specific validation
      if (!aiTopic || aiTopic.trim().length === 0) {
        console.log('❌ AI Topic validation failed');
        toast.error('Please enter a topic for AI questions');
        return;
      }
    }

    try {
      let gameConfig: Partial<GameConfig>;

      if (useAI) {
        console.log('🤖 Starting AI Question Generation Flow');
        console.log('AI Topic:', aiTopic);
        console.log('Difficulty Levels:', formData.difficultyLevels);
        console.log('Question Count:', formData.totalQuestions);
        
        // AI Question Generation Flow - Enhanced loading states
        setAiGenerating(true);
        toast.loading('🤖 Generating AI questions... This may take a moment.', { 
          id: 'ai-generation',
          duration: 0 // Don't auto-dismiss
        });
        
        try {
          // Generate questions with AI
          const averageDifficulty = Math.round(
            formData.difficultyLevels.reduce((sum, level) => sum + level, 0) / formData.difficultyLevels.length
          );
          
          console.log('Calculated Average Difficulty:', averageDifficulty);
          
          const aiQuestions = await generateAIQuestions(
            aiTopic, 
            averageDifficulty, 
            formData.totalQuestions
          );
          
          if (!aiQuestions || aiQuestions.length === 0) {
            throw new Error('No AI questions were generated. Please try again or use library questions.');
          }
          
          toast.success(`✅ Generated ${aiQuestions.length} AI questions successfully!`, { 
            id: 'ai-generation',
            duration: 3000
          });
          
          console.log('📝 AI questions generated successfully:', aiQuestions.length);

          gameConfig = {
            totalQuestions: formData.totalQuestions,
            categories: [], // Empty for AI questions
            difficultyLevels: formData.difficultyLevels,
            questionTypes: formData.questionTypes,
            timePerQuestion: formData.timePerQuestion,
            shuffleQuestions: true,
            shuffleAnswers: true,
            showExplanations: formData.showExplanations,
            allowHints: formData.allowHints,
            pointsPerQuestion: 100,
            timeBonusEnabled: formData.timeBonusEnabled,
            streakBonusEnabled: formData.streakBonusEnabled,
            useAI: true,
            aiTopic: aiTopic,
            aiQuestions: aiQuestions // Pass generated questions
          };
          
        } catch (aiError) {
          console.error('AI generation failed, attempting fallback to library questions:', aiError);
          toast.dismiss('ai-generation');
          
          // Show fallback notification
          toast.loading('🤖➡️📚 AI generation failed. Switching to library questions...', { 
            id: 'ai-fallback',
            duration: 3000 
          });
          
          // Auto-fallback to library questions if AI fails
          if (categories.length > 0) {
            const allCategoryIds = categories.map(cat => cat.id);
            gameConfig = {
              totalQuestions: formData.totalQuestions,
              categories: allCategoryIds,
              difficultyLevels: formData.difficultyLevels,
              questionTypes: formData.questionTypes,
              timePerQuestion: formData.timePerQuestion,
              shuffleQuestions: true,
              shuffleAnswers: true,
              showExplanations: formData.showExplanations,
              allowHints: formData.allowHints,
              pointsPerQuestion: 100,
              timeBonusEnabled: formData.timeBonusEnabled,
              streakBonusEnabled: formData.streakBonusEnabled,
              useAI: false
            };
            
            toast.success('📚 Switched to library questions automatically!', { 
              id: 'ai-fallback' 
            });
          } else {
            throw new Error('AI generation failed and no library questions are available. Please try again later.');
          }
        }
      } else {
        console.log('📚 Starting Library Question Flow');
        console.log('Selected Categories:', formData.categories);
        console.log('Difficulty Levels:', formData.difficultyLevels);
        console.log('Question Types:', formData.questionTypes);
        
        // Library Questions Flow
        gameConfig = {
          totalQuestions: formData.totalQuestions,
          categories: formData.categories,
          difficultyLevels: formData.difficultyLevels,
          questionTypes: formData.questionTypes,
          timePerQuestion: formData.timePerQuestion,
          shuffleQuestions: true,
          shuffleAnswers: true,
          showExplanations: formData.showExplanations,
          allowHints: formData.allowHints,
          pointsPerQuestion: 100,
          timeBonusEnabled: formData.timeBonusEnabled,
          streakBonusEnabled: formData.streakBonusEnabled,
          useAI: false
        };
      }

      console.log('🎮 Final Game Config:', gameConfig);
      console.log('🎮 Use AI:', gameConfig.useAI);
      console.log('🎮 Room ID:', roomId);

      // Show game starting notification
      toast.loading('🚀 Starting multiplayer quiz...', { 
        id: 'game-starting',
        duration: 0
      });

      await startGame(gameConfig, roomId);
      
      toast.success(gameConfig.useAI ? '🤖 AI Quiz Game Started!' : '📚 Library Quiz Game Started!', {
        id: 'game-starting'
      });
      onClose();
      
    } catch (error) {
      console.error('Failed to start game:', error);
      toast.dismiss('game-starting');
      toast.error(error instanceof Error ? error.message : 'Failed to start game');
    } finally {
      setAiGenerating(false);
      toast.dismiss('ai-generation');
      toast.dismiss('ai-fallback');
    }
  };

  const handleCategoryToggle = (categoryId: number) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryId)
        ? prev.categories.filter(id => id !== categoryId)
        : [...prev.categories, categoryId]
    }));
  };

  const handleDifficultyToggle = (level: number) => {
    setFormData(prev => ({
      ...prev,
      difficultyLevels: prev.difficultyLevels.includes(level)
        ? prev.difficultyLevels.filter(l => l !== level)
        : [...prev.difficultyLevels, level]
    }));
  };

  const handleQuestionTypeToggle = (type: QuestionType) => {
    setFormData(prev => ({
      ...prev,
      questionTypes: prev.questionTypes.includes(type)
        ? prev.questionTypes.filter(t => t !== type)
        : [...prev.questionTypes, type]
    }));
  };

  const handleSelectAllCategories = () => {
    setFormData(prev => ({
      ...prev,
      categories: categories.map(cat => cat.id)
    }));
  };

  const handleDeselectAllCategories = () => {
    setFormData(prev => ({
      ...prev,
      categories: []
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Start Multiplayer Quiz
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Configure your quiz settings - {playerCount} players ready
              </p>
            </div>
            <Button
              onClick={onClose}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-8">
            {/* Question Source */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Question Source
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {useAI ? '🤖 AI Generated Questions' : '📚 Library Questions'}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {useAI 
                          ? 'Generate fresh questions on any topic using AI'
                          : 'Use existing questions from our curated library'
                        }
                      </span>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const newUseAI = !useAI;
                      console.log('🔄 AI Toggle clicked - Current:', useAI, '-> New:', newUseAI);
                      setUseAI(newUseAI);
                      toast.success(
                        newUseAI ? '🤖 Switched to AI Questions!' : '📚 Switched to Library Questions!',
                        { duration: 2000 }
                      );
                      console.log('🔄 Toggle state after click should be:', newUseAI);
                      
                      if (!newUseAI && categories.length > 0 && formData.categories.length === 0) {
                        console.log('🔄 Switching to Library mode - Auto-selecting categories');
                        const allCategoryIds = categories.map(cat => cat.id);
                        setFormData(prev => ({
                          ...prev,
                          categories: allCategoryIds
                        }));
                        console.log('🔄 Auto-selected categories for Library mode:', allCategoryIds);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      useAI 
                        ? 'bg-indigo-600' 
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        useAI ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {/* AI Topic Input */}
                {useAI && (
                  <div className="animate-in slide-in-from-top duration-200">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      AI Topic (Optional)
                    </label>
                    <input
                      type="text"
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="e.g., Python Programming, World History, Science..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                      disabled={isLoading || aiGenerating}
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Leave empty for mixed topics. Specific topics generate more focused questions.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Basic Settings */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Basic Settings
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Number of Questions
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={formData.totalQuestions}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      totalQuestions: parseInt(e.target.value) || 10
                    }))}
                    placeholder="10"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Choose between 1-50 questions
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Time Per Question
                  </label>
                  <select
                    value={formData.timePerQuestion}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      timePerQuestion: parseInt(e.target.value)
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    {TIME_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Categories - Only show for Library questions */}
            {!useAI && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Categories
                  </h3>
                {!loadingCategories && categories.length > 0 && (
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllCategories}
                      disabled={formData.categories.length === categories.length}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeselectAllCategories}
                      disabled={formData.categories.length === 0}
                    >
                      Deselect All
                    </Button>
                  </div>
                )}
              </div>
              
              {loadingCategories ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner size="md" />
                  <span className="ml-2 text-gray-600 dark:text-gray-400">
                    Loading categories...
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categories.map(category => (
                    <label
                      key={category.id}
                      className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        formData.categories.includes(category.id)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.categories.includes(category.id)}
                        onChange={() => handleCategoryToggle(category.id)}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {category.name}
                        </div>
                        {category.questionCount && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {category.questionCount} questions
                          </div>
                        )}
                      </div>
                      {formData.categories.includes(category.id) && (
                        <div className="text-blue-500 ml-2">✓</div>
                      )}
                    </label>
                  ))}
                </div>
              )}
              
              {formData.categories.length === 0 && !loadingCategories && (
                <p className="text-red-500 text-sm mt-2">
                  Please select at least one category
                </p>
              )}
              </section>
            )}

            {/* Difficulty Levels */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Difficulty Levels
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DIFFICULTY_LEVELS.map(level => (
                  <label
                    key={level.value}
                    className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      formData.difficultyLevels.includes(level.value)
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.difficultyLevels.includes(level.value)}
                      onChange={() => handleDifficultyToggle(level.value)}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {level.label}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {level.description}
                      </div>
                    </div>
                    {formData.difficultyLevels.includes(level.value) && (
                      <div className="text-green-500 ml-2">✓</div>
                    )}
                  </label>
                ))}
              </div>
            </section>

            {/* Question Types */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Question Types
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {QUESTION_TYPES.map(type => (
                  <label
                    key={type.value}
                    className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      formData.questionTypes.includes(type.value)
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.questionTypes.includes(type.value)}
                      onChange={() => handleQuestionTypeToggle(type.value)}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {type.label}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {type.description}
                      </div>
                    </div>
                    {formData.questionTypes.includes(type.value) && (
                      <div className="text-purple-500 ml-2">✓</div>
                    )}
                  </label>
                ))}
              </div>
            </section>

            {/* Game Features */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Game Features
              </h3>
              
              <div className="space-y-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.showExplanations}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      showExplanations: e.target.checked
                    }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">
                    Show explanations after each question
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.allowHints}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      allowHints: e.target.checked
                    }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">
                    Allow players to use hints
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.timeBonusEnabled}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      timeBonusEnabled: e.target.checked
                    }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">
                    Award bonus points for quick answers
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.streakBonusEnabled}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      streakBonusEnabled: e.target.checked
                    }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-gray-700 dark:text-gray-300">
                    Award streak bonuses for consecutive correct answers
                  </span>
                </label>
              </div>
            </section>
          </div>

          {/* Error Display */}
          {gameError && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-red-700 dark:text-red-300 text-sm">{gameError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading || aiGenerating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading || 
                aiGenerating || 
                (useAI ? (
                  !aiTopic || aiTopic.trim().length === 0
                ) : (
                  formData.categories.length === 0 ||
                  formData.difficultyLevels.length === 0 ||
                  formData.questionTypes.length === 0
                ))
              }
              className="min-w-[160px] relative"
            >
              {aiGenerating ? (
                <div className="flex items-center">
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Generating...</span>
                </div>
              ) : isLoading ? (
                <div className="flex items-center">
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Starting...</span>
                </div>
              ) : (
                <div className="flex items-center">
                  {useAI ? '🤖 Generate & Start AI Game' : '📚 Start Library Game'}
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
