import { act, renderHook } from '@testing-library/react';
import { useQuizStore, useQuizActions } from '@/stores/quizStore';
import { QuizSessionStatus } from '@/types/quiz';

// Mock the quiz API
jest.mock('@/utils/quizApi', () => ({
  quizApi: {
    sessions: {
      createSession: jest.fn(),
      getSession: jest.fn(),
      startSession: jest.fn(),
      pauseSession: jest.fn(),
      resumeSession: jest.fn(),
    },
    gameplay: {
      getCurrentQuestion: jest.fn(),
      submitAnswer: jest.fn(),
    },
    results: {
      getQuizResults: jest.fn(),
    },
    statistics: {
      getUserStatistics: jest.fn(),
    },
  },
  handleApiError: jest.fn((error) => error),
}));

const { quizApi } = require('@/utils/quizApi');

describe('QuizStore', () => {
  beforeEach(() => {
    // Reset store state
    useQuizStore.getState().resetQuizState();
    jest.clearAllMocks();
  });

  describe('Setup Form Management', () => {
    it('should update setup form', () => {
      const { result } = renderHook(() => ({
        setupForm: useQuizStore((state) => state.setupForm),
        updateSetupForm: useQuizStore((state) => state.updateSetupForm),
      }));

      act(() => {
        result.current.updateSetupForm({
          title: 'Test Quiz',
          totalQuestions: 10,
          selectedCategories: [1, 2],
        });
      });

      expect(result.current.setupForm.title).toBe('Test Quiz');
      expect(result.current.setupForm.totalQuestions).toBe(10);
      expect(result.current.setupForm.selectedCategories).toEqual([1, 2]);
    });

    it('should reset setup form', () => {
      const { result } = renderHook(() => ({
        setupForm: useQuizStore((state) => state.setupForm),
        updateSetupForm: useQuizStore((state) => state.updateSetupForm),
        resetSetupForm: useQuizStore((state) => state.resetSetupForm),
      }));

      // First, modify the form
      act(() => {
        result.current.updateSetupForm({
          title: 'Modified Quiz',
          totalQuestions: 20,
        });
      });

      expect(result.current.setupForm.title).toBe('Modified Quiz');

      // Then reset it
      act(() => {
        result.current.resetSetupForm();
      });

      expect(result.current.setupForm.title).toBe('');
      expect(result.current.setupForm.totalQuestions).toBe(10); // Default value
    });
  });

  describe('Session Management', () => {
    const mockSession = {
      id: 'session-123',
      userId: 'user-123',
      title: 'Test Quiz',
      totalQuestions: 5,
      timePerQuestion: 30,
      categoryIds: [1, 2],
      difficultyLevels: [1, 2],
      questionTypes: ['MULTIPLE_CHOICE' as const],
      shuffleQuestions: true,
      allowPause: true,
      showExplanations: true,
      status: QuizSessionStatus.CREATED,
      currentQuestionIndex: 0,
      questionsAnswered: 0,
      correctAnswers: 0,
      totalScore: 0,
      startedAt: undefined,
      pausedAt: undefined,
      completedAt: undefined,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      totalTimeTaken: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should create a new session', async () => {
      const { result } = renderHook(() => useQuizActions());

      quizApi.sessions.createSession.mockResolvedValue(mockSession);

      await act(async () => {
        await result.current.createSession({
          title: 'Test Quiz',
          totalQuestions: 5,
          categoryIds: [1, 2],
          difficultyLevels: [1, 2],
          questionTypes: ['MULTIPLE_CHOICE'],
          shuffleQuestions: true,
          allowPause: true,
          showExplanations: true,
        });
      });

      const state = useQuizStore.getState();
      expect(state.session).toEqual(mockSession);
      expect(state.gamePhase).toBe('setup');
      expect(state.error).toBeNull();
    });

    it('should handle session creation error', async () => {
      const { result } = renderHook(() => useQuizActions());

      const error = new Error('Failed to create session');
      quizApi.sessions.createSession.mockRejectedValue(error);

      await act(async () => {
        try {
          await result.current.createSession({
            totalQuestions: 5,
            categoryIds: [1],
            difficultyLevels: [1],
            questionTypes: ['MULTIPLE_CHOICE'],
            shuffleQuestions: true,
            allowPause: true,
            showExplanations: true,
          });
        } catch (e) {
          // Expected to throw
        }
      });

      const state = useQuizStore.getState();
      expect(state.session).toBeNull();
      expect(state.error).toBe('Failed to create session');
    });

    it('should start a session', async () => {
      const { result } = renderHook(() => useQuizActions());

      const startedSession = {
        ...mockSession,
        status: QuizSessionStatus.IN_PROGRESS,
        startedAt: new Date().toISOString(),
      };

      quizApi.sessions.startSession.mockResolvedValue(startedSession);
      quizApi.gameplay.getCurrentQuestion.mockResolvedValue({
        id: 'q1',
        questionText: 'Test Question',
        questionType: 'MULTIPLE_CHOICE',
        options: { options: ['A', 'B', 'C', 'D'] },
        difficultyLevel: 1,
        estimatedTime: 30,
        points: 10,
        categories: [{ id: 1, name: 'Category 1', slug: 'cat1' }],
      });

      // First set a session
      useQuizStore.setState({ session: mockSession });

      await act(async () => {
        await result.current.startSession('session-123');
      });

      const state = useQuizStore.getState();
      expect(state.session?.status).toBe(QuizSessionStatus.IN_PROGRESS);
      expect(state.gamePhase).toBe('playing');
    });

    it('should pause and resume a session', async () => {
      const { result } = renderHook(() => useQuizActions());

      const pausedSession = {
        ...mockSession,
        status: QuizSessionStatus.PAUSED,
        pausedAt: new Date().toISOString(),
      };

      const resumedSession = {
        ...mockSession,
        status: QuizSessionStatus.IN_PROGRESS,
        pausedAt: undefined,
      };

      quizApi.sessions.pauseSession.mockResolvedValue(pausedSession);
      quizApi.sessions.resumeSession.mockResolvedValue(resumedSession);

      // Set initial session
      useQuizStore.setState({ 
        session: { ...mockSession, status: QuizSessionStatus.IN_PROGRESS } 
      });

      // Pause
      await act(async () => {
        await result.current.pauseSession('session-123');
      });

      let state = useQuizStore.getState();
      expect(state.session?.status).toBe(QuizSessionStatus.PAUSED);
      expect(state.gamePhase).toBe('paused');

      // Resume
      await act(async () => {
        await result.current.resumeSession('session-123');
      });

      state = useQuizStore.getState();
      expect(state.session?.status).toBe(QuizSessionStatus.IN_PROGRESS);
      expect(state.gamePhase).toBe('playing');
    });
  });

  describe('Question Management', () => {
    const mockQuestion = {
      id: 'q1',
      questionText: 'What is 2+2?',
      questionType: 'MULTIPLE_CHOICE' as const,
      options: { options: ['2', '3', '4', '5'] },
      explanation: 'Basic arithmetic',
      difficultyLevel: 1,
      estimatedTime: 30,
      points: 10,
      categories: [{ id: 1, name: 'Math', slug: 'math' }],
    };

    it('should load current question', async () => {
      const { result } = renderHook(() => useQuizActions());

      quizApi.gameplay.getCurrentQuestion.mockResolvedValue(mockQuestion);

      // Set a session first
      useQuizStore.setState({
        session: {
          id: 'session-123',
          userId: 'user-123',
          status: QuizSessionStatus.IN_PROGRESS,
        } as any,
      });

      await act(async () => {
        await result.current.loadCurrentQuestion();
      });

      const state = useQuizStore.getState();
      expect(state.currentQuestion).toEqual(mockQuestion);
      expect(state.showExplanation).toBe(false);
    });

    it('should handle quiz completion when no more questions', async () => {
      const { result } = renderHook(() => useQuizActions());

      quizApi.gameplay.getCurrentQuestion.mockResolvedValue(null);
      quizApi.results.getQuizResults.mockResolvedValue({
        id: 'result-123',
        sessionId: 'session-123',
        totalQuestions: 1,
        questionsAnswered: 1,
        correctAnswers: 1,
        totalScore: 10,
        scorePercentage: 100,
        accuracyRate: 100,
        completedAt: new Date().toISOString(),
      });

      // Set a session first
      useQuizStore.setState({
        session: {
          id: 'session-123',
          userId: 'user-123',
          status: QuizSessionStatus.IN_PROGRESS,
        } as any,
      });

      await act(async () => {
        await result.current.loadCurrentQuestion();
      });

      const state = useQuizStore.getState();
      expect(state.currentQuestion).toBeNull();
      expect(state.gamePhase).toBe('completed');
    });

    it('should submit an answer', async () => {
      const { result } = renderHook(() => useQuizActions());

      const mockResponse = {
        isCorrect: true,
        pointsEarned: 15,
        explanation: 'Correct! 2+2=4',
        correctAnswer: '4',
        scoring: {
          basePoints: 10,
          timeBonus: 5,
          streakBonus: 0,
          difficultyBonus: 0,
        },
        nextQuestion: null, // Quiz completed
        sessionProgress: {
          currentQuestionIndex: 1,
          questionsAnswered: 1,
          totalQuestions: 1,
          totalScore: 15,
          progressPercentage: 100,
        },
      };

      quizApi.gameplay.submitAnswer.mockResolvedValue(mockResponse);
      quizApi.results.getQuizResults.mockResolvedValue({
        id: 'result-123',
        sessionId: 'session-123',
        totalQuestions: 1,
        questionsAnswered: 1,
        correctAnswers: 1,
        totalScore: 15,
        scorePercentage: 100,
        accuracyRate: 100,
        completedAt: new Date().toISOString(),
      });

      // Set initial state
      useQuizStore.setState({
        session: {
          id: 'session-123',
          userId: 'user-123',
          status: QuizSessionStatus.IN_PROGRESS,
          showExplanations: true,
        } as any,
        currentQuestion: mockQuestion,
        timer: { startTime: Date.now() - 5000 } as any,
      });

      await act(async () => {
        await result.current.submitAnswer({
          questionId: 'q1',
          userAnswer: '4',
        });
      });

      const state = useQuizStore.getState();
      expect(state.userAnswers).toHaveLength(1);
      expect(state.userAnswers[0].isCorrect).toBe(true);
      expect(state.lastSubmittedAnswer).toEqual(mockResponse);
      expect(state.showExplanation).toBe(true);
    });
  });

  describe('Timer Management', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start timer', () => {
      const { result } = renderHook(() => useQuizActions());

      act(() => {
        result.current.startTimer(30);
      });

      const state = useQuizStore.getState();
      expect(state.timer.timeRemaining).toBe(30);
      expect(state.timer.isRunning).toBe(true);
      expect(state.timer.isPaused).toBe(false);
    });

    it('should pause and resume timer', () => {
      const { result } = renderHook(() => useQuizActions());

      // Start timer
      act(() => {
        result.current.startTimer(30);
      });

      // Pause
      act(() => {
        result.current.pauseTimer();
      });

      let state = useQuizStore.getState();
      expect(state.timer.isRunning).toBe(false);
      expect(state.timer.isPaused).toBe(true);

      // Resume
      act(() => {
        result.current.resumeTimer();
      });

      state = useQuizStore.getState();
      expect(state.timer.isRunning).toBe(true);
      expect(state.timer.isPaused).toBe(false);
    });

    it('should stop and reset timer', () => {
      const { result } = renderHook(() => useQuizActions());

      // Start timer
      act(() => {
        result.current.startTimer(30);
      });

      // Stop
      act(() => {
        result.current.stopTimer();
      });

      let state = useQuizStore.getState();
      expect(state.timer.isRunning).toBe(false);
      expect(state.timer.isPaused).toBe(false);

      // Reset
      act(() => {
        result.current.resetTimer();
      });

      state = useQuizStore.getState();
      expect(state.timer.timeRemaining).toBe(0);
      expect(state.timer.startTime).toBe(0);
    });
  });

  describe('State Management', () => {
    it('should set loading state', () => {
      const { result } = renderHook(() => useQuizActions());

      act(() => {
        result.current.setLoading(true);
      });

      expect(useQuizStore.getState().isLoading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });

      expect(useQuizStore.getState().isLoading).toBe(false);
    });

    it('should set error state', () => {
      const { result } = renderHook(() => useQuizActions());

      act(() => {
        result.current.setError('Test error');
      });

      expect(useQuizStore.getState().error).toBe('Test error');

      act(() => {
        result.current.setError(null);
      });

      expect(useQuizStore.getState().error).toBeNull();
    });

    it('should set game phase', () => {
      const { result } = renderHook(() => useQuizActions());

      act(() => {
        result.current.setGamePhase('playing');
      });

      expect(useQuizStore.getState().gamePhase).toBe('playing');
    });

    it('should reset quiz state', () => {
      const { result } = renderHook(() => useQuizActions());

      // Set some state
      useQuizStore.setState({
        session: { id: 'session-123' } as any,
        currentQuestion: { id: 'q1' } as any,
        error: 'Test error',
        gamePhase: 'playing',
      });

      act(() => {
        result.current.resetQuizState();
      });

      const state = useQuizStore.getState();
      expect(state.session).toBeNull();
      expect(state.currentQuestion).toBeNull();
      expect(state.error).toBeNull();
      expect(state.gamePhase).toBe('setup');
    });
  });
});
