'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Progress } from '@/components/ui/Progress';
import { 
  useQuizSession, 
  useCurrentQuestion, 
  useQuizActions, 
  useQuizStore,
  useQuizLoading,
  useQuizError 
} from '@/stores/quizStore';
import { useTimer } from '@/hooks/useTimer';
import {
  QuizQuestion,
  DIFFICULTY_NAMES,
  getDifficultyColor,
  formatTime,
  getQuestionTypeIcon,
  getQuestionTypeLabel,
} from '@/types/quiz';

interface QuizGameplayProps {
  sessionId: string;
  onQuizComplete?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export const QuizGameplay: React.FC<QuizGameplayProps> = ({
  sessionId,
  onQuizComplete,
  onPause,
  onResume,
}) => {
  const session = useQuizSession();
  const currentQuestion = useCurrentQuestion();
  const isLoading = useQuizLoading();
  const error = useQuizError();
  const lastSubmittedAnswer = useQuizStore((state) => state.lastSubmittedAnswer);
  const {
    loadSession,
    loadCurrentQuestion,
    startSession,
    pauseSession,
    resumeSession,
    submitAnswer,
  } = useQuizActions();

  const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Load session and current question on mount
  useEffect(() => {
    const initializeQuiz = async () => {
      try {
        await loadSession(sessionId);
        const currentSession = useQuizStore.getState().session;
        
        if (currentSession?.status === 'CREATED') {
          await startSession(sessionId);
        }
        
        await loadCurrentQuestion();
      } catch (err) {
        console.error('Failed to initialize quiz:', err);
      }
    };

    initializeQuiz();
  }, [sessionId, loadSession, startSession, loadCurrentQuestion]);

  // Timer for questions with time limits
  const questionTimer = useTimer({
    duration: session?.timePerQuestion || 30,
    onComplete: handleTimeUp,
    onWarning: (warningType) => {
      console.log('Timer warning:', warningType);
      // You can add visual/audio warnings here
    },
  });

  // Start timer when question loads
  useEffect(() => {
    if (currentQuestion && session?.timePerQuestion) {
      questionTimer.reset();
      questionTimer.start(session.timePerQuestion);
    }
    return () => {
      // Clean up timer when component unmounts or question changes
      questionTimer.stop();
    };
  }, [currentQuestion?.id, session?.timePerQuestion]);

  function handleTimeUp() {
    if (currentQuestion && !isSubmitting && !isResuming) {
      handleSubmitAnswer(true); // Submit as skipped
    }
  }

  const handleAnswerSelect = (answer: any) => {
    if (showFeedback || isSubmitting || isResuming) return;
    setSelectedAnswer(answer);
  };

  const handleMultipleChoiceSelect = (optionIndex: number) => {
    if (showFeedback || isSubmitting || isResuming) return;
    
    // Get the actual option text instead of just the index
    if (currentQuestion?.options) {
      const options = Array.isArray(currentQuestion.options) 
        ? currentQuestion.options 
        : currentQuestion.options.options || [];
      
      const selectedOptionText = typeof options[optionIndex] === 'string' 
        ? options[optionIndex] 
        : options[optionIndex]?.text || options[optionIndex];
        
      setSelectedAnswer(selectedOptionText);
    } else {
      setSelectedAnswer(optionIndex);
    }
  };

  const handleTrueFalseSelect = (value: boolean) => {
    if (showFeedback || isSubmitting || isResuming) return;
    setSelectedAnswer(value);
  };

  const handleTextInputChange = (value: string) => {
    if (showFeedback || isSubmitting || isResuming) return;
    setSelectedAnswer(value);
  };

  const handleSubmitAnswer = async (isSkipped = false) => {
    if (!currentQuestion || !session || isSubmitting || isResuming) return;
    
    if (!isSkipped && selectedAnswer === null) {
      alert('Please select an answer');
      return;
    }

    // Extra safety check: if session is paused, don't allow submission
    if (session.status === 'PAUSED') {
      console.warn('Cannot submit answer: session is paused');
      return;
    }

    try {
      setIsSubmitting(true);
      questionTimer.stop();

      const timeTaken = session.timePerQuestion 
        ? session.timePerQuestion - questionTimer.timeRemaining
        : Math.floor((Date.now() - questionTimer.startTime) / 1000);

      await submitAnswer({
        questionId: currentQuestion.id,
        userAnswer: isSkipped ? null : selectedAnswer,
        hintsUsed,
        skipped: isSkipped,
      });

      setShowFeedback(true);

      // Reset for next question
      setTimeout(() => {
        setSelectedAnswer(null);
        setShowFeedback(false);
        setHintsUsed(0);
        setShowHint(false);
        
        // The quiz store will handle navigation to the next question or completion
      }, session.showExplanations ? 3000 : 1500);

    } catch (err) {
      console.error('Failed to submit answer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePause = async () => {
    if (!session || session.status !== 'IN_PROGRESS') return;
    
    try {
      questionTimer.pause();
      await pauseSession(sessionId);
      onPause?.();
    } catch (err) {
      console.error('Failed to pause quiz:', err);
      // Resume the timer if pause failed
      questionTimer.resume();
      alert('Failed to pause quiz. Please try again.');
    }
  };

  const handleResume = async () => {
    if (!session || session.status !== 'PAUSED' || isResuming) return;
    
    try {
      setIsResuming(true);
      await resumeSession(sessionId);
      
      // Wait a brief moment for the state to update and then verify
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify the session was resumed successfully
      const updatedSession = useQuizStore.getState().session;
      if (updatedSession?.status === 'IN_PROGRESS') {
        questionTimer.resume();
        onResume?.();
      } else {
        throw new Error('Session failed to resume properly');
      }
    } catch (err) {
      console.error('Failed to resume quiz:', err);
      alert('Failed to resume quiz. Please try refreshing the page or contact support.');
    } finally {
      setIsResuming(false);
    }
  };

  const handleUseHint = () => {
    if (currentQuestion?.hints && hintsUsed < (currentQuestion.hints as string[]).length) {
      setHintsUsed(hintsUsed + 1);
      setShowHint(true);
    }
  };

  const renderQuestion = () => {
    if (!currentQuestion) return null;

    switch (currentQuestion.questionType) {
      case 'MULTIPLE_CHOICE':
        return renderMultipleChoice();
      case 'TRUE_FALSE':
        return renderTrueFalse();
      case 'TEXT_INPUT':
        return renderTextInput();
      default:
        return <div>Unsupported question type</div>;
    }
  };

  const renderMultipleChoice = () => {
    if (!currentQuestion?.options) return null;

    const options = Array.isArray(currentQuestion.options) 
      ? currentQuestion.options 
      : currentQuestion.options.options || [];

    return (
      <div className="space-y-3">
        {options.map((option: any, index: number) => {
          const optionText = typeof option === 'string' ? option : option.text || option;
          const isSelected = selectedAnswer === optionText;
          
          return (
            <div
              key={index}
              onClick={() => handleMultipleChoiceSelect(index)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              } ${showFeedback ? 'cursor-not-allowed opacity-75' : ''}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {isSelected && (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  )}
                </div>
                <span className="text-gray-900 dark:text-white">
                  {optionText}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTrueFalse = () => {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div
          onClick={() => handleTrueFalseSelect(true)}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all text-center ${
            selectedAnswer === true
              ? 'border-green-500 bg-green-50 dark:bg-green-900'
              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
          } ${showFeedback ? 'cursor-not-allowed opacity-75' : ''}`}
        >
          <div className="text-4xl mb-2">✓</div>
          <span className="text-lg font-medium text-gray-900 dark:text-white">True</span>
        </div>
        <div
          onClick={() => handleTrueFalseSelect(false)}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all text-center ${
            selectedAnswer === false
              ? 'border-red-500 bg-red-50 dark:bg-red-900'
              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
          } ${showFeedback ? 'cursor-not-allowed opacity-75' : ''}`}
        >
          <div className="text-4xl mb-2">✗</div>
          <span className="text-lg font-medium text-gray-900 dark:text-white">False</span>
        </div>
      </div>
    );
  };

  const renderTextInput = () => {
    return (
      <div>
        <textarea
          value={selectedAnswer || ''}
          onChange={(e) => handleTextInputChange(e.target.value)}
          disabled={showFeedback}
          placeholder="Type your answer here..."
          className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
          rows={4}
        />
      </div>
    );
  };

  const renderFeedback = () => {
    if (!showFeedback || !lastSubmittedAnswer) return null;

    return (
      <Card className={`mt-6 p-4 ${
        lastSubmittedAnswer.isCorrect 
          ? 'bg-green-50 border-green-200 dark:bg-green-900 dark:border-green-700' 
          : 'bg-red-50 border-red-200 dark:bg-red-900 dark:border-red-700'
      }`}>
        <div className="flex items-center space-x-2 mb-2">
          <div className={`text-2xl ${lastSubmittedAnswer.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
            {lastSubmittedAnswer.isCorrect ? '✓' : '✗'}
          </div>
          <span className={`font-semibold ${
            lastSubmittedAnswer.isCorrect 
              ? 'text-green-800 dark:text-green-200' 
              : 'text-red-800 dark:text-red-200'
          }`}>
            {lastSubmittedAnswer.isCorrect ? 'Correct!' : 'Incorrect'}
          </span>
          <Badge className="bg-blue-100 text-blue-800">
            +{lastSubmittedAnswer.pointsEarned} points
          </Badge>
        </div>
        
        {lastSubmittedAnswer.explanation && (
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            {lastSubmittedAnswer.explanation}
          </p>
        )}
        
        {!lastSubmittedAnswer.isCorrect && lastSubmittedAnswer.correctAnswer && (
          <p className="text-gray-600 dark:text-gray-400">
            <span className="font-medium">Correct answer:</span> {lastSubmittedAnswer.correctAnswer}
          </p>
        )}

        <div className="flex space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-2">
          <span>Base: +{lastSubmittedAnswer.scoring?.basePoints || 0}</span>
          {lastSubmittedAnswer.scoring?.timeBonus > 0 && (
            <span>Time Bonus: +{lastSubmittedAnswer.scoring.timeBonus}</span>
          )}
          {lastSubmittedAnswer.scoring?.streakBonus > 0 && (
            <span>Streak: +{lastSubmittedAnswer.scoring.streakBonus}</span>
          )}
          {lastSubmittedAnswer.scoring?.difficultyBonus > 0 && (
            <span>Difficulty: +{lastSubmittedAnswer.scoring.difficultyBonus}</span>
          )}
        </div>
      </Card>
    );
  };

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
        <span className="ml-2">Loading quiz...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-600 text-lg mb-4">Error: {error}</div>
        <Button onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-lg mb-4">Quiz completed!</div>
        <Button onClick={onQuizComplete}>
          View Results
        </Button>
      </div>
    );
  }

  const progress = ((session.questionsAnswered / session.totalQuestions) * 100);

  return (
    <div className="max-w-4xl mx-auto p-6 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {session.title || 'Quiz'}
            </h1>
            {session.status === 'PAUSED' && (
              <Badge className="bg-orange-100 text-orange-800">Paused</Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-gray-600 dark:text-gray-400">
              Score: <span className="font-bold text-blue-600">{session.totalScore}</span>
            </span>
            
            {session.timePerQuestion && (
              <div className={`text-lg font-mono ${
                questionTimer.timeRemaining <= 10 
                  ? 'text-red-600 font-bold' 
                  : questionTimer.timeRemaining <= 30
                  ? 'text-yellow-600'
                  : 'text-gray-900 dark:text-white'
              }`}>
                {questionTimer.formatTime()}
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Question {session.currentQuestionIndex + 1} of {session.totalQuestions}</span>
            <span>{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>
      </div>

      {/* Question */}
      <Card className="p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Badge className={getDifficultyColor(currentQuestion.difficultyLevel)}>
            {DIFFICULTY_NAMES[currentQuestion.difficultyLevel]}
          </Badge>
          <Badge className="bg-gray-100 text-gray-800">
            {getQuestionTypeIcon(currentQuestion.questionType)} {getQuestionTypeLabel(currentQuestion.questionType)}
          </Badge>
          <Badge className="bg-green-100 text-green-800">
            {currentQuestion.points} points
          </Badge>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
          {currentQuestion.questionText}
        </h2>

        {renderQuestion()}

        {/* Hint */}
        {currentQuestion.hints && hintsUsed < (currentQuestion.hints as string[]).length && (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUseHint}
              disabled={showFeedback || isResuming}
            >
              Use Hint ({(currentQuestion.hints as string[]).length - hintsUsed} remaining)
            </Button>
          </div>
        )}

        {showHint && currentQuestion.hints && hintsUsed > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <p className="text-yellow-800 dark:text-yellow-200">
              💡 Hint: {(currentQuestion.hints as string[])[hintsUsed - 1]}
            </p>
          </div>
        )}
      </Card>

      {/* Feedback */}
      {renderFeedback()}

      {/* Action Buttons */}
      <div className="flex justify-between mt-8">
        <div className="space-x-2">
          {session.allowPause && session.status === 'IN_PROGRESS' && (
            <Button
              variant="secondary"
              onClick={handlePause}
              disabled={isSubmitting || showFeedback || isResuming}
            >
              Pause Quiz
            </Button>
          )}
          
          {session.status === 'PAUSED' && (
            <Button
              variant="primary"
              onClick={handleResume}
              disabled={isSubmitting || isResuming}
            >
              {isResuming ? 'Resuming...' : 'Resume Quiz'}
            </Button>
          )}
        </div>

        <div className="space-x-2">
          <Button
            variant="secondary"
            onClick={() => handleSubmitAnswer(true)}
            disabled={isSubmitting || showFeedback || isResuming}
          >
            Skip Question
          </Button>
          
          <Button
            variant="primary"
            onClick={() => handleSubmitAnswer(false)}
            disabled={isSubmitting || showFeedback || selectedAnswer === null || isResuming}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Submitting...
              </>
            ) : isResuming ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Resuming...
              </>
            ) : (
              'Submit Answer'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
