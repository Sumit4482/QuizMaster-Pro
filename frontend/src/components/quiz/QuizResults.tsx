'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Progress } from '@/components/ui/Progress';
import { 
  useQuizResults, 
  useQuizActions, 
  useQuizSession,
  useQuizLoading,
  useQuizError 
} from '@/stores/quizStore';
import {
  DetailedQuizResult,
  CategoryPerformance,
  DifficultyPerformance,
  QuestionTypePerformance,
  QuestionResult,
  formatPercentage,
  formatTime,
  calculateScoreGrade,
  getDifficultyColor,
  getQuestionTypeIcon,
  getQuestionTypeLabel,
  getAchievementIcon,
  getAchievementName,
  DIFFICULTY_NAMES,
} from '@/types/quiz';

interface QuizResultsProps {
  sessionId: string;
  onRetakeQuiz?: () => void;
  onNewQuiz?: () => void;
  onViewHistory?: () => void;
  onDashboard?: () => void;
}

export const QuizResults: React.FC<QuizResultsProps> = ({
  sessionId,
  onRetakeQuiz,
  onNewQuiz,
  onViewHistory,
  onDashboard,
}) => {
  const results = useQuizResults();
  const session = useQuizSession();
  const isLoading = useQuizLoading();
  const error = useQuizError();
  const { loadResults, loadUserStatistics } = useQuizActions();

  const [activeTab, setActiveTab] = useState<'overview' | 'categories' | 'questions'>('overview');
  const [showDetailedQuestions, setShowDetailedQuestions] = useState(false);

  // Load results on component mount
  useEffect(() => {
    const loadQuizResults = async () => {
      try {
        await loadResults(sessionId);
        await loadUserStatistics();
      } catch (err) {
        console.error('Failed to load quiz results:', err);
      }
    };

    if (sessionId) {
      loadQuizResults();
    }
  }, [sessionId, loadResults, loadUserStatistics]);

  const renderOverview = () => {
    if (!results || !session) return null;

    const scoreGrade = calculateScoreGrade(results.scorePercentage);

    return (
      <div className="space-y-6">
        {/* Main Score Card */}
        <Card className="p-8 text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900">
          <div className="mb-4">
            <div className={`text-6xl font-bold mb-2 ${scoreGrade.color}`}>
              {scoreGrade.grade}
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {results.totalScore} / {results.maxPossibleScore}
            </div>
            <div className="text-lg text-gray-600 dark:text-gray-300">
              {formatPercentage(results.scorePercentage)} Score
            </div>
          </div>
          <Progress value={results.scorePercentage} className="w-full max-w-sm mx-auto mb-4" />
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {formatPercentage(results.accuracyRate)} Accuracy • {formatTime(results.totalTimeTaken)} Total Time
          </div>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{results.correctAnswers}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Correct</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{results.incorrectAnswers}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Incorrect</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{results.skippedQuestions}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Skipped</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{results.streakCount}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Best Streak</div>
          </Card>
        </div>

        {/* Performance Metrics */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Accuracy</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatPercentage(results.accuracyRate)}
                </span>
              </div>
              <Progress value={results.accuracyRate} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Efficiency</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {results.timeEfficiency.toFixed(2)} pts/sec
                </span>
              </div>
              <Progress value={Math.min(100, results.timeEfficiency * 10)} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Avg. Time/Question</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatTime(Math.floor(results.averageTimePerQuestion))}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Achievements */}
        {results.achievements.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Achievements Earned</h3>
            <div className="flex flex-wrap gap-3">
              {results.achievements.map((achievement, index) => (
                <Badge
                  key={index}
                  className="bg-yellow-100 text-yellow-800 text-sm px-3 py-2"
                >
                  {getAchievementIcon(achievement)} {getAchievementName(achievement)}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  };

  const renderCategoryPerformance = () => {
    if (!results) return null;

    return (
      <div className="space-y-4">
        {/* Category Stats */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Category Performance</h3>
          <div className="space-y-4">
            {results.categoryStats.map((category: CategoryPerformance, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900 dark:text-white">{category.categoryName}</h4>
                  <Badge className={category.accuracyRate >= 80 ? 'bg-green-100 text-green-800' : 
                                  category.accuracyRate >= 60 ? 'bg-yellow-100 text-yellow-800' : 
                                  'bg-red-100 text-red-800'}>
                    {formatPercentage(category.accuracyRate)}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Questions:</span>
                    <span className="ml-1 font-medium">{category.questionsCorrect}/{category.questionsTotal}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Avg Score:</span>
                    <span className="ml-1 font-medium">{category.averageScore.toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Avg Time:</span>
                    <span className="ml-1 font-medium">{formatTime(Math.floor(category.averageTime))}</span>
                  </div>
                </div>
                <Progress value={category.accuracyRate} className="mt-2 h-2" />
              </div>
            ))}
          </div>
        </Card>

        {/* Difficulty Stats */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Difficulty Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.difficultyStats.map((difficulty: DifficultyPerformance, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <Badge className={getDifficultyColor(difficulty.difficultyLevel)}>
                    {difficulty.difficultyName}
                  </Badge>
                  <span className="font-medium">{formatPercentage(difficulty.accuracyRate)}</span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {difficulty.questionsCorrect}/{difficulty.questionsTotal} questions correct
                </div>
                <Progress value={difficulty.accuracyRate} className="h-2" />
              </div>
            ))}
          </div>
        </Card>

        {/* Question Type Stats */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Question Type Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {results.questionTypeStats.map((type: QuestionTypePerformance, index) => (
              <div key={index} className="border rounded-lg p-4 text-center">
                <div className="text-2xl mb-2">{getQuestionTypeIcon(type.questionType)}</div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                  {getQuestionTypeLabel(type.questionType)}
                </h4>
                <div className="text-lg font-bold text-blue-600 mb-1">
                  {formatPercentage(type.accuracyRate)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {type.questionsCorrect}/{type.questionsTotal} correct
                </div>
                <Progress value={type.accuracyRate} className="mt-2 h-2" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  };

  const renderQuestionReview = () => {
    if (!results) return null;

    const filteredQuestions = showDetailedQuestions 
      ? results.questionResults 
      : results.questionResults.filter((q: QuestionResult) => !q.isCorrect || q.skipped);

    return (
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Question Review</h3>
          <div className="flex items-center space-x-2">
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={showDetailedQuestions}
                onChange={(e) => setShowDetailedQuestions(e.target.checked)}
                className="mr-2"
              />
              Show all questions
            </label>
          </div>
        </div>

        <div className="space-y-4">
          {filteredQuestions.length === 0 ? (
            <div className="text-center text-gray-600 dark:text-gray-400 py-8">
              {showDetailedQuestions ? 'No questions to display' : 'Great job! All questions answered correctly.'}
            </div>
          ) : (
            filteredQuestions.map((question: QuestionResult, index) => (
              <div key={index} className={`border rounded-lg p-4 ${
                question.isCorrect ? 'border-green-200 bg-green-50 dark:bg-green-900' :
                question.skipped ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900' :
                'border-red-200 bg-red-50 dark:bg-red-900'
              }`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`text-xl ${
                      question.isCorrect ? 'text-green-600' :
                      question.skipped ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {question.isCorrect ? '✓' : question.skipped ? '⏭' : '✗'}
                    </div>
                    <Badge className={getDifficultyColor(question.difficultyLevel)}>
                      {DIFFICULTY_NAMES[question.difficultyLevel]}
                    </Badge>
                    <Badge className="bg-gray-100 text-gray-800">
                      {question.categoryName}
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-800">
                      +{question.pointsEarned} pts
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {formatTime(question.timeTaken)}
                  </div>
                </div>

                <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                  {question.questionText}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Your Answer:</span>
                    <span className={`ml-2 ${
                      question.isCorrect ? 'text-green-600' :
                      question.skipped ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {question.skipped ? 'Skipped' : String(question.userAnswer)}
                    </span>
                  </div>
                  {!question.isCorrect && !question.skipped && (
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Correct Answer:</span>
                      <span className="ml-2 text-green-600">
                        {String(question.correctAnswer)}
                      </span>
                    </div>
                  )}
                </div>

                {question.explanation && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                    <span className="font-medium text-blue-800 dark:text-blue-200">Explanation:</span>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">{question.explanation}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    );
  };

  if (isLoading || !results) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
        <span className="ml-2">Loading results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-600 text-lg mb-4">Error: {error}</div>
        <Button onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Quiz Results
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          {session?.title || 'Quiz'} • Completed on {new Date(results.completedAt).toLocaleDateString()}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'categories', label: 'Performance', icon: '📈' },
          { id: 'questions', label: 'Review', icon: '📝' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mb-8">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'categories' && renderCategoryPerformance()}
        {activeTab === 'questions' && renderQuestionReview()}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap justify-center gap-4">
        <Button variant="primary" onClick={onDashboard}>
          📊 Go to Dashboard
        </Button>
        <Button variant="secondary" onClick={onNewQuiz}>
          Take New Quiz
        </Button>
        <Button variant="secondary" onClick={onRetakeQuiz}>
          Retake This Quiz
        </Button>
        <Button variant="secondary" onClick={onViewHistory}>
          View History
        </Button>
        <Button 
          variant="secondary" 
          onClick={() => {
            // Share functionality
            if (navigator.share) {
              navigator.share({
                title: 'Quiz Results',
                text: `I scored ${results.totalScore}/${results.maxPossibleScore} (${formatPercentage(results.scorePercentage)}) on QuizMaster Pro!`,
                url: window.location.href,
              });
            } else {
              // Fallback: copy to clipboard
              navigator.clipboard.writeText(
                `I scored ${results.totalScore}/${results.maxPossibleScore} (${formatPercentage(results.scorePercentage)}) on QuizMaster Pro! ${window.location.href}`
              );
              alert('Results copied to clipboard!');
            }
          }}
        >
          Share Results
        </Button>
      </div>
    </div>
  );
};
