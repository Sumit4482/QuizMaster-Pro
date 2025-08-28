'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { LoadingPage } from '@/components/ui/Loading';

export default function HomePage() {
  const { user, isAuthenticated, isLoading, isInitialized } = useAuth();

  // Show loading while auth is initializing
  if (!isInitialized || isLoading) {
    return <LoadingPage message="Loading QuizMaster Pro..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-100 dark:from-secondary-900 dark:to-secondary-950">
      {/* Header */}
      <header className="border-b border-secondary-200 bg-white/80 backdrop-blur-md dark:border-secondary-700 dark:bg-secondary-900/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
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

            {/* Navigation */}
            <div className="flex items-center space-x-4">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-secondary-600 dark:text-secondary-400">
                    Welcome, {user?.firstName || user?.username}!
                  </span>
                  <Link href="/dashboard">
                    <Button size="sm">Dashboard</Button>
                  </Link>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <Link href="/auth/login">
                    <Button variant="outline" size="sm">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/auth/register">
                    <Button size="sm">Get Started</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-secondary-900 dark:text-white sm:text-6xl">
            Industry-Level
            <span className="bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
              {' '}Quiz Platform
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-secondary-600 dark:text-secondary-300">
            Real-time multiplayer quizzes with AI-powered question generation. 
            Perfect for education, training, and entertainment.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex items-center justify-center gap-x-6">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button size="lg">Go to Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/register">
                  <Button size="lg">Start Free Trial</Button>
                </Link>
                <Link href="/auth/login">
                  <Button variant="outline" size="lg">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-20">
          <h2 className="text-center text-3xl font-bold text-secondary-900 dark:text-white">
            Everything you need for engaging quizzes
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <Card className="text-center">
              <CardContent>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/20">
                  <svg
                    className="h-8 w-8 text-primary-600"
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
                <h3 className="mt-6 text-lg font-semibold">Real-time Multiplayer</h3>
                <p className="mt-2 text-secondary-600 dark:text-secondary-400">
                  Up to 50,000 concurrent players with sub-100ms latency for seamless gameplay.
                </p>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="text-center">
              <CardContent>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/20">
                  <svg
                    className="h-8 w-8 text-primary-600"
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
                <h3 className="mt-6 text-lg font-semibold">AI-Powered Questions</h3>
                <p className="mt-2 text-secondary-600 dark:text-secondary-400">
                  Generate unlimited questions on any topic using GPT-4, Claude, and other LLMs.
                </p>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="text-center">
              <CardContent>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/20">
                  <svg
                    className="h-8 w-8 text-primary-600"
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
                <h3 className="mt-6 text-lg font-semibold">Advanced Analytics</h3>
                <p className="mt-2 text-secondary-600 dark:text-secondary-400">
                  Comprehensive insights into player performance and learning progress.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Current Status */}
        <div className="mt-20 text-center">
          <Card className="mx-auto max-w-2xl">
            <CardContent>
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
                🚀 Phase 1.1: Foundation Complete
              </h3>
              <p className="mt-2 text-secondary-600 dark:text-secondary-400">
                ✅ Secure authentication system<br />
                ✅ Responsive UI components<br />
                ✅ Database infrastructure<br />
                ✅ API foundation
              </p>
              <div className="mt-4">
                <div className="h-2 w-full rounded-full bg-secondary-200 dark:bg-secondary-700">
                  <div className="h-2 w-1/4 rounded-full bg-primary-600"></div>
                </div>
                <p className="mt-2 text-sm text-secondary-500">
                  Phase 1.1 of 5 - Authentication & Foundation
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-secondary-200 bg-white dark:border-secondary-700 dark:bg-secondary-900">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm text-secondary-500">
              © 2024 QuizMaster Pro. Built with Next.js, TypeScript, and Tailwind CSS.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
