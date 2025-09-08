'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface GameStartingScreenProps {
  roomId: string;
}

export function GameStartingScreen({ roomId }: GameStartingScreenProps) {
  const [countdown, setCountdown] = useState(5); // Increased to allow for AI loading
  const [isReady, setIsReady] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'preparing' | 'ai_generating' | 'starting' | 'ready'>('preparing');
  const { currentGame, gameStatus } = useGameStore();

  // Detect if this is an AI game
  const isAIGame = currentGame?.config?.useAI || false;
  const aiTopic = currentGame?.config?.aiTopic;

  // Loading phase management for better UX
  useEffect(() => {
    let phaseTimer: NodeJS.Timeout | undefined;
    
    if (countdown > 0) {
      // Initial phase based on game type
      if (isAIGame && loadingPhase === 'preparing') {
        setLoadingPhase('ai_generating');
        // AI games get extra loading time
        phaseTimer = setTimeout(() => {
          setLoadingPhase('starting');
        }, 2000);
      } else if (!isAIGame && loadingPhase === 'preparing') {
        setLoadingPhase('starting');
      }
      
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000); // Standard countdown speed
      
      return () => {
        clearTimeout(timer);
        if (phaseTimer) clearTimeout(phaseTimer);
      };
    } else {
      setLoadingPhase('ready');
      setIsReady(true);
    }
    
    // Return undefined explicitly for the case where countdown <= 0
    return undefined;
  }, [countdown, isAIGame, loadingPhase]);

  // Auto-transition effect - if game status changes to IN_PROGRESS, we're ready
  useEffect(() => {
    if (gameStatus === 'IN_PROGRESS') {
      setIsReady(true);
      setCountdown(0);
      setLoadingPhase('ready');
    }
  }, [gameStatus]);

  // Get loading message based on phase and game type
  const getLoadingMessage = () => {
    switch (loadingPhase) {
      case 'preparing':
        return 'Preparing quiz...';
      case 'ai_generating':
        return isAIGame && aiTopic 
          ? `🤖 AI generating questions for "${aiTopic}"...`
          : '🤖 AI generating questions...';
      case 'starting':
        return countdown > 0 ? `Starting in ${countdown}...` : 'Starting now...';
      case 'ready':
        return 'Ready! Loading first question...';
      default:
        return 'Preparing quiz...';
    }
  };

  // Get loading icon/animation based on phase
  const getLoadingContent = () => {
    if (loadingPhase === 'ai_generating') {
      return (
        <div className="mb-6">
          <div className="relative">
            <div className="text-6xl mb-4 animate-pulse">🤖</div>
            <LoadingSpinner size="lg" />
            <div className="absolute -top-2 -right-2">
              <div className="animate-ping">✨</div>
            </div>
          </div>
        </div>
      );
    } else if (countdown > 0 && loadingPhase === 'starting') {
      return (
        <div className="relative inline-block mb-6">
          <div className="text-8xl font-bold text-blue-500 animate-pulse">
            {countdown}
          </div>
          <div className="absolute inset-0 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
        </div>
      );
    } else if (isReady || loadingPhase === 'ready') {
      return (
        <div className="mb-6">
          <div className="text-6xl font-bold text-green-500 mb-4">
            ✓
          </div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        </div>
      );
    } else {
      return (
        <div className="mb-6">
          <LoadingSpinner size="lg" />
        </div>
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 text-center">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            🎮 Get Ready!
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {isAIGame ? '🤖 AI-Powered Quiz Starting' : '📚 Library Quiz Starting'}
          </p>
          {isAIGame && aiTopic && (
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
              Topic: {aiTopic}
            </p>
          )}
        </div>

        {/* Loading Content */}
        <div className="mb-8">
          {getLoadingContent()}
          <p className="text-xl text-gray-700 dark:text-gray-300 font-semibold">
            {getLoadingMessage()}
          </p>
          
          {/* Progress indicator for AI generation */}
          {loadingPhase === 'ai_generating' && (
            <div className="mt-4 max-w-xs mx-auto">
              <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Please wait while AI creates your questions...
              </p>
            </div>
          )}
        </div>

        {/* Game Info */}
        {currentGame && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {isAIGame ? '🤖 AI Quiz Information' : '📚 Quiz Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">
                  {currentGame.totalQuestions}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Questions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">
                  {currentGame.playerCount}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Players</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-500">
                  {currentGame.currentQuestionIndex + 1}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Next Question</div>
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="text-left bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
            💡 Quick Tips:
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <li>• Read questions carefully before answering</li>
            <li>• Faster correct answers earn bonus points</li>
            <li>• Watch out for consecutive correct answer streaks</li>
            {isAIGame && <li>• 🤖 AI-generated questions may be more creative!</li>}
            <li>• Stay focused and have fun!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
