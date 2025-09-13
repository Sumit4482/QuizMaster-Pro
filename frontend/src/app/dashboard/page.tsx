'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useRequireAuth } from '@/hooks/useAuth';
import { useSocketContext, ConnectionStatus } from '@/contexts/SocketContext';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { LoadingPage } from '@/components/ui/Loading';
import { QuizDashboard } from '@/components/quiz/QuizDashboard';
import { RoomList } from '@/components/rooms/RoomList';
import { CreateRoomModal } from '@/components/rooms/CreateRoomModal';
import { QuickJoin } from '@/components/rooms/QuickJoin';
import { clearRoomSession } from '@/utils/roomSession';
import { quizApi } from '@/utils/quizApi';
import { UserStatisticsResponse } from '@/types/quiz';

export default function DashboardPage() {
  const { user, logout, isLoading } = useAuth();
  const { connectionStatus } = useSocketContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Require authentication for this page
  const { isAuthenticated, isInitialized } = useRequireAuth();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'quiz' | 'rooms' | 'admin'>(() => {
    return (searchParams?.get('tab') as any) || 'overview';
  });

  // Room modal state
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  
  // User statistics state
  const [userStats, setUserStats] = useState<UserStatisticsResponse | null>(null);
  const [recentQuizzes, setRecentQuizzes] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Load user statistics and recent activity
  const loadUserStats = async () => {
    try {
      setStatsLoading(true);
      
      const [stats, history] = await Promise.all([
        quizApi.statistics.getUserStatistics(),
        quizApi.results.getQuizHistory({ limit: 3 })
      ]);
      
      console.log('📊 Loaded user stats for play tab:', stats);
      console.log('📜 Loaded recent quizzes for play tab:', history);
      
      setUserStats(stats);
      setRecentQuizzes(history.results || []);
    } catch (error) {
      console.error('❌ Failed to load user stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Clear room session when reaching dashboard (user manually navigated here)
  useEffect(() => {
    clearRoomSession();
    loadUserStats();
  }, []);

  // Show loading while checking authentication
  if (!isInitialized || isLoading || !isAuthenticated) {
    return <LoadingPage message="Loading dashboard..." />;
  }

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await logout();
    }
  };

  const handleStartNewQuiz = () => {
    router.push('/quiz');
  };

  const handleViewSession = (sessionId: string) => {
    router.push(`/quiz?session=${sessionId}&action=results`);
  };

  const handleTabChange = (tab: 'overview' | 'quiz' | 'rooms' | 'admin') => {
    setActiveTab(tab);
    router.replace(`/dashboard?tab=${tab}`);
  };

  // Room handlers
  const handleRoomJoined = (room: any) => {
    console.log('Joined room:', room);
    // Navigate to the room page using room code
    router.push(`/room/${room.code}`);
  };

  const handleRoomCreated = (room: any) => {
    console.log('Created room:', room);
    setShowCreateRoomModal(false);
    // Navigate to the newly created room using room code
    router.push(`/room/${room.code}`);
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-950">
      {/* Header */}
      <header className="border-b border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-secondary-900 dark:text-white">
                QuizMaster Pro
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <ConnectionStatus className="hidden sm:flex" />
              <div className="text-right">
                <p className="text-sm font-medium text-secondary-900 dark:text-white">
                  {user?.firstName && user?.lastName 
                    ? `${user.firstName} ${user.lastName}`
                    : user?.username}
                </p>
                <p className="text-xs text-secondary-500">{user?.email}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8 text-center">
          <div className="flex justify-between items-center mb-4">
            <div></div>
            <div>
              <h1 className="text-4xl font-bold text-secondary-900 dark:text-white mb-2">
                Ready to Play? 🎯
              </h1>
              <p className="text-xl text-secondary-600 dark:text-secondary-400">
                Choose your game mode and start your quiz adventure!
              </p>
            </div>
            {activeTab === 'overview' && (
              <Button variant="secondary" onClick={loadUserStats} disabled={statsLoading} className="shrink-0">
                {statsLoading ? '🔄' : '🔄'} Refresh Stats
              </Button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6 flex-wrap">
          {[
            { id: 'overview' as const, label: 'Play', icon: '🎮' },
            { id: 'rooms' as const, label: 'Multiplayer', icon: '👥' },
            { id: 'quiz' as const, label: 'My Stats', icon: '📊' },
            ...(user?.role === 'ADMIN' || user?.role === 'HOST' 
              ? [{ id: 'admin' as const, label: 'Admin Tools', icon: '🛠️' }] 
              : []
            ),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200 dark:bg-secondary-800 dark:text-secondary-300 dark:hover:bg-secondary-700'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'quiz' && (
          <QuizDashboard
            onStartNewQuiz={handleStartNewQuiz}
            onViewSession={handleViewSession}
          />
        )}

        {activeTab === 'overview' && (
          <div>
            {/* Main Game Mode Cards */}
            <div className="grid gap-8 md:grid-cols-3 mb-12">
              {/* Play Alone */}
              <div onClick={handleStartNewQuiz} className="cursor-pointer">
                <Card className="transform hover:scale-105 transition-transform duration-200 border-2 hover:border-primary-500">
                  <CardContent className="p-8 text-center">
                  <div className="mb-6">
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-4xl mb-4">
                      🎯
                    </div>
                    <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">
                      Play Quiz Alone
                    </h3>
                    <p className="text-secondary-600 dark:text-secondary-400">
                      Test your knowledge solo. Choose your favorite categories or go random!
                    </p>
                  </div>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3">
                    🚀 Start Solo Quiz
                  </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Play 1vs1 */}
              <div onClick={() => router.push('/1vs1')} className="cursor-pointer">
                <Card className="transform hover:scale-105 transition-transform duration-200 border-2 hover:border-red-500">
                  <CardContent className="p-8 text-center">
                    <div className="mb-6">
                      <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-4xl mb-4">
                        ⚔️
                      </div>
                      <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">
                        Play 1 vs 1
                      </h3>
                      <p className="text-secondary-600 dark:text-secondary-400">
                        Challenge another player in real-time. May the best mind win!
                      </p>
                    </div>
                    <Button 
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3"
                      disabled={!connectionStatus.isConnected}
                    >
                      {connectionStatus.isConnected ? (
                        <>⚔️ Start 1vs1 Battle</>
                      ) : (
                        <>🔌 Connecting...</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Play in Room */}
              <div onClick={() => handleTabChange('rooms')} className="cursor-pointer">
                <Card className="transform hover:scale-105 transition-transform duration-200 border-2 hover:border-green-500">
                  <CardContent className="p-8 text-center">
                  <div className="mb-6">
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-4xl mb-4">
                      👥
                    </div>
                    <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">
                      Play in Room
                    </h3>
                    <p className="text-secondary-600 dark:text-secondary-400">
                      Join or create multiplayer quiz rooms. Play with friends or strangers!
                    </p>
                  </div>
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
                    disabled={!connectionStatus.isConnected}
                  >
                    {connectionStatus.isConnected ? (
                      <>👥 Join Multiplayer</>
                    ) : (
                      <>🔌 Connecting...</>
                    )}
                  </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/20">
                      <span className="text-2xl">🏆</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                        Quizzes Taken
                      </p>
                      <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                        {statsLoading ? '...' : (userStats?.totalQuizzesCompleted || 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-100 dark:bg-success-900/20">
                      <span className="text-2xl">📊</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                        Average Score
                      </p>
                      <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                        {statsLoading ? '...' : userStats?.averageScore ? `${Math.round(userStats.averageScore)}` : '0'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-100 dark:bg-warning-900/20">
                      <span className="text-2xl">🎯</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                        Best Streak
                      </p>
                      <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                        {statsLoading ? '...' : (userStats?.longestStreak || 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
                      <span className="text-2xl">⭐</span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                        Perfect Scores
                      </p>
                      <p className="text-xl font-semibold text-secondary-900 dark:text-white">
                        {statsLoading ? '...' : (userStats?.perfectQuizzes || 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity Section */}
            {recentQuizzes.length > 0 && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-secondary-900 dark:text-white">
                    Recent Quiz Activity 🎯
                  </h2>
                  <Button variant="secondary" onClick={() => handleTabChange('quiz')}>
                    View All History
                  </Button>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  {recentQuizzes.map((quiz, index) => (
                    <div key={index} className="cursor-pointer" onClick={() => handleViewSession(quiz.sessionId)}>
                      <Card className="hover:shadow-lg transition-shadow">
                        <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-secondary-900 dark:text-white truncate">
                            {quiz.title || 'Untitled Quiz'}
                          </h3>
                          <div className="text-right">
                            <div className="text-lg font-bold text-primary-600">
                              {Math.round(quiz.scorePercentage)}%
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-sm text-secondary-600 dark:text-secondary-400 mb-2">
                          {quiz.correctAnswers}/{quiz.totalQuestions} correct • {quiz.totalScore} points
                        </div>
                        
                        <div className="text-xs text-secondary-500">
                          {new Date(quiz.completedAt).toLocaleDateString()} at {' '}
                          {new Date(quiz.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        
                        {quiz.achievements && quiz.achievements.length > 0 && (
                          <div className="mt-2 flex gap-1">
                            {quiz.achievements.slice(0, 3).map((achievement: any, i: number) => (
                              <span key={i} className="text-sm" title={achievement}>
                                🏆
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Call to Action */}
            <Card className="bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 border-primary-200 dark:border-primary-800">
              <CardContent className="p-6 text-center">
                <h3 className="text-xl font-bold text-secondary-900 dark:text-white mb-2">
                  🎮 New to QuizMaster Pro?
                </h3>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Jump right in with a solo quiz! Choose your favorite topics or try our random mix for a surprise challenge.
                </p>
                <Button 
                  onClick={handleStartNewQuiz}
                  className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3"
                >
                  🚀 Play Your First Quiz
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'rooms' && (
          <div className="space-y-8">
            {/* Room Actions */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Quick Join */}
              <QuickJoin onRoomJoined={handleRoomJoined} />

              {/* Create Room */}
              <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <CardContent className="p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Create Room
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Host your own multiplayer quiz room and invite friends
                    </p>
                  </div>
                  <Button 
                    onClick={() => setShowCreateRoomModal(true)}
                    disabled={!connectionStatus.isConnected}
                    className="w-full"
                  >
                    {connectionStatus.isConnected ? (
                      <>🏠 Create New Room</>
                    ) : (
                      <>🔌 Connecting...</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Connection Status Alert */}
            {!connectionStatus.isConnected && (
              <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
                        ⚠️
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Connection Required
                      </h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        {connectionStatus.error 
                          ? `Connection failed: ${connectionStatus.error}`
                          : connectionStatus.isReconnecting
                            ? 'Reconnecting to enable multiplayer features...'
                            : 'Connecting to enable multiplayer features...'
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Public Rooms List */}
            {connectionStatus.isConnected && (
              <RoomList onJoinRoom={handleRoomJoined} />
            )}
          </div>
        )}

        {activeTab === 'admin' && (user?.role === 'ADMIN' || user?.role === 'HOST') && (
          <div>
            <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-4">
              Admin Tools
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Question Management */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                    Question Management
                  </h3>
                  <p className="text-secondary-600 dark:text-secondary-400">
                    Create, edit, and organize questions for your quizzes.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full" 
                    onClick={() => window.location.href = '/admin/questions'}
                  >
                    Manage Questions
                  </Button>
                </CardContent>
              </Card>

              {/* Category Management */}
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                    Category Management
                  </h3>
                  <p className="text-secondary-600 dark:text-secondary-400">
                    Organize questions into categories and subcategories.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => window.location.href = '/admin/categories'}
                  >
                    Manage Categories
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={showCreateRoomModal}
        onClose={() => setShowCreateRoomModal(false)}
        onRoomCreated={handleRoomCreated}
      />
    </div>
  );
}
