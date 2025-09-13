'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useRequireAuth } from '@/hooks/useAuth';
import { useSocketContext } from '@/contexts/SocketContext';
import { LoadingPage } from '@/components/ui/Loading';
import { OneVsOneMatchmaking } from '@/components/oneVsOne/OneVsOneMatchmaking';
import { OneVsOneGame } from '@/components/oneVsOne/OneVsOneGame';
import { OneVsOneResults } from '@/components/oneVsOne/OneVsOneResults';

type OneVsOnePhase = 'setup' | 'searching' | 'found' | 'ready' | 'playing' | 'results';

interface OneVsOnePlayer {
  userId: string;
  username: string;
  isReady: boolean;
  isConnected: boolean;
  score: number;
  correctAnswers: number;
}

interface OneVsOneQuestion {
  id: string;
  text: string;
  options: string[];
  difficulty: number;
  timeLimit: number;
}

interface OneVsOneMatchResult {
  gameId: string;
  winnerId?: string;
  isDraw: boolean;
  player1Score: number;
  player2Score: number;
  totalQuestions: number;
  gameDuration: number;
}

export default function OneVsOnePage() {
  const { user, isLoading } = useAuth();
  const { socket, connectionStatus } = useSocketContext();
  const router = useRouter();
  
  // Require authentication for this page
  const { isAuthenticated, isInitialized } = useRequireAuth();
  
  const [phase, setPhase] = useState<OneVsOnePhase>('setup');
  const [gameId, setGameId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<OneVsOnePlayer | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<OneVsOneQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameResults, setGameResults] = useState<OneVsOneMatchResult | null>(null);
  
  // Show loading while checking authentication
  if (!isInitialized || isLoading || !isAuthenticated) {
    return <LoadingPage message="Loading 1vs1..." />;
  }

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Match found
    const handleMatchFound = (data: { gameId: string; opponent: OneVsOnePlayer }) => {
      console.log('1vs1 match found:', data);
      setGameId(data.gameId);
      setOpponent(data.opponent);
      setPhase('found');
    };

    // Game starting
    const handleGameStarting = (data: { countdown: number }) => {
      console.log('1vs1 game starting:', data);
      setCountdown(data.countdown);
      setPhase('ready');
    };

    // Question received
    const handleQuestion = (data: { question: OneVsOneQuestion; questionIndex: number }) => {
      console.log('1vs1 question received:', data);
      console.log('Question details:', {
        id: data.question?.id,
        text: data.question?.text,
        options: data.question?.options,
        optionsType: typeof data.question?.options,
        optionsLength: Array.isArray(data.question?.options) ? data.question.options.length : 'NOT_ARRAY',
        difficulty: data.question?.difficulty,
        timeLimit: data.question?.timeLimit
      });
      
      setCurrentQuestion(data.question);
      setQuestionIndex(data.questionIndex);
      setPhase('playing');
      setCountdown(null);
    };

    // Round result
    const handleRoundResult = (data: any) => {
      console.log('1vs1 round result:', data);
      
      // Update opponent score if provided
      if (data.currentScores && opponent) {
        const updatedOpponent = {
          ...opponent,
          score: data.currentScores.player2 || opponent.score
        };
        setOpponent(updatedOpponent);
      }
    };

    // Game finished
    const handleGameFinished = (data: OneVsOneMatchResult) => {
      console.log('1vs1 game finished:', data);
      setGameResults(data);
      setPhase('results');
    };

    // Opponent disconnected
    const handleOpponentDisconnected = () => {
      console.log('1vs1 opponent disconnected');
      alert('Your opponent disconnected. Returning to menu.');
      setPhase('setup');
      setGameId(null);
      setOpponent(null);
    };

    // Game cancelled
    const handleGameCancelled = (data: { reason: string }) => {
      console.log('1vs1 game cancelled:', data);
      alert(`Game cancelled: ${data.reason}`);
      setPhase('setup');
    };

    // Register event listeners
    socket.on('onevsone:match_found', handleMatchFound);
    socket.on('onevsone:game_starting', handleGameStarting);
    socket.on('onevsone:question', handleQuestion);
    socket.on('onevsone:round_result', handleRoundResult);
    socket.on('onevsone:game_finished', handleGameFinished);
    socket.on('onevsone:opponent_disconnected', handleOpponentDisconnected);
    socket.on('onevsone:game_cancelled', handleGameCancelled);

    // Cleanup
    return () => {
      socket.off('onevsone:match_found', handleMatchFound);
      socket.off('onevsone:game_starting', handleGameStarting);
      socket.off('onevsone:question', handleQuestion);
      socket.off('onevsone:round_result', handleRoundResult);
      socket.off('onevsone:game_finished', handleGameFinished);
      socket.off('onevsone:opponent_disconnected', handleOpponentDisconnected);
      socket.off('onevsone:game_cancelled', handleGameCancelled);
    };
  }, [socket]);

  const handleStartSearch = (searchParams: {
    useAI: boolean;
    aiTopic?: string;
    categoryIds?: number[];
    difficulty: number;
    questionCount: number;
  }) => {
    if (!socket) return;

    setPhase('searching');
    
    socket.emit('onevsone:find_match', {
      userId: user!.id,
      ...searchParams
    }, (response: any) => {
      if (!response.success) {
        alert(`Failed to start search: ${response.error}`);
        setPhase('setup');
      }
    });
  };

  const handleCancelSearch = () => {
    if (!socket) return;
    
    socket.emit('onevsone:cancel_search', {}, (response: any) => {
      console.log('Search cancelled:', response);
      setPhase('setup');
    });
  };

  const handlePlayerReady = () => {
    if (!socket) return;
    
    socket.emit('onevsone:player_ready', {}, (response: any) => {
      if (response.success) {
        console.log('Player marked as ready');
        // Update opponent ready status if needed
      }
    });
  };

  const handleSubmitAnswer = (answer: string, timeToAnswer: number) => {
    if (!socket) return;
    
    socket.emit('onevsone:submit_answer', { answer, timeToAnswer }, (response: any) => {
      if (response.success) {
        console.log('Answer submitted successfully');
      } else {
        console.error('Failed to submit answer:', response.error);
      }
    });
  };

  const handleBackToMenu = () => {
    // Leave game if in one
    if (socket && gameId) {
      socket.emit('onevsone:leave_game', {});
    }
    
    // Reset state
    setPhase('setup');
    setGameId(null);
    setOpponent(null);
    setCurrentQuestion(null);
    setGameResults(null);
  };

  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            ⚔️ 1 vs 1 Battle Arena
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Challenge another player in real-time quiz combat!
          </p>
        </div>

        {/* Connection Status */}
        {!connectionStatus.isConnected && (
          <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 dark:text-yellow-200">
              🔌 Connecting to server... Please wait.
            </p>
          </div>
        )}

        {/* Phase-specific content */}
        {phase === 'setup' && (
          <OneVsOneMatchmaking
            onStartSearch={handleStartSearch}
            onBackToDashboard={handleBackToDashboard}
            isConnected={connectionStatus.isConnected}
          />
        )}

        {phase === 'searching' && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
              <div className="animate-spin w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                🔍 Finding Opponent...
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Searching for a worthy opponent. This may take a moment.
              </p>
              <button
                onClick={handleCancelSearch}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold"
              >
                Cancel Search
              </button>
            </div>
          </div>
        )}

        {phase === 'found' && opponent && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                🎯 Opponent Found!
              </h2>
              <div className="flex items-center justify-center space-x-8 mb-6">
                <div className="text-center">
                  <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="text-2xl text-white">👤</span>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">{user!.username}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">You</p>
                </div>
                <div className="text-4xl">⚔️</div>
                <div className="text-center">
                  <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="text-2xl text-white">👤</span>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-white">{opponent.username}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Opponent</p>
                </div>
              </div>
              <button
                onClick={handlePlayerReady}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold text-lg"
              >
                Ready to Battle! ⚡
              </button>
            </div>
          </div>
        )}

        {phase === 'ready' && countdown !== null && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                🚀 Get Ready!
              </h2>
              <div className="text-8xl font-bold text-red-500 mb-4">
                {countdown}
              </div>
              <p className="text-xl text-gray-600 dark:text-gray-400">
                Battle begins in...
              </p>
            </div>
          </div>
        )}

        {phase === 'playing' && currentQuestion && (
          <OneVsOneGame
            question={currentQuestion}
            questionIndex={questionIndex}
            opponent={opponent}
            onSubmitAnswer={handleSubmitAnswer}
            onBackToMenu={handleBackToMenu}
          />
        )}

        {phase === 'results' && gameResults && (
          <OneVsOneResults
            results={gameResults}
            currentUserId={user!.id}
            opponent={opponent}
            onPlayAgain={() => setPhase('setup')}
            onBackToDashboard={handleBackToDashboard}
          />
        )}
      </div>
    </div>
  );
}

