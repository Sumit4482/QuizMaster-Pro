'use client';

import React from 'react';
import { useAuth, useRequireAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { LoadingPage } from '@/components/ui/Loading';

export default function DashboardPage() {
  const { user, logout, isLoading } = useAuth();
  
  // Require authentication for this page
  const { isAuthenticated, isInitialized } = useRequireAuth();

  // Show loading while checking authentication
  if (!isInitialized || isLoading || !isAuthenticated) {
    return <LoadingPage message="Loading dashboard..." />;
  }

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await logout();
    }
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-secondary-900 dark:text-white">
            Welcome back, {user?.firstName || user?.username}! 👋
          </h1>
          <p className="mt-2 text-secondary-600 dark:text-secondary-400">
            Ready to create some amazing quizzes?
          </p>
        </div>

        {/* Quick Stats */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/20">
                  <svg
                    className="h-6 w-6 text-primary-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                    Quizzes Created
                  </p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-white">0</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success-100 dark:bg-success-900/20">
                  <svg
                    className="h-6 w-6 text-success-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                    Games Hosted
                  </p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-white">0</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning-100 dark:bg-warning-900/20">
                  <svg
                    className="h-6 w-6 text-warning-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                    AI Questions Used
                  </p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-white">0</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <div className="flex items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/20">
                  <svg
                    className="h-6 w-6 text-primary-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">
                    Average Score
                  </p>
                  <p className="text-2xl font-semibold text-secondary-900 dark:text-white">-%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Create Quiz */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                Create Your First Quiz
              </h3>
              <p className="text-secondary-600 dark:text-secondary-400">
                Get started by creating a quiz with our question database or AI generation.
              </p>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                Create Quiz (Coming in Phase 2)
              </Button>
            </CardContent>
          </Card>

          {/* Join Game */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                Join a Game
              </h3>
              <p className="text-secondary-600 dark:text-secondary-400">
                Enter a room code to join an existing quiz game.
              </p>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled>
                Join Game (Coming in Phase 2)
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Current Phase Status */}
        <Card className="mt-8">
          <CardHeader>
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              🚀 Development Status
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-secondary-900 dark:text-white">
                  ✅ Phase 1.1: Foundation Complete
                </h4>
                <p className="text-sm text-secondary-600 dark:text-secondary-400">
                  Authentication system, database setup, responsive UI, and security measures.
                </p>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary-200 dark:bg-secondary-700">
                <div className="h-2 w-1/4 rounded-full bg-primary-600"></div>
              </div>
              <p className="text-sm text-secondary-500">
                Next: Phase 2 - Real-Time Multiplayer (WebSocket, game rooms, live gameplay)
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
