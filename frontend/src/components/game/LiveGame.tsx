'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '@/hooks/useGame';
import { useGameStore } from '@/stores/gameStore';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { GameQuestion, QuestionResult, GamePlayer } from '@/types/game';
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrophyIcon,
  FireIcon,
  BoltIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface LiveGameProps {
  roomId: string;
}

function QuestionTimer({ timeRemaining, totalTime }: { timeRemaining: number; totalTime: number }) {
  const percentage = totalTime > 0 ? (timeRemaining / totalTime) * 100 : 0;
  const seconds = Math.ceil(timeRemaining / 1000);
  
  const getTimerColor = () => {
    if (percentage > 60) return 'bg-green-500';
    if (percentage > 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTextColor = () => {
    if (percentage > 60) return 'text-green-600 dark:text-green-400';
    if (percentage > 30) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <ClockIcon className={`w-5 h-5 ${getTextColor()}`} />
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Time Remaining
          </span>
        </div>
        <span className={`text-xl font-bold ${getTextColor()}`}>
          {seconds}s
        </span>
      </div>
      
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-200 ${getTimerColor()}`}
          style={{ width: `${Math.max(0, percentage)}%` }}
        />
      </div>
      
      {seconds <= 5 && seconds > 0 && (
        <div className="text-center mt-2">
          <span className="text-red-500 font-bold animate-pulse">
            {seconds}
          </span>
        </div>
      )}
    </div>
  );
}

function QuestionDisplay({ question, onAnswerSelect, selectedAnswer, hasAnswered, timeRemaining }: {
  question: GameQuestion;
  onAnswerSelect: (answer: any) => void;
  selectedAnswer: any;
  hasAnswered: boolean;
  timeRemaining: number;
}) {
  const canAnswer = timeRemaining > 0 && !hasAnswered;
  
  const renderOptions = () => {
    if (question.questionType === 'MULTIPLE_CHOICE' && question.options?.options) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {question.options.options.map((option: any, index: number) => {
            const isSelected = selectedAnswer === option.value || selectedAnswer === option;
            const isLocked = hasAnswered; // Only lock after submission, not selection
            
            return (
              <button
                key={index}
                onClick={() => canAnswer && onAnswerSelect(option.value || option)}
                disabled={!canAnswer}
                className={`p-4 text-left rounded-lg border-2 transition-all duration-200 ${
                  isSelected && isLocked
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 ring-2 ring-green-200 dark:ring-green-800'
                    : isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                } ${
                  !canAnswer 
                    ? 'opacity-60 cursor-not-allowed' 
                    : 'hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    isSelected && isLocked
                      ? 'border-green-500 bg-green-500'
                      : isSelected 
                      ? 'border-blue-500 bg-blue-500' 
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {isSelected && (
                      <CheckCircleIcon className={`w-4 h-4 text-white ${isLocked ? 'animate-pulse' : ''}`} />
                    )}
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {option.label || option.text || option}
                  </span>
                  {isSelected && isLocked && (
                    <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-1 rounded-full ml-auto">
                      Submitted ✓
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      );
    }
    
    if (question.questionType === 'TRUE_FALSE') {
      return (
        <div className="grid grid-cols-2 gap-3">
          {[{ value: true, label: 'True' }, { value: false, label: 'False' }].map((option) => {
            const isSelected = selectedAnswer === option.value;
            const isLocked = hasAnswered; // Only lock after submission, not selection
            
            return (
              <button
                key={option.value.toString()}
                onClick={() => canAnswer && onAnswerSelect(option.value)}
                disabled={!canAnswer}
                className={`p-4 text-center rounded-lg border-2 transition-all duration-200 ${
                  isSelected && isLocked
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 ring-2 ring-green-200 dark:ring-green-800'
                    : isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                } ${
                  !canAnswer 
                    ? 'opacity-60 cursor-not-allowed' 
                    : 'hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <span className="font-bold text-xl text-gray-900 dark:text-white">
                    {option.label}
                  </span>
                  {isSelected && isLocked && (
                    <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                      Submitted ✓
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      );
    }
    
    if (question.questionType === 'TEXT_INPUT') {
      return (
        <div>
          <input
            type="text"
            value={selectedAnswer || ''}
            onChange={(e) => canAnswer && onAnswerSelect(e.target.value)}
            disabled={!canAnswer}
            placeholder="Type your answer..."
            className={`w-full p-4 border-2 rounded-lg text-lg ${
              !canAnswer 
                ? 'opacity-60 cursor-not-allowed border-gray-200 dark:border-gray-600' 
                : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:outline-none'
            } bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
          />
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      {/* Question Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Badge variant="outline">
            Question {question.questionIndex + 1}
          </Badge>
          <Badge variant="secondary">
            {question.points} pts
          </Badge>
          {question.categories && question.categories.length > 0 && (
            <Badge variant="outline">
              {question.categories[0]?.name}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
          <UserGroupIcon className="w-4 h-4" />
          <span>{question.answeredCount}/{question.totalPlayers} answered</span>
        </div>
      </div>

      {/* Question Text */}
      <div className="mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white leading-relaxed">
          {question.questionText}
        </h2>
      </div>

      {/* Answer Options */}
      <div className="mb-6">
        {renderOptions()}
      </div>

      {/* Status */}
      {hasAnswered && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center space-x-2 text-green-700 dark:text-green-300">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="font-medium">Answer submitted! Waiting for other players...</span>
          </div>
        </div>
      )}

      {!hasAnswered && timeRemaining <= 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center space-x-2 text-red-700 dark:text-red-300">
            <XCircleIcon className="w-5 h-5" />
            <span className="font-medium">Time's up!</span>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionResults({ result, currentPlayer }: { result: QuestionResult; currentPlayer: GamePlayer | null }) {
  const myResult = result.playerResults.find(pr => pr.userId === currentPlayer?.userId);
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Question Results
        </h2>
        
        {/* My Result */}
        {myResult && (
          <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full ${
            myResult.isCorrect 
              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}>
            {myResult.isCorrect ? (
              <CheckCircleIcon className="w-5 h-5" />
            ) : (
              <XCircleIcon className="w-5 h-5" />
            )}
            <span className="font-medium">
              {myResult.isCorrect ? 'Correct!' : 'Incorrect'}
            </span>
            <span className="font-bold">
              +{myResult.pointsEarned} points
            </span>
            <span className="text-sm">
              ({(myResult.timeTaken / 1000).toFixed(1)}s)
            </span>
          </div>
        )}
      </div>

      {/* Correct Answer */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
        <h3 className="font-medium text-green-800 dark:text-green-300 mb-2">
          Correct Answer:
        </h3>
        <p className="text-green-700 dark:text-green-300 font-medium">
          {JSON.stringify(result.correctAnswer)}
        </p>
        
        {result.explanation && (
          <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
            <p className="text-green-700 dark:text-green-300 text-sm">
              {result.explanation}
            </p>
          </div>
        )}
      </div>

      {/* Answer Breakdown */}
      {Object.keys(result.answerBreakdown).length > 0 && (
        <div className="mb-6">
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">
            How everyone answered:
          </h3>
          
          <div className="space-y-2">
            {Object.entries(result.answerBreakdown).map(([answer, data]) => (
              <div key={answer} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded ${
                    data.isCorrect ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="text-gray-900 dark:text-white">
                    {answer}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        data.isCorrect ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-12 text-right">
                    {data.percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Performers */}
      {result.playerResults.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">
            Top Performers:
          </h3>
          
          <div className="space-y-2">
            {result.playerResults
              .sort((a, b) => {
                if (a.isCorrect !== b.isCorrect) {
                  return a.isCorrect ? -1 : 1;
                }
                return a.timeTaken - b.timeTaken;
              })
              .slice(0, 5)
              .map((player, index) => (
                <div key={player.userId} className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-orange-600' : 'bg-blue-500'
                    }`}>
                      {index + 1}
                    </div>
                    
                    <span className={`font-medium ${
                      player.userId === currentPlayer?.userId 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {player.username}
                      {player.userId === currentPlayer?.userId && ' (You)'}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {player.isCorrect ? (
                      <CheckCircleIcon className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircleIcon className="w-4 h-4 text-red-500" />
                    )}
                    
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      +{player.pointsEarned} pts
                    </span>
                    
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {(player.timeTaken / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveScoreboard({ leaderboard, players, currentPlayer }: { 
  leaderboard: any[]; 
  players: GamePlayer[]; 
  currentPlayer: GamePlayer | null;
}) {
  // Use leaderboard data if available, otherwise fall back to sorted players
  const displayData = leaderboard.length > 0 
    ? leaderboard.map((entry, index) => {
        // Find matching player for additional info
        const player = players.find(p => p.userId === entry.userId);
        return {
          ...entry,
          rank: index + 1,
          username: entry.username || player?.username || 'Unknown',
          correctAnswers: entry.correctAnswers ?? player?.correctAnswers ?? 0,
          questionsAnswered: entry.questionsAnswered ?? player?.questionsAnswered ?? 0
        };
      })
    : [...players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.averageTime - b.averageTime;
      }).map((player, index) => ({
        ...player,
        rank: index + 1
      }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
      <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
        <TrophyIcon className="w-5 h-5 text-yellow-500" />
        <span>Live Scoreboard</span>
      </h3>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {displayData.map((entry, index) => (
          <div
            key={entry.userId}
            className={`flex items-center justify-between p-2 rounded ${
              entry.userId === currentPlayer?.userId
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                : 'bg-gray-50 dark:bg-gray-700/50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                index === 0 ? 'bg-yellow-500' :
                index === 1 ? 'bg-gray-400' :
                index === 2 ? 'bg-orange-600' : 'bg-blue-500'
              }`}>
                {entry.rank || index + 1}
              </div>
              
              <span className={`font-medium ${
                entry.userId === currentPlayer?.userId
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-gray-900 dark:text-white'
              }`}>
                {entry.username}
                {entry.userId === currentPlayer?.userId && ' (You)'}
              </span>
              
              {(entry.currentStreak || entry.streak || 0) > 1 && (
                <div className="flex items-center space-x-1 text-orange-500">
                  <FireIcon className="w-3 h-3" />
                  <span className="text-xs font-bold">
                    {entry.currentStreak || entry.streak}
                  </span>
                </div>
              )}
            </div>
            
            <div className="text-right">
              <div className="font-bold text-gray-900 dark:text-white">
                {(entry.score || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {entry.correctAnswers || 0}/{entry.questionsAnswered || 0}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LiveGame({ roomId }: LiveGameProps) {
  const { submitAnswer } = useGame();
  const {
    currentQuestion,
    timeRemaining,
    hasAnswered,
    selectedAnswer,
    showQuestionResults,
    questionResult,
    currentGame,
    currentPlayer,
    gameStatus,
    leaderboard
  } = useGameStore();
  
  const questionStartTimeRef = useRef<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleAnswerSelect = (answer: any) => {
    // Allow answer changes until submission (professional quiz experience)
    if (hasAnswered) {
      toast.error('Answer already submitted. Wait for the next question.');
      return;
    }
    
    useGameStore.setState({ selectedAnswer: answer });
  };

  const handleSubmitAnswer = async () => {
    if (!currentQuestion || selectedAnswer === null || selectedAnswer === undefined || hasAnswered || isSubmitting) return;
    
    const timeTaken = Date.now() - questionStartTimeRef.current;
    
    setIsSubmitting(true);
    try {
      // Immediately set hasAnswered to hide submit button and disable answer changes
      useGameStore.setState({ hasAnswered: true });
      
      await submitAnswer(
        currentQuestion.id,
        currentQuestion.questionIndex,
        selectedAnswer,
        timeTaken
      );
      
      toast.success('Answer submitted successfully!');
    } catch (error) {
      console.error('Failed to submit answer:', error);
      toast.error('Failed to submit answer');
      
      // Reset hasAnswered if submission failed
      useGameStore.setState({ hasAnswered: false });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-submit answer when time runs out
  useEffect(() => {
    if (timeRemaining <= 0 && selectedAnswer !== null && selectedAnswer !== undefined && !hasAnswered) {
      handleSubmitAnswer();
    }
  }, [timeRemaining, selectedAnswer, hasAnswered]);

  // Track question start time and reset submit state
  useEffect(() => {
    if (currentQuestion && gameStatus === 'IN_PROGRESS') {
      questionStartTimeRef.current = Date.now();
      setIsSubmitting(false); // Reset submitting state for new question
      
      // Ensure hasAnswered is reset for new question (should be handled by game store, but ensure it)
      if (hasAnswered) {
        useGameStore.setState({ hasAnswered: false, selectedAnswer: null });
      }
    }
  }, [currentQuestion, gameStatus, hasAnswered]);

  // Loading state
  if (!currentGame || (!currentQuestion && !questionResult)) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600 dark:text-gray-400 mt-4">
            Loading game...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Timer */}
          {currentQuestion && gameStatus === 'IN_PROGRESS' && (
            <QuestionTimer
              timeRemaining={timeRemaining}
              totalTime={currentQuestion.timeLimit}
            />
          )}

          {/* Question Display */}
          {currentQuestion && gameStatus === 'IN_PROGRESS' && !showQuestionResults && (
            <>
              <QuestionDisplay
                question={currentQuestion}
                onAnswerSelect={handleAnswerSelect}
                selectedAnswer={selectedAnswer}
                hasAnswered={hasAnswered}
                timeRemaining={timeRemaining}
              />
              
              {/* Submit Button */}
              {selectedAnswer !== null && selectedAnswer !== undefined && !hasAnswered && timeRemaining > 0 && (
                <div className="text-center">
                  <Button
                    onClick={handleSubmitAnswer}
                    size="lg"
                    className="min-w-[200px]"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Answer'
                    )}
                  </Button>
                </div>
              )}
              
              {/* Answer Submitted Status */}
              {hasAnswered && !showQuestionResults && (
                <div className="text-center">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center justify-center space-x-2 text-green-700 dark:text-green-300">
                      <CheckCircleIcon className="w-5 h-5" />
                      <span className="font-medium">Answer submitted successfully!</span>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      Waiting for other players to answer...
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Question Results */}
          {showQuestionResults && questionResult && (
            <QuestionResults
              result={questionResult}
              currentPlayer={currentPlayer}
            />
          )}

          {/* Game Status Messages */}
          {gameStatus === 'QUESTION_BREAK' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
              <p className="text-blue-700 dark:text-blue-300 font-medium">
                Get ready for the next question...
              </p>
            </div>
          )}

          {gameStatus === 'PAUSED' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
              <p className="text-yellow-700 dark:text-yellow-300 font-medium">
                Game is paused. Please wait...
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          {(leaderboard && leaderboard.length > 0 || (currentGame && currentGame.players)) && (
            <LiveScoreboard
              leaderboard={leaderboard}
              players={currentGame?.players || []}
              currentPlayer={currentPlayer}
            />
          )}
        </div>
      </div>
    </div>
  );
}
