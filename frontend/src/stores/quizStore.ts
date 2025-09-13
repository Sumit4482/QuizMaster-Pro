import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  QuizConfiguration,
  QuizSessionResponse,
  QuizQuestion,
  QuizAnswer,
  SubmitAnswerResponse,
  DetailedQuizResult,
  UserStatisticsResponse,
  TimerState,
  QuizGameState,
  QuizSetupFormData,
  DEFAULT_QUIZ_SETUP,
  TIMER_WARNING_THRESHOLDS,
  formatTime,
} from '@/types/quiz';
import { quizApi, handleApiError } from '@/utils/quizApi';

interface QuizStore extends QuizGameState {
  // Setup State
  setupForm: QuizSetupFormData;
  
  // Timer State
  timer: TimerState & {
    intervalId?: NodeJS.Timeout | null;
  };
  
  // Results State
  results: DetailedQuizResult | null;
  userStatistics: UserStatisticsResponse | null;
  
  // UI State
  isSubmittingAnswer: boolean;
  lastSubmittedAnswer: SubmitAnswerResponse | null;
  showExplanation: boolean;
  
  // Actions
  updateSetupForm: (updates: Partial<QuizSetupFormData>) => void;
  resetSetupForm: () => void;
  
  // Session Management
  createSession: (config: QuizConfiguration) => Promise<void>;
  startSession: (sessionId: string) => Promise<void>;
  pauseSession: (sessionId: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  
  // Gameplay Actions
  loadCurrentQuestion: () => Promise<void>;
  submitAnswer: (answer: {
    questionId: string;
    userAnswer: any;
    hintsUsed?: number;
    skipped?: boolean;
  }) => Promise<void>;
  
  // Timer Actions
  startTimer: (duration: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;
  
  // Results Actions
  loadResults: (sessionId: string) => Promise<void>;
  loadUserStatistics: () => Promise<void>;
  
  // UI Actions
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setGamePhase: (phase: QuizGameState['gamePhase']) => void;
  toggleExplanation: () => void;
  
  // Reset Actions
  resetQuizState: () => void;
  resetGameState: () => void;
}

const initialTimerState: TimerState & { intervalId?: NodeJS.Timeout | null } = {
  timeRemaining: 0,
  isRunning: false,
  isPaused: false,
  startTime: 0,
  warnings: {
    halfTime: false,
    tenSeconds: false,
    fiveSeconds: false,
  },
  intervalId: null,
};

const initialGameState: QuizGameState = {
  session: null,
  currentQuestion: null,
  userAnswers: [],
  timer: initialTimerState,
  isLoading: false,
  error: null,
  gamePhase: 'setup',
};

export const useQuizStore = create<QuizStore>()(
  persist(
    (set, get) => ({
      // Initial State
      ...initialGameState,
      setupForm: { ...DEFAULT_QUIZ_SETUP },
      timer: { ...initialTimerState },
      results: null,
      userStatistics: null,
      isSubmittingAnswer: false,
      lastSubmittedAnswer: null,
      showExplanation: false,

      // Setup Form Actions
      updateSetupForm: (updates) => {
        set((state) => ({
          setupForm: { ...state.setupForm, ...updates },
        }));
      },

      resetSetupForm: () => {
        set({ setupForm: { ...DEFAULT_QUIZ_SETUP } });
      },

      // Session Management Actions
      createSession: async (config) => {
        try {
          set({ isLoading: true, error: null });
          const session = await quizApi.sessions.createSession(config);
          set({
            session,
            gamePhase: 'setup',
            isLoading: false,
          });
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isLoading: false,
          });
          throw quizError;
        }
      },

      startSession: async (sessionId) => {
        try {
          set({ isLoading: true, error: null });
          const session = await quizApi.sessions.startSession(sessionId);
          set({
            session,
            gamePhase: 'playing',
            isLoading: false,
          });
          
          // Load the first question
          await get().loadCurrentQuestion();
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isLoading: false,
          });
          throw quizError;
        }
      },

      pauseSession: async (sessionId) => {
        try {
          set({ isLoading: true, error: null });
          const session = await quizApi.sessions.pauseSession(sessionId);
          get().pauseTimer();
          set({
            session,
            gamePhase: 'paused',
            isLoading: false,
          });
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isLoading: false,
          });
          throw quizError;
        }
      },

      resumeSession: async (sessionId) => {
        try {
          set({ isLoading: true, error: null });
          const session = await quizApi.sessions.resumeSession(sessionId);
          get().resumeTimer();
          set({
            session,
            gamePhase: 'playing',
            isLoading: false,
          });
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isLoading: false,
          });
          throw quizError;
        }
      },

      loadSession: async (sessionId) => {
        try {
          set({ isLoading: true, error: null });
          const session = await quizApi.sessions.getSession(sessionId);
          
          let gamePhase: QuizGameState['gamePhase'] = 'setup';
          if (session.status === 'IN_PROGRESS') {
            gamePhase = 'playing';
          } else if (session.status === 'PAUSED') {
            gamePhase = 'paused';
          } else if (session.status === 'COMPLETED') {
            gamePhase = 'completed';
          }
          
          set({
            session,
            gamePhase,
            isLoading: false,
          });

          // Load current question if session is active
          if (['playing', 'paused'].includes(gamePhase)) {
            await get().loadCurrentQuestion();
          }
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isLoading: false,
          });
          throw quizError;
        }
      },

      // Gameplay Actions
      loadCurrentQuestion: async () => {
        const { session } = get();
        if (!session) {
          throw new Error('No active session');
        }

        try {
          set({ isLoading: true, error: null });
          const question = await quizApi.gameplay.getCurrentQuestion(session.id);
          
          if (!question) {
            // Quiz completed
            set({
              currentQuestion: null,
              gamePhase: 'completed',
              isLoading: false,
            });
            await get().loadResults(session.id);
          } else {
            set({
              currentQuestion: question,
              showExplanation: false,
              isLoading: false,
            });

            // Start timer if time per question is set
            if (session.timePerQuestion) {
              get().startTimer(session.timePerQuestion);
            }
          }
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isLoading: false,
          });
          throw quizError;
        }
      },

      submitAnswer: async (answer) => {
        const { session, currentQuestion, timer } = get();
        if (!session || !currentQuestion) {
          throw new Error('No active session or question');
        }

        try {
          set({ isSubmittingAnswer: true, error: null });
          
          // Stop timer and calculate time taken
          get().stopTimer();
          const timeTaken = timer.startTime ? Math.floor((Date.now() - timer.startTime) / 1000) : 0;

          const response = await quizApi.gameplay.submitAnswer(session.id, {
            ...answer,
            timeTaken,
          });

          console.log('📊 Answer response received:', {
            isCorrect: response.isCorrect,
            pointsEarned: response.pointsEarned,
            sessionProgress: response.sessionProgress,
            oldScore: session.totalScore,
            newScore: response.sessionProgress.totalScore
          });

          // Update user answers
          const newAnswer: QuizAnswer = {
            questionId: answer.questionId,
            userAnswer: answer.userAnswer,
            isCorrect: response.isCorrect,
            timeTaken,
            hintsUsed: answer.hintsUsed || 0,
          };

          set((state) => ({
            userAnswers: [...state.userAnswers, newAnswer],
            lastSubmittedAnswer: response,
            showExplanation: session.showExplanations,
            isSubmittingAnswer: false,
            session: {
              ...state.session!,
              ...response.sessionProgress,
              // Explicitly set the score to ensure it updates
              totalScore: response.sessionProgress.totalScore,
            },
            // Force a re-render by updating a timestamp
            lastUpdated: Date.now(),
          }));

          // Check if quiz is completed
          if (!response.nextQuestion) {
            set({ gamePhase: 'completed' });
            await get().loadResults(session.id);
          } else {
            // Load next question after a brief delay to show results
            setTimeout(() => {
              set({
                currentQuestion: response.nextQuestion || null,
                showExplanation: false,
              });

              // Start timer for next question
              if (session.timePerQuestion) {
                get().startTimer(session.timePerQuestion);
              }
            }, session.showExplanations ? 3000 : 1000);
          }
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isSubmittingAnswer: false,
          });
          throw quizError;
        }
      },

      // Timer Actions
      startTimer: (duration) => {
        const { timer } = get();
        
        // Clear existing timer
        if (timer.intervalId) {
          clearInterval(timer.intervalId);
        }

        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);

        const intervalId = setInterval(() => {
          const now = Date.now();
          const timeRemaining = Math.max(0, Math.ceil((endTime - now) / 1000));
          
          const state = get();
          const newWarnings = { ...state.timer.warnings };
          
          // Check for warnings
          const halfTime = duration * TIMER_WARNING_THRESHOLDS.HALF_TIME;
          if (timeRemaining <= halfTime && !newWarnings.halfTime) {
            newWarnings.halfTime = true;
          }
          
          if (timeRemaining <= TIMER_WARNING_THRESHOLDS.TEN_SECONDS && !newWarnings.tenSeconds) {
            newWarnings.tenSeconds = true;
          }
          
          if (timeRemaining <= TIMER_WARNING_THRESHOLDS.FIVE_SECONDS && !newWarnings.fiveSeconds) {
            newWarnings.fiveSeconds = true;
          }

          set({
            timer: {
              ...state.timer,
              timeRemaining,
              warnings: newWarnings,
            },
          });

          // Auto-submit when time runs out
          if (timeRemaining <= 0) {
            clearInterval(intervalId);
            const currentQuestion = get().currentQuestion;
            if (currentQuestion) {
              get().submitAnswer({
                questionId: currentQuestion.id,
                userAnswer: null,
                skipped: true,
              });
            }
          }
        }, 1000);

        set({
          timer: {
            timeRemaining: duration,
            isRunning: true,
            isPaused: false,
            startTime,
            endTime,
            warnings: {
              halfTime: false,
              tenSeconds: false,
              fiveSeconds: false,
            },
            intervalId,
          },
        });
      },

      pauseTimer: () => {
        const { timer } = get();
        if (timer.intervalId) {
          clearInterval(timer.intervalId);
        }
        set({
          timer: {
            ...timer,
            isRunning: false,
            isPaused: true,
            intervalId: null,
          },
        });
      },

      resumeTimer: () => {
        const { timer } = get();
        if (timer.timeRemaining > 0) {
          get().startTimer(timer.timeRemaining);
        }
      },

      stopTimer: () => {
        const { timer } = get();
        if (timer.intervalId) {
          clearInterval(timer.intervalId);
        }
        set({
          timer: {
            ...timer,
            isRunning: false,
            isPaused: false,
            intervalId: null,
          },
        });
      },

      resetTimer: () => {
        const { timer } = get();
        if (timer.intervalId) {
          clearInterval(timer.intervalId);
        }
        set({
          timer: { ...initialTimerState },
        });
      },

      // Results Actions
      loadResults: async (sessionId) => {
        try {
          set({ isLoading: true, error: null });
          const results = await quizApi.results.getQuizResults(sessionId);
          set({
            results,
            gamePhase: 'results',
            isLoading: false,
          });
        } catch (error) {
          const quizError = handleApiError(error);
          set({
            error: quizError.message,
            isLoading: false,
          });
          throw quizError;
        }
      },

      loadUserStatistics: async () => {
        try {
          const statistics = await quizApi.statistics.getUserStatistics();
          set({ userStatistics: statistics });
        } catch (error) {
          const quizError = handleApiError(error);
          console.warn('Failed to load user statistics:', quizError.message);
        }
      },

      // UI Actions
      setError: (error) => {
        set({ error });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setGamePhase: (gamePhase) => {
        set({ gamePhase });
      },

      toggleExplanation: () => {
        set((state) => ({
          showExplanation: !state.showExplanation,
        }));
      },

      // Reset Actions
      resetQuizState: () => {
        const { timer } = get();
        if (timer.intervalId) {
          clearInterval(timer.intervalId);
        }
        set({
          ...initialGameState,
          timer: { ...initialTimerState },
          results: null,
          lastSubmittedAnswer: null,
          showExplanation: false,
          isSubmittingAnswer: false,
        });
      },

      resetGameState: () => {
        const { timer } = get();
        if (timer.intervalId) {
          clearInterval(timer.intervalId);
        }
        set({
          session: null,
          currentQuestion: null,
          userAnswers: [],
          timer: { ...initialTimerState },
          gamePhase: 'setup',
          lastSubmittedAnswer: null,
          showExplanation: false,
          isSubmittingAnswer: false,
        });
      },
    }),
    {
      name: 'quiz-store',
      partialize: (state) => ({
        // Only persist necessary data
        session: state.session,
        userAnswers: state.userAnswers,
        gamePhase: state.gamePhase,
        setupForm: state.setupForm,
      }),
      onRehydrateStorage: () => (state) => {
        // Clear timer state on hydration to prevent stale intervals
        if (state) {
          state.timer = { ...initialTimerState };
          state.isLoading = false;
          state.error = null;
          state.isSubmittingAnswer = false;
          state.showExplanation = false;
        }
      },
    }
  )
);

// Selector hooks for specific parts of the store
export const useQuizSession = () => useQuizStore((state) => state.session);
export const useCurrentQuestion = () => useQuizStore((state) => state.currentQuestion);
export const useQuizTimer = () => useQuizStore((state) => state.timer);
export const useQuizResults = () => useQuizStore((state) => state.results);
export const useQuizGamePhase = () => useQuizStore((state) => state.gamePhase);
export const useQuizSetupForm = () => useQuizStore((state) => state.setupForm);
export const useQuizError = () => useQuizStore((state) => state.error);
export const useQuizLoading = () => useQuizStore((state) => state.isLoading);

// Action selectors
export const useQuizActions = () => useQuizStore((state) => ({
  createSession: state.createSession,
  startSession: state.startSession,
  pauseSession: state.pauseSession,
  resumeSession: state.resumeSession,
  loadSession: state.loadSession,
  loadCurrentQuestion: state.loadCurrentQuestion,
  submitAnswer: state.submitAnswer,
  startTimer: state.startTimer,
  pauseTimer: state.pauseTimer,
  resumeTimer: state.resumeTimer,
  stopTimer: state.stopTimer,
  resetTimer: state.resetTimer,
  loadResults: state.loadResults,
  loadUserStatistics: state.loadUserStatistics,
  updateSetupForm: state.updateSetupForm,
  resetSetupForm: state.resetSetupForm,
  setError: state.setError,
  setLoading: state.setLoading,
  setGamePhase: state.setGamePhase,
  toggleExplanation: state.toggleExplanation,
  resetQuizState: state.resetQuizState,
  resetGameState: state.resetGameState,
}));
