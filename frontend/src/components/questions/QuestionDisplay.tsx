'use client';

import React from 'react';
import { Question, questionUtils } from '@/types/question';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface QuestionDisplayProps {
  question: Question;
  showAnswer?: boolean;
  showExplanation?: boolean;
  showMetadata?: boolean;
  onAnswer?: (answer: any) => void;
  selectedAnswer?: any;
  isPreview?: boolean;
  compact?: boolean;
}

export function QuestionDisplay({
  question,
  showAnswer = false,
  showExplanation = false,
  showMetadata = false,
  onAnswer,
  selectedAnswer,
  isPreview = false,
  compact = false,
}: QuestionDisplayProps) {
  const difficultyInfo = questionUtils.formatDifficulty(question.difficultyLevel);
  const typeInfo = questionUtils.formatQuestionType(question.questionType);

  const renderMultipleChoice = () => {
    if (!question.options?.options) return null;

    return (
      <div className="space-y-3">
        {question.options.options.map((option: any, index: number) => {
          const isSelected = selectedAnswer === option;
          const isCorrect = showAnswer && option === question.correctAnswer;
          const isWrong = showAnswer && isSelected && option !== question.correctAnswer;

          return (
            <button
              key={index}
              onClick={() => onAnswer?.(option)}
              disabled={isPreview || showAnswer}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                isCorrect
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : isWrong
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300 dark:hover:border-primary-600'
              } ${
                isPreview || showAnswer
                  ? 'cursor-default'
                  : 'cursor-pointer hover:bg-secondary-50 dark:hover:bg-secondary-800'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-sm font-medium">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="flex-1">{option}</span>
                {isCorrect && (
                  <span className="flex-shrink-0 text-green-600 dark:text-green-400">✓</span>
                )}
                {isWrong && (
                  <span className="flex-shrink-0 text-red-600 dark:text-red-400">✗</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderTrueFalse = () => {
    return (
      <div className="space-y-3">
        {[true, false].map((option) => {
          const label = option ? 'True' : 'False';
          const isSelected = selectedAnswer === option;
          const isCorrect = showAnswer && option === question.correctAnswer;
          const isWrong = showAnswer && isSelected && option !== question.correctAnswer;

          return (
            <button
              key={label}
              onClick={() => onAnswer?.(option)}
              disabled={isPreview || showAnswer}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                isCorrect
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : isWrong
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300 dark:hover:border-primary-600'
              } ${
                isPreview || showAnswer
                  ? 'cursor-default'
                  : 'cursor-pointer hover:bg-secondary-50 dark:hover:bg-secondary-800'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="flex-shrink-0 text-2xl">
                  {option ? '✓' : '✗'}
                </span>
                <span className="flex-1 text-lg font-medium">{label}</span>
                {isCorrect && (
                  <span className="flex-shrink-0 text-green-600 dark:text-green-400">✓</span>
                )}
                {isWrong && (
                  <span className="flex-shrink-0 text-red-600 dark:text-red-400">✗</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderTextInput = () => {
    return (
      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Type your answer here..."
            value={selectedAnswer || ''}
            onChange={(e) => onAnswer?.(e.target.value)}
            disabled={isPreview || showAnswer}
            className="w-full p-4 border-2 border-secondary-200 dark:border-secondary-700 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:bg-secondary-900 disabled:bg-secondary-100 dark:disabled:bg-secondary-800 disabled:cursor-not-allowed"
          />
          {showAnswer && (
            <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span className="text-green-800 dark:text-green-200 font-medium">
                  Correct answer: {question.correctAnswer}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQuestionContent = () => {
    switch (question.questionType) {
      case 'MULTIPLE_CHOICE':
        return renderMultipleChoice();
      case 'TRUE_FALSE':
        return renderTrueFalse();
      case 'TEXT_INPUT':
        return renderTextInput();
      default:
        return <div className="text-red-500">Unsupported question type</div>;
    }
  };

  if (compact) {
    return (
      <div className="p-4 border border-secondary-200 dark:border-secondary-700 rounded-lg">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-medium text-secondary-900 dark:text-white line-clamp-2">
            {question.questionText}
          </h3>
          <div className="flex items-center space-x-2 ml-4">
            <span className={`px-2 py-1 text-xs rounded-full bg-${difficultyInfo.color}-100 text-${difficultyInfo.color}-800 dark:bg-${difficultyInfo.color}-900/30 dark:text-${difficultyInfo.color}-300`}>
              {difficultyInfo.label}
            </span>
            <span className="text-xs text-secondary-500">{typeInfo.icon}</span>
          </div>
        </div>
        {showMetadata && (
          <div className="flex items-center justify-between text-xs text-secondary-500">
            <span>Points: {question.points}</span>
            <span>Time: {question.estimatedTime}s</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-4">
        {/* Question Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-2">
              {question.questionText}
            </h2>
            {question.hints && question.hints.length > 0 && !showAnswer && (
              <div className="text-sm text-secondary-600 dark:text-secondary-400">
                <span className="font-medium">Hint:</span> {question.hints[0]}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <span className={`px-3 py-1 text-sm rounded-full bg-${difficultyInfo.color}-100 text-${difficultyInfo.color}-800 dark:bg-${difficultyInfo.color}-900/30 dark:text-${difficultyInfo.color}-300`}>
              {difficultyInfo.label}
            </span>
            <span className="text-lg">{typeInfo.icon}</span>
          </div>
        </div>

        {/* Question Metadata */}
        {showMetadata && (
          <div className="flex flex-wrap items-center gap-4 text-sm text-secondary-600 dark:text-secondary-400">
            <div className="flex items-center space-x-1">
              <span>📊</span>
              <span>Points: {question.points}</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>⏱️</span>
              <span>Time: {question.estimatedTime}s</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>📁</span>
              <span>{question.categories.map(c => c.name).join(', ')}</span>
            </div>
            {question.tags.length > 0 && (
              <div className="flex items-center space-x-1">
                <span>🏷️</span>
                <span>{questionUtils.formatTags(question.tags)}</span>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Question Content */}
        {renderQuestionContent()}

        {/* Explanation */}
        {showExplanation && question.explanation && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start space-x-2">
              <span className="text-blue-600 dark:text-blue-400 text-lg">💡</span>
              <div>
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                  Explanation
                </h4>
                <p className="text-blue-700 dark:text-blue-300 text-sm">
                  {question.explanation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Question Statistics */}
        {showMetadata && question.usage && (
          <div className="mt-4 p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold text-secondary-900 dark:text-white">
                  {question.usage.timesUsed}
                </div>
                <div className="text-xs text-secondary-600 dark:text-secondary-400">
                  Times Used
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-secondary-900 dark:text-white">
                  {Math.round(question.usage.successRate)}%
                </div>
                <div className="text-xs text-secondary-600 dark:text-secondary-400">
                  Success Rate
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-secondary-900 dark:text-white">
                  {question.usage.averageTime || 0}s
                </div>
                <div className="text-xs text-secondary-600 dark:text-secondary-400">
                  Avg Time
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-secondary-900 dark:text-white">
                  v{question.version}
                </div>
                <div className="text-xs text-secondary-600 dark:text-secondary-400">
                  Version
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
