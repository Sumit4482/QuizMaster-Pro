'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { GameResult, GamePlayer, LeaderboardEntry } from '@/types/game';
import {
  TrophyIcon,
  FireIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  StarIcon,
  BoltIcon
} from '@heroicons/react/24/outline';

interface GameResultsProps {
  result: GameResult;
  currentPlayer: GamePlayer | null;
  onLeaveGame: () => void;
  onPlayAgain?: () => void;
  onPlayNextQuiz?: () => void;
}

function FinalLeaderboard({ leaderboard, currentPlayer }: { 
  leaderboard: LeaderboardEntry[]; 
  currentPlayer: GamePlayer | null; 
}) {
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <TrophyIcon className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <TrophyIcon className="w-6 h-6 text-gray-400" />;
      case 3:
        return <TrophyIcon className="w-6 h-6 text-orange-600" />;
      default:
        return <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-white">{rank}</div>;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-500';
      case 3:
        return 'bg-gradient-to-r from-orange-400 to-orange-600';
      default:
        return 'bg-gradient-to-r from-blue-400 to-blue-600';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
        Final Results
      </h2>

      <div className="space-y-4">
        {leaderboard.map((entry, index) => {
          const isCurrentUser = entry.userId === currentPlayer?.userId;
          
          return (
            <div
              key={entry.userId}
              className={`relative overflow-hidden rounded-lg p-4 ${
                isCurrentUser
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                  : index < 3
                    ? 'bg-gray-50 dark:bg-gray-700/50'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Rank indicator for top 3 */}
              {index < 3 && (
                <div className={`absolute top-0 right-0 w-16 h-16 ${getRankColor(entry.rank)} opacity-10`} 
                     style={{ clipPath: 'polygon(100% 0%, 0% 100%, 100% 100%)' }} />
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {getRankIcon(entry.rank)}
                  
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className={`font-bold text-lg ${
                        isCurrentUser 
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {entry.username}
                        {isCurrentUser && ' (You)'}
                      </span>
                      
                      {entry.rank === 1 && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                          Winner!
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                      <div className="flex items-center space-x-1">
                        <CheckCircleIcon className="w-4 h-4" />
                        <span>{entry.accuracy.toFixed(1)}% accuracy</span>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <ClockIcon className="w-4 h-4" />
                        <span>{(entry.averageTime / 1000).toFixed(1)}s avg</span>
                      </div>
                      
                      {entry.streak > 1 && (
                        <div className="flex items-center space-x-1 text-orange-500">
                          <FireIcon className="w-4 h-4" />
                          <span>{entry.streak} streak</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-2xl font-bold ${
                    isCurrentUser 
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-white'
                  }`}>
                    {entry.score.toLocaleString()}
                  </div>
                  
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {entry.questionsAnswered} questions
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameStats({ result, currentPlayer }: { 
  result: GameResult; 
  currentPlayer: GamePlayer | null; 
}) {
  const myEntry = result.finalLeaderboard.find(entry => entry.userId === currentPlayer?.userId);
  const totalQuestions = result.questionCount;
  const gameStats = result.gameStats;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
        Game Statistics
      </h3>

      {/* My Performance */}
      {myEntry && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-3">
            Your Performance
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                #{myEntry.rank}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Final Rank
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {myEntry.score.toLocaleString()}
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Points
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {myEntry.accuracy.toFixed(1)}%
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Accuracy
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {(myEntry.averageTime / 1000).toFixed(1)}s
              </div>
              <div className="text-sm text-blue-600 dark:text-blue-400">
                Avg Time
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overall Game Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="text-center">
          <div className="bg-green-100 dark:bg-green-900/20 rounded-lg p-4">
            <StarIcon className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">
              {gameStats.accuracy.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Overall Accuracy
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="bg-purple-100 dark:bg-purple-900/20 rounded-lg p-4">
            <BoltIcon className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-purple-600">
              {(gameStats.averageResponseTime / 1000).toFixed(1)}s
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Avg Response Time
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="bg-orange-100 dark:bg-orange-900/20 rounded-lg p-4">
            <CheckCircleIcon className="w-8 h-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-600">
              {gameStats.completionRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Completion Rate
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionBreakdown({ questionResults }: { questionResults: any[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
        Question Breakdown
      </h3>

      <div className="space-y-4 max-h-64 overflow-y-auto">
        {questionResults.map((question, index) => (
          <div 
            key={question.questionId} 
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>
              
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  Question {index + 1}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {question.correctAnswerRate.toFixed(1)}% correct
                </div>
              </div>
            </div>
            
            <div className="text-right text-sm text-gray-600 dark:text-gray-400">
              <div>Fastest: {(question.fastestAnswer / 1000).toFixed(1)}s</div>
              <div>Slowest: {(question.slowestAnswer / 1000).toFixed(1)}s</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GameResults({ result, currentPlayer, onLeaveGame, onPlayAgain, onPlayNextQuiz }: GameResultsProps) {
  const myEntry = result.finalLeaderboard.find(entry => entry.userId === currentPlayer?.userId);
  const duration = Math.round(result.totalDuration / 1000 / 60); // minutes

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          Game Complete! 🎉
        </h1>
        
        <div className="flex items-center justify-center space-x-6 text-gray-600 dark:text-gray-400">
          <div className="flex items-center space-x-1">
            <ClockIcon className="w-4 h-4" />
            <span>{duration} minutes</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <span>{result.questionCount} questions</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <span>{result.playerCount} players</span>
          </div>
        </div>

        {myEntry && (
          <div className="mt-4">
            {myEntry.rank === 1 ? (
              <Badge variant="default" className="text-lg py-2 px-4 bg-yellow-500 text-white">
                🏆 Congratulations! You won!
              </Badge>
            ) : myEntry.rank <= 3 ? (
              <Badge variant="outline" className="text-lg py-2 px-4">
                🎖️ Great job! You finished #{myEntry.rank}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-lg py-2 px-4">
                Good game! You finished #{myEntry.rank}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Main Results */}
        <div className="lg:col-span-2">
          <FinalLeaderboard 
            leaderboard={result.finalLeaderboard}
            currentPlayer={currentPlayer}
          />
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          <GameStats result={result} currentPlayer={currentPlayer} />
          <QuestionBreakdown questionResults={result.questionResults} />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4 flex-wrap gap-4">
        <Button
          onClick={onLeaveGame}
          variant="outline"
          size="lg"
        >
          Leave Room
        </Button>
        
        {onPlayNextQuiz && (
          <Button
            onClick={onPlayNextQuiz}
            variant="secondary"
            size="lg"
          >
            🎯 Play Next Quiz
          </Button>
        )}
        
        {onPlayAgain && (
          <Button
            onClick={onPlayAgain}
            variant="primary"
            size="lg"
          >
            🔄 Play Same Quiz Again
          </Button>
        )}
      </div>
    </div>
  );
}
