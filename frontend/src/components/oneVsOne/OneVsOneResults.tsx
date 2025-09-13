'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

interface OneVsOneMatchResult {
  gameId: string;
  winnerId?: string;
  isDraw: boolean;
  player1Score: number;
  player2Score: number;
  totalQuestions: number;
  gameDuration: number;
}

interface OneVsOnePlayer {
  userId: string;
  username: string;
  isReady: boolean;
  isConnected: boolean;
  score: number;
  correctAnswers: number;
}

interface OneVsOneResultsProps {
  results: OneVsOneMatchResult;
  currentUserId: string;
  opponent: OneVsOnePlayer | null;
  onPlayAgain: () => void;
  onBackToDashboard: () => void;
}

export const OneVsOneResults: React.FC<OneVsOneResultsProps> = ({
  results,
  currentUserId,
  opponent,
  onPlayAgain,
  onBackToDashboard,
}) => {
  const isWinner = results.winnerId === currentUserId;
  const isLoser = results.winnerId && results.winnerId !== currentUserId;
  const isDraw = results.isDraw;

  const userScore = results.winnerId === currentUserId ? 
    Math.max(results.player1Score, results.player2Score) :
    Math.min(results.player1Score, results.player2Score);
  
  const opponentScore = results.winnerId === currentUserId ?
    Math.min(results.player1Score, results.player2Score) :
    Math.max(results.player1Score, results.player2Score);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getResultTitle = () => {
    if (isDraw) return '🤝 It\'s a Draw!';
    if (isWinner) return '🏆 Victory!';
    if (isLoser) return '💪 Good Fight!';
    return '🎯 Battle Complete!';
  };

  const getResultSubtitle = () => {
    if (isDraw) return 'You both fought valiantly!';
    if (isWinner) return 'You emerged victorious!';
    if (isLoser) return 'Better luck next time!';
    return 'Thanks for playing!';
  };

  const getResultColor = () => {
    if (isDraw) return 'text-yellow-600';
    if (isWinner) return 'text-green-600';
    if (isLoser) return 'text-red-600';
    return 'text-blue-600';
  };

  const getResultBg = () => {
    if (isDraw) return 'from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20';
    if (isWinner) return 'from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20';
    if (isLoser) return 'from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20';
    return 'from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Main result card */}
      <Card className={`bg-gradient-to-r ${getResultBg()}`}>
        <CardContent className="p-8 text-center">
          <div className="text-6xl mb-4">
            {isDraw ? '🤝' : isWinner ? '🏆' : '⚔️'}
          </div>
          
          <h1 className={`text-4xl font-bold mb-2 ${getResultColor()}`}>
            {getResultTitle()}
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            {getResultSubtitle()}
          </p>

          {/* Score comparison */}
          <div className="flex items-center justify-center space-x-12 mb-8">
            {/* Your score */}
            <div className="text-center">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ${
                isWinner ? 'bg-green-500' : isDraw ? 'bg-yellow-500' : 'bg-red-500'
              }`}>
                <span className="text-3xl text-white">👤</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">You</h3>
              <div className={`text-3xl font-bold ${
                isWinner ? 'text-green-600' : isDraw ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {userScore}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">points</p>
            </div>

            {/* VS */}
            <div className="text-4xl font-bold text-gray-400">VS</div>

            {/* Opponent score */}
            <div className="text-center">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ${
                !isWinner ? 'bg-green-500' : isDraw ? 'bg-yellow-500' : 'bg-red-500'
              }`}>
                <span className="text-3xl text-white">
                  {opponent?.username?.[0]?.toUpperCase() || '👤'}
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {opponent?.username || 'Opponent'}
              </h3>
              <div className={`text-3xl font-bold ${
                !isWinner ? 'text-green-600' : isDraw ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {opponentScore}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">points</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game statistics */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
            📊 Battle Statistics
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {results.totalQuestions}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Total Questions
              </p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {formatDuration(results.gameDuration)}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Battle Duration
              </p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {Math.round(((userScore + opponentScore) / (results.totalQuestions * 200)) * 100)}%
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Combined Accuracy
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <Button
          onClick={onPlayAgain}
          className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold py-3 px-8 text-lg rounded-lg transform hover:scale-105 transition-all duration-200"
        >
          ⚔️ Battle Again
        </Button>
        
        <Button
          variant="outline"
          onClick={onBackToDashboard}
          className="py-3 px-8 text-lg"
        >
          🏠 Back to Dashboard
        </Button>
      </div>

      {/* Motivational message */}
      <div className="text-center">
        <Card className="bg-gray-50 dark:bg-gray-800">
          <CardContent className="p-6">
            <p className="text-lg text-gray-600 dark:text-gray-400">
              {isWinner 
                ? "🎉 Excellent work! Your knowledge and speed made the difference!"
                : isDraw 
                ? "🤝 Perfectly matched! You both showed great skill and knowledge!"
                : "💪 Great effort! Every battle makes you stronger. Try again!"
              }
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

