'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { quizApi } from '@/utils/quizApi';
import {
  UserStatisticsResponse,
  QuizSessionSummary,
  formatPercentage,
  formatTime,
  getSessionStatusColor,
  getSessionStatusLabel,
  calculateScoreGrade,
  getAchievementIcon,
  getAchievementName,
} from '@/types/quiz';

interface QuizDashboardProps {
  onStartNewQuiz?: () => void;
  onViewSession?: (sessionId: string) => void;
}

export const QuizDashboard: React.FC<QuizDashboardProps> = ({
  onStartNewQuiz,
  onViewSession,
}) => {
  const [statistics, setStatistics] = useState<UserStatisticsResponse | null>(null);
  const [recentSessions, setRecentSessions] = useState<QuizSessionSummary[]>([]);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'achievements'>('overview');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Loading dashboard data...');

      const [statsResponse, sessionsResponse, historyResponse] = await Promise.all([
        quizApi.statistics.getUserStatistics(),
        quizApi.sessions.getUserSessions({ limit: 5 }),
        quizApi.results.getQuizHistory({ limit: 10 }),
      ]);

      console.log('📊 Stats Response:', statsResponse);
      console.log('📋 Sessions Response:', sessionsResponse);
      console.log('📜 History Response:', historyResponse);

      setStatistics(statsResponse);
      setRecentSessions(sessionsResponse.sessions);
      setQuizHistory(historyResponse.results);
      
      console.log('✅ Dashboard data loaded successfully');
    } catch (err: any) {
      console.error('❌ Dashboard loading error:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const renderOverview = () => {
    if (!statistics) return null;

    return (
      <div className="space-y-6">
        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6 text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {statistics.totalQuizzesCompleted}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Quizzes Completed
            </div>
          </Card>

          <Card className="p-6 text-center bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900 dark:to-emerald-900">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {formatPercentage(statistics.overallAccuracy)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Overall Accuracy
            </div>
          </Card>

          <Card className="p-6 text-center bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900 dark:to-orange-900">
            <div className="text-3xl font-bold text-yellow-600 mb-2">
              {statistics.bestScore}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Best Score
            </div>
          </Card>

          <Card className="p-6 text-center bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900 dark:to-pink-900">
            <div className="text-3xl font-bold text-purple-600 mb-2">
              {statistics.currentStreak}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Current Streak
            </div>
          </Card>
        </div>

        {/* Detailed Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Overview */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Performance Overview</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Completion Rate</span>
                  <span className="text-sm font-bold">
                    {formatPercentage(statistics.completionRate)}
                  </span>
                </div>
                <Progress value={statistics.completionRate} />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Accuracy Rate</span>
                  <span className="text-sm font-bold">
                    {formatPercentage(statistics.overallAccuracy)}
                  </span>
                </div>
                <Progress value={statistics.overallAccuracy} variant="success" />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {statistics.totalQuestionsAnswered}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Questions Answered
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatTime(statistics.totalTimeSpent)}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Time Spent
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Category Performance */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Category Performance</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-green-600 mb-2">
                  🏆 Strongest Categories
                </h4>
                {statistics.strongestCategories.length > 0 ? (
                  <div className="space-y-2">
                    {statistics.strongestCategories.slice(0, 3).map((category, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {category.categoryName}
                        </span>
                        <Badge className="bg-green-100 text-green-800">
                          {formatPercentage(category.accuracyRate)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Complete more quizzes to see your strongest categories
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-yellow-600 mb-2">
                  📈 Areas for Improvement
                </h4>
                {statistics.weakestCategories.length > 0 ? (
                  <div className="space-y-2">
                    {statistics.weakestCategories.slice(0, 3).map((category, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {category.categoryName}
                        </span>
                        <Badge className="bg-yellow-100 text-yellow-800">
                          {formatPercentage(category.accuracyRate)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Keep practicing to identify areas for improvement
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Level and Achievements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Level & Progress</h3>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">
                Level {statistics.level}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {statistics.experiencePoints} XP
              </div>
              <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2">
                <div
                  className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                  style={{
                    width: `${((statistics.experiencePoints % 1000) / 1000) * 100}%`
                  }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {1000 - (statistics.experiencePoints % 1000)} XP to next level
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">Last Quiz</span>
                <span className="text-sm font-medium">
                  {statistics.lastQuizDate 
                    ? new Date(statistics.lastQuizDate).toLocaleDateString()
                    : 'Never'
                  }
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">Daily Streak</span>
                <Badge className="bg-orange-100 text-orange-800">
                  {statistics.currentStreak} days
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">Best Streak</span>
                <Badge className="bg-red-100 text-red-800">
                  {statistics.longestDailyStreak} days
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">Perfect Quizzes</span>
                <Badge className="bg-yellow-100 text-yellow-800">
                  {statistics.perfectQuizzes}
                </Badge>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Recent Quiz Sessions</h3>
              <Button variant="secondary" size="sm" onClick={() => setActiveTab('history')}>
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => onViewSession?.(session.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {session.title || 'Untitled Quiz'}
                      </span>
                      <Badge className={getSessionStatusColor(session.status)}>
                        {getSessionStatusLabel(session.status)}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {session.correctAnswers}/{session.totalQuestions} correct • 
                      {session.totalScore} points • 
                      {formatPercentage(session.progressPercentage)} complete
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  };

  const renderHistory = () => {
    console.log('🔍 Rendering history with data:', quizHistory);
    
    if (!quizHistory || quizHistory.length === 0) {
      return (
        <Card className="p-8 text-center">
          <div className="text-gray-400 text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Quiz History
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Complete some quizzes to see your history and track your progress.
          </p>
          <div className="text-xs text-gray-500 mb-4">
            Debug: quizHistory = {JSON.stringify(quizHistory)}
          </div>
          <Button onClick={onStartNewQuiz}>
            Start Your First Quiz
          </Button>
        </Card>
      );
    }

    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Quiz History</h3>
        <div className="space-y-4">
          {quizHistory.map((result, index) => {
            const grade = calculateScoreGrade(result.scorePercentage);
            return (
              <div
                key={index}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                onClick={() => onViewSession?.(result.sessionId)}
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {result.title || 'Untitled Quiz'}
                    </span>
                    <Badge className={`${grade.color.includes('green') ? 'bg-green-100 text-green-800' :
                                     grade.color.includes('blue') ? 'bg-blue-100 text-blue-800' :
                                     grade.color.includes('yellow') ? 'bg-yellow-100 text-yellow-800' :
                                     grade.color.includes('orange') ? 'bg-orange-100 text-orange-800' :
                                     'bg-red-100 text-red-800'}`}>
                      Grade {grade.grade}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {result.correctAnswers}/{result.totalQuestions} correct • 
                    {result.totalScore} points • 
                    {formatPercentage(result.accuracyRate)} accuracy
                  </div>
                  {result.achievements.length > 0 && (
                    <div className="flex space-x-1 mt-2">
                      {result.achievements.slice(0, 3).map((achievement: any, i: number) => (
                        <span key={i} className="text-lg" title={getAchievementName(achievement)}>
                          {getAchievementIcon(achievement)}
                        </span>
                      ))}
                      {result.achievements.length > 3 && (
                        <span className="text-sm text-gray-500">+{result.achievements.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${grade.color}`}>
                    {formatPercentage(result.scorePercentage)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(result.completedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const renderAchievements = () => {
    // This would show all achievements and progress
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Achievements</h3>
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-4">🏆</div>
          <p>Achievement system coming soon!</p>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
        <span className="ml-2">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="text-red-600 text-lg mb-4">Error: {error}</div>
        <Button onClick={loadDashboardData}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Quiz Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Track your progress and improve your skills
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadDashboardData} disabled={loading}>
            {loading ? '🔄' : '🔄'} Refresh
          </Button>
          <Button onClick={onStartNewQuiz}>
            Start New Quiz
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium">{error}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={loadDashboardData}>
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'history', label: 'History', icon: '📝' },
          { id: 'achievements', label: 'Achievements', icon: '🏆' },
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
      <div>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'achievements' && renderAchievements()}
      </div>
    </div>
  );
};
