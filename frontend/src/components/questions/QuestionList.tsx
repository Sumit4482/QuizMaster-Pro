'use client';

import React, { useState } from 'react';
import {
  Question,
  QuestionListItem as QuestionListItemType,
  questionUtils,
} from '@/types/question';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QuestionDisplay } from './QuestionDisplay';

interface QuestionListProps {
  questions: Question[];
  loading?: boolean;
  selectedQuestions?: string[];
  onQuestionSelect?: (questionId: string, selected: boolean) => void;
  onQuestionEdit?: (question: Question) => void;
  onQuestionDelete?: (questionId: string) => void;
  onQuestionPublish?: (questionId: string) => void;
  onQuestionUnpublish?: (questionId: string) => void;
  onQuestionView?: (question: Question) => void;
  viewMode?: 'grid' | 'list' | 'compact';
  showActions?: boolean;
  showSelection?: boolean;
  emptyMessage?: string;
}

export function QuestionList({
  questions,
  loading = false,
  selectedQuestions = [],
  onQuestionSelect,
  onQuestionEdit,
  onQuestionDelete,
  onQuestionPublish,
  onQuestionUnpublish,
  onQuestionView,
  viewMode = 'grid',
  showActions = true,
  showSelection = false,
  emptyMessage = 'No questions found',
}: QuestionListProps) {
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded mb-3"></div>
              <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded mb-2"></div>
              <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-2">
            No Questions Found
          </h3>
          <p className="text-secondary-600 dark:text-secondary-400">
            {emptyMessage}
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderQuestionActions = (question: Question) => {
    if (!showActions) return null;

    return (
      <div className="flex items-center space-x-2">
        {onQuestionView && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onQuestionView(question);
            }}
          >
            View
          </Button>
        )}
        {onQuestionEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onQuestionEdit(question);
            }}
          >
            Edit
          </Button>
        )}
        {question.isPublished ? (
          onQuestionUnpublish && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onQuestionUnpublish(question.id);
              }}
            >
              Unpublish
            </Button>
          )
        ) : (
          onQuestionPublish && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onQuestionPublish(question.id);
              }}
            >
              Publish
            </Button>
          )
        )}
        {onQuestionDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this question?')) {
                onQuestionDelete(question.id);
              }
            }}
            className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
          >
            Delete
          </Button>
        )}
      </div>
    );
  };

  const renderQuestionItem = (question: Question) => {
    const isSelected = selectedQuestions.includes(question.id);
    const isExpanded = expandedQuestion === question.id;
    const difficultyInfo = questionUtils.formatDifficulty(question.difficultyLevel);
    const typeInfo = questionUtils.formatQuestionType(question.questionType);

    return (
      <div
        key={question.id}
        className={onQuestionView ? 'cursor-pointer' : ''}
        onClick={() => {
          if (onQuestionView) {
            onQuestionView(question);
          } else {
            setExpandedQuestion(isExpanded ? null : question.id);
          }
        }}
      >
        <Card className={`transition-all duration-200 hover:shadow-lg ${
          isSelected ? 'ring-2 ring-primary-500 bg-primary-50/50 dark:bg-primary-900/20' : ''
        }`}>
      
        <CardContent className="p-4">
          {showSelection && onQuestionSelect && (
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onQuestionSelect(question.id, e.target.checked);
                }}
                className="rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Question Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="font-semibold text-secondary-900 dark:text-white line-clamp-2 mb-2">
                {question.questionText}
              </h3>
              <div className="flex items-center space-x-2 text-sm text-secondary-600 dark:text-secondary-400">
                <span className={`px-2 py-1 rounded-full bg-${difficultyInfo.color}-100 text-${difficultyInfo.color}-800 dark:bg-${difficultyInfo.color}-900/30 dark:text-${difficultyInfo.color}-300`}>
                  {difficultyInfo.label}
                </span>
                <span>{typeInfo.icon} {typeInfo.label}</span>
                <span>•</span>
                <span>{question.points} pts</span>
                <span>•</span>
                <span>{question.estimatedTime}s</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              {!question.isPublished && (
                <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                  Draft
                </span>
              )}
              {question.isPublished && (
                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Published
                </span>
              )}
            </div>
          </div>

          {/* Question Meta */}
          <div className="flex items-center justify-between text-sm text-secondary-500 mb-3">
            <div className="flex items-center space-x-4">
              <span>📁 {question.categories.map(c => c.name).join(', ')}</span>
              {question.tags.length > 0 && (
                <span>🏷️ {questionUtils.formatTags(question.tags.slice(0, 3))}</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span>v{question.version}</span>
              <span>•</span>
              <span>{question.source}</span>
            </div>
          </div>

          {/* Usage Stats */}
          {question.usage && (
            <div className="flex items-center justify-between text-xs text-secondary-500 mb-3 p-2 bg-secondary-50 dark:bg-secondary-800 rounded">
              <span>Used: {question.usage.timesUsed}</span>
              <span>Success: {Math.round(question.usage.successRate)}%</span>
              <span>Avg Time: {question.usage.averageTime || 0}s</span>
            </div>
          )}

          {/* Expanded Content */}
          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-700">
              <QuestionDisplay
                question={question}
                showAnswer={true}
                showExplanation={true}
                isPreview={true}
                compact={true}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center text-xs text-secondary-500">
              <span>By {question.createdBy.username}</span>
              <span className="mx-2">•</span>
              <span>{new Date(question.createdAt).toLocaleDateString()}</span>
            </div>
            {renderQuestionActions(question)}
          </div>
        </CardContent>
        </Card>
      </div>
    );
  };

  const renderListView = () => {
    return (
      <div className="space-y-3">
        {questions.map((question) => (
          <Card
            key={question.id}
            className="hover:shadow-md transition-all duration-200"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                {showSelection && onQuestionSelect && (
                  <input
                    type="checkbox"
                    checked={selectedQuestions.includes(question.id)}
                    onChange={(e) => onQuestionSelect(question.id, e.target.checked)}
                    className="mr-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium text-secondary-900 dark:text-white truncate mr-4">
                      {question.questionText}
                    </h3>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {renderQuestionActions(question)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-secondary-600 dark:text-secondary-400">
                    <span>{questionUtils.formatQuestionType(question.questionType).label}</span>
                    <span>{questionUtils.formatDifficulty(question.difficultyLevel).label}</span>
                    <span>{question.points} pts</span>
                    <span>{question.categories.map(c => c.name).join(', ')}</span>
                    <span className={question.isPublished ? 'text-green-600' : 'text-yellow-600'}>
                      {question.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderGridView = () => {
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {questions.map(renderQuestionItem)}
      </div>
    );
  };

  const renderCompactView = () => {
    return (
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {questions.map((question) => (
          <QuestionDisplay
            key={question.id}
            question={question}
            compact={true}
            showMetadata={true}
          />
        ))}
      </div>
    );
  };

  switch (viewMode) {
    case 'list':
      return renderListView();
    case 'compact':
      return renderCompactView();
    case 'grid':
    default:
      return renderGridView();
  }
}
