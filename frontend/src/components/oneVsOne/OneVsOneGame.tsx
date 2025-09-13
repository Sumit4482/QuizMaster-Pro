'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

interface OneVsOneQuestion {
  id: string;
  text: string;
  options: string[];
  difficulty: number;
  timeLimit: number;
}

interface OneVsOnePlayer {
  userId: string;
  username: string;
  isReady: boolean;
  isConnected: boolean;
  score: number;
  correctAnswers: number;
}

interface OneVsOneGameProps {
  question: OneVsOneQuestion;
  questionIndex: number;
  opponent: OneVsOnePlayer | null;
  onSubmitAnswer: (answer: string, timeToAnswer: number) => void;
  onBackToMenu: () => void;
}

export const OneVsOneGame: React.FC<OneVsOneGameProps> = ({
  question,
  questionIndex,
  opponent,
  onSubmitAnswer,
  onBackToMenu,
}) => {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(question.timeLimit);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debug logging
  console.log('OneVsOneGame component rendered with question:', {
    id: question?.id,
    text: question?.text,
    options: question?.options,
    optionsIsArray: Array.isArray(question?.options),
    optionsLength: Array.isArray(question?.options) ? question.options.length : 'NOT_ARRAY',
    difficulty: question?.difficulty,
    timeLimit: question?.timeLimit
  });

  // Reset state when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setIsSubmitted(false);
    setTimeRemaining(question.timeLimit);
    startTimeRef.current = Date.now();
  }, [question.id, question.timeLimit]);

  // Timer countdown
  useEffect(() => {
    if (isSubmitted) return;

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - auto submit
          handleSubmitAnswer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [question.id, isSubmitted]);

  const handleSubmitAnswer = (answer?: string) => {
    if (isSubmitted) return;

    const finalAnswer = answer || selectedAnswer;
    if (!finalAnswer && timeRemaining > 0) {
      alert('Please select an answer');
      return;
    }

    const timeToAnswer = Date.now() - startTimeRef.current;
    setIsSubmitted(true);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    onSubmitAnswer(finalAnswer || '', timeToAnswer);
  };

  const handleAnswerSelect = (answer: string) => {
    if (isSubmitted) return;
    setSelectedAnswer(answer);
  };

  const getTimerColor = () => {
    if (timeRemaining > 15) return 'text-green-600';
    if (timeRemaining > 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTimerBgColor = () => {
    if (timeRemaining > 15) return 'bg-green-500';
    if (timeRemaining > 5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const progressPercentage = (timeRemaining / question.timeLimit) * 100;

  const difficultyColors = {
    1: 'text-green-600',
    2: 'text-yellow-600',
    3: 'text-red-600',
  };

  const difficultyNames = {
    1: 'Easy',
    2: 'Medium', 
    3: 'Hard',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header with scores and timer */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
        {/* Player scores */}
        <div className="flex items-center space-x-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mb-2">
              <span className="text-white font-bold">Y</span>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">You</p>
            <p className="text-lg font-bold text-blue-600">0</p>
          </div>
          
          <div className="text-2xl">⚔️</div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mb-2">
              <span className="text-white font-bold">
                {opponent?.username?.[0]?.toUpperCase() || 'O'}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {opponent?.username || 'Opponent'}
            </p>
            <p className="text-lg font-bold text-red-600">{opponent?.score || 0}</p>
          </div>
        </div>

        {/* Timer */}
        <div className="text-center">
          <div className={`text-4xl font-bold ${getTimerColor()}`}>
            {timeRemaining}
          </div>
          <div className="w-24 h-2 bg-gray-200 rounded-full mt-2">
            <div
              className={`h-full ${getTimerBgColor()} rounded-full transition-all duration-1000 ease-linear`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">seconds</p>
        </div>

        {/* Question info */}
        <div className="text-right">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Question {questionIndex + 1}
          </p>
          <p className={`text-sm font-medium ${difficultyColors[question.difficulty as keyof typeof difficultyColors]}`}>
            {difficultyNames[question.difficulty as keyof typeof difficultyNames]}
          </p>
        </div>
      </div>

      {/* Question card */}
      <Card>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {question.text}
            </h2>
          </div>

          {/* Answer options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {(Array.isArray(question.options) ? question.options : []).map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSelect(option)}
                disabled={isSubmitted}
                className={`p-6 rounded-lg border-2 text-left transition-all duration-200 ${
                  selectedAnswer === option
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                } ${
                  isSubmitted
                    ? 'opacity-75 cursor-not-allowed'
                    : 'hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold ${
                    selectedAnswer === option
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-gray-400 dark:border-gray-500'
                  }`}>
                    {String.fromCharCode(65 + index)}
                  </div>
                  <span className="text-lg font-medium text-gray-900 dark:text-white">
                    {option}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Submit button */}
          {!isSubmitted && (
            <div className="text-center space-y-4">
              <Button
                onClick={() => handleSubmitAnswer()}
                disabled={!selectedAnswer || isSubmitted}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 text-lg rounded-lg"
              >
                Submit Answer ✅
              </Button>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedAnswer ? `Selected: ${selectedAnswer}` : 'Select an answer to continue'}
              </p>
            </div>
          )}

          {isSubmitted && (
            <div className="text-center">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  ✅ Answer Submitted!
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Waiting for results...
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Back button */}
      <div className="text-center">
        <Button
          variant="outline"
          onClick={onBackToMenu}
          className="text-gray-600 hover:text-gray-800"
        >
          ← Leave Battle
        </Button>
      </div>
    </div>
  );
};

