'use client';

import React, { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { QuizSetup } from '@/components/quiz/QuizSetup';
import { QuizGameplay } from '@/components/quiz/QuizGameplay';
import { QuizResults } from '@/components/quiz/QuizResults';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  useQuizStore, 
  useQuizGamePhase, 
  useQuizSession, 
  useQuizActions, 
  useQuizLoading,
  useQuizError 
} from '@/stores/quizStore';

export default function QuizPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const gamePhase = useQuizGamePhase();
  const session = useQuizSession();
  const isLoading = useQuizLoading();
  const error = useQuizError();
  const { loadSession, setGamePhase, resetQuizState } = useQuizActions();

  const sessionId = searchParams?.get('session');
  const action = searchParams?.get('action'); // 'new', 'continue', 'results'

  // Handle URL parameters and initialize quiz state
  useEffect(() => {
    const initializeQuiz = async () => {
      if (sessionId) {
        try {
          await loadSession(sessionId);
          
          // Determine phase based on session status and URL action
          const currentSession = useQuizStore.getState().session;
          if (currentSession) {
            if (action === 'results' || currentSession.status === 'COMPLETED') {
              setGamePhase('results');
            } else if (currentSession.status === 'IN_PROGRESS') {
              setGamePhase('playing');
            } else if (currentSession.status === 'PAUSED') {
              setGamePhase('paused');
            } else if (currentSession.status === 'CREATED') {
              setGamePhase('setup');
            }
          }
        } catch (err) {
          console.error('Failed to load session:', err);
          // Redirect to setup if session can't be loaded
          setGamePhase('setup');
          router.replace('/quiz');
        }
      } else {
        // No session ID, start with setup
        setGamePhase('setup');
      }
    };

    initializeQuiz();
  }, [sessionId, action, loadSession, setGamePhase, router]);

  // Handle session creation from setup
  const handleSessionCreated = (newSessionId: string) => {
    // Update URL with session ID
    router.push(`/quiz?session=${newSessionId}`);
    setGamePhase('setup'); // Stay in setup phase until user explicitly starts
  };

  // Handle quiz start
  const handleQuizStart = () => {
    setGamePhase('playing');
  };

  // Handle quiz completion
  const handleQuizComplete = () => {
    setGamePhase('results');
    // Update URL to reflect results view
    if (session) {
      router.push(`/quiz?session=${session.id}&action=results`);
    }
  };

  // Handle quiz pause
  const handleQuizPause = () => {
    setGamePhase('paused');
  };

  // Handle quiz resume
  const handleQuizResume = () => {
    setGamePhase('playing');
  };

  // Handle go to dashboard
  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  // Handle retake quiz
  const handleRetakeQuiz = () => {
    if (session) {
      // Create new session with same configuration
      resetQuizState();
      setGamePhase('setup');
      router.push('/quiz');
    }
  };

  // Handle new quiz
  const handleNewQuiz = () => {
    resetQuizState();
    setGamePhase('setup');
    router.push('/quiz');
  };

  // Handle view history
  const handleViewHistory = () => {
    router.push('/dashboard?tab=history');
  };

  // Loading state
  if (isLoading && !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
        <span className="ml-2">Loading quiz...</span>
      </div>
    );
  }

  // Error state
  if (error && gamePhase !== 'setup') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-600 text-lg mb-4">Error: {error}</div>
        <div className="space-x-4">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
          <button
            onClick={handleNewQuiz}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            New Quiz
          </button>
        </div>
      </div>
    );
  }

  // Render appropriate component based on game phase
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {gamePhase === 'setup' && (
        <QuizSetup onSessionCreated={handleSessionCreated} />
      )}
      
      {(gamePhase === 'playing' || gamePhase === 'paused') && session && (
        <div className="relative">
          {gamePhase === 'paused' && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md mx-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Quiz Paused
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Your progress has been saved. You can resume the quiz anytime.
                </p>
                <div className="flex space-x-4">
                  <button
                    onClick={handleQuizResume}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Resume Quiz
                  </button>
                  <button
                    onClick={handleNewQuiz}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    Exit Quiz
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <QuizGameplay
            sessionId={session.id}
            onQuizComplete={handleQuizComplete}
            onPause={handleQuizPause}
            onResume={handleQuizResume}
          />
        </div>
      )}
      
      {(gamePhase === 'results' || gamePhase === 'completed') && session && (
        <QuizResults
          sessionId={session.id}
          onRetakeQuiz={handleRetakeQuiz}
          onNewQuiz={handleNewQuiz}
          onViewHistory={handleViewHistory}
          onDashboard={handleGoToDashboard}
        />
      )}
    </div>
  );
}
