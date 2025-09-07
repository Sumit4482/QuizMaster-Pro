import { useState, useEffect, useCallback, useRef } from 'react';
import { TimerState, TimerConfig, TIMER_WARNING_THRESHOLDS } from '@/types/quiz';

interface UseTimerOptions extends Partial<TimerConfig> {
  onTick?: (timeRemaining: number) => void;
  onWarning?: (warningType: 'halfTime' | 'tenSeconds' | 'fiveSeconds') => void;
  onComplete?: () => void;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

interface UseTimerReturn extends TimerState {
  start: (duration?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  addTime: (seconds: number) => void;
  removeTime: (seconds: number) => void;
  formatTime: () => string;
  getProgress: () => number;
}

export const useTimer = (options: UseTimerOptions = {}): UseTimerReturn => {
  const {
    duration = 30,
    showWarnings = true,
    autoSubmit = true,
    onTick,
    onWarning,
    onComplete,
    onStart,
    onPause,
    onResume,
    onStop,
  } = options;

  const [timerState, setTimerState] = useState<TimerState>({
    timeRemaining: duration,
    isRunning: false,
    isPaused: false,
    startTime: 0,
    warnings: {
      halfTime: false,
      tenSeconds: false,
      fiveSeconds: false,
    },
  });

  // Use refs to store mutable values that don't trigger re-renders
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialDurationRef = useRef<number>(duration);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const totalPausedTimeRef = useRef<number>(0);

  // Clear interval when component unmounts
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Update initial duration when prop changes
  useEffect(() => {
    if (!timerState.isRunning && !timerState.isPaused) {
      initialDurationRef.current = duration;
      setTimerState(prev => ({
        ...prev,
        timeRemaining: duration,
      }));
    }
  }, [duration, timerState.isRunning, timerState.isPaused]);

  const start = useCallback((newDuration?: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const startDuration = newDuration || initialDurationRef.current;
    const now = Date.now();
    
    initialDurationRef.current = startDuration;
    startTimeRef.current = now;
    pausedTimeRef.current = 0;
    totalPausedTimeRef.current = 0;

    setTimerState({
      timeRemaining: startDuration,
      isRunning: true,
      isPaused: false,
      startTime: now,
      endTime: now + (startDuration * 1000),
      warnings: {
        halfTime: false,
        tenSeconds: false,
        fiveSeconds: false,
      },
    });

    intervalRef.current = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = Math.floor((currentTime - startTimeRef.current - totalPausedTimeRef.current) / 1000);
      const remaining = Math.max(0, startDuration - elapsed);

      setTimerState(prev => {
        const newState = { ...prev, timeRemaining: remaining };
        
        // Check for warnings
        if (showWarnings && remaining > 0) {
          const halfTime = Math.floor(startDuration * TIMER_WARNING_THRESHOLDS.HALF_TIME);
          
          if (remaining <= halfTime && !prev.warnings.halfTime) {
            newState.warnings = { ...prev.warnings, halfTime: true };
            onWarning?.('halfTime');
          }
          
          if (remaining <= TIMER_WARNING_THRESHOLDS.TEN_SECONDS && !prev.warnings.tenSeconds) {
            newState.warnings = { ...newState.warnings, tenSeconds: true };
            onWarning?.('tenSeconds');
          }
          
          if (remaining <= TIMER_WARNING_THRESHOLDS.FIVE_SECONDS && !prev.warnings.fiveSeconds) {
            newState.warnings = { ...newState.warnings, fiveSeconds: true };
            onWarning?.('fiveSeconds');
          }
        }

        // Call onTick callback
        onTick?.(remaining);

        return newState;
      });

      // Timer completed
      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        setTimerState(prev => ({
          ...prev,
          isRunning: false,
          timeRemaining: 0,
        }));

        onComplete?.();
      }
    }, 100); // Update every 100ms for smooth display

    onStart?.();
  }, [showWarnings, onTick, onWarning, onComplete, onStart]);

  const pause = useCallback(() => {
    if (!timerState.isRunning || timerState.isPaused) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    pausedTimeRef.current = Date.now();

    setTimerState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: true,
    }));

    onPause?.();
  }, [timerState.isRunning, timerState.isPaused, onPause]);

  const resume = useCallback(() => {
    if (!timerState.isPaused) return;

    // Calculate total paused time
    const pauseDuration = Date.now() - pausedTimeRef.current;
    totalPausedTimeRef.current += pauseDuration;

    const currentTimeRemaining = timerState.timeRemaining;
    
    // Restart timer with remaining time
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setTimerState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
    }));

    intervalRef.current = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = Math.floor((currentTime - startTimeRef.current - totalPausedTimeRef.current) / 1000);
      const remaining = Math.max(0, initialDurationRef.current - elapsed);

      setTimerState(prev => {
        const newState = { ...prev, timeRemaining: remaining };
        
        // Check for warnings (only if not already triggered)
        if (showWarnings && remaining > 0) {
          const halfTime = Math.floor(initialDurationRef.current * TIMER_WARNING_THRESHOLDS.HALF_TIME);
          
          if (remaining <= halfTime && !prev.warnings.halfTime) {
            newState.warnings = { ...prev.warnings, halfTime: true };
            onWarning?.('halfTime');
          }
          
          if (remaining <= TIMER_WARNING_THRESHOLDS.TEN_SECONDS && !prev.warnings.tenSeconds) {
            newState.warnings = { ...newState.warnings, tenSeconds: true };
            onWarning?.('tenSeconds');
          }
          
          if (remaining <= TIMER_WARNING_THRESHOLDS.FIVE_SECONDS && !prev.warnings.fiveSeconds) {
            newState.warnings = { ...newState.warnings, fiveSeconds: true };
            onWarning?.('fiveSeconds');
          }
        }

        onTick?.(remaining);
        return newState;
      });

      // Timer completed
      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        setTimerState(prev => ({
          ...prev,
          isRunning: false,
          timeRemaining: 0,
        }));

        onComplete?.();
      }
    }, 100);

    onResume?.();
  }, [timerState.isPaused, timerState.timeRemaining, showWarnings, onTick, onWarning, onComplete, onResume]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setTimerState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: false,
    }));

    onStop?.();
  }, [onStop]);

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    startTimeRef.current = 0;
    pausedTimeRef.current = 0;
    totalPausedTimeRef.current = 0;

    setTimerState({
      timeRemaining: initialDurationRef.current,
      isRunning: false,
      isPaused: false,
      startTime: 0,
      warnings: {
        halfTime: false,
        tenSeconds: false,
        fiveSeconds: false,
      },
    });
  }, []);

  const addTime = useCallback((seconds: number) => {
    initialDurationRef.current += seconds;
    
    setTimerState(prev => ({
      ...prev,
      timeRemaining: prev.timeRemaining + seconds,
      ...(prev.endTime && { endTime: prev.endTime + (seconds * 1000) }),
    }));
  }, []);

  const removeTime = useCallback((seconds: number) => {
    const newDuration = Math.max(0, initialDurationRef.current - seconds);
    const newTimeRemaining = Math.max(0, timerState.timeRemaining - seconds);
    
    initialDurationRef.current = newDuration;
    
    setTimerState(prev => ({
      ...prev,
      timeRemaining: newTimeRemaining,
      ...(prev.endTime && { endTime: prev.endTime - (seconds * 1000) }),
    }));

    // If time runs out, complete the timer
    if (newTimeRemaining <= 0) {
      stop();
      onComplete?.();
    }
  }, [timerState.timeRemaining, stop, onComplete]);

  const formatTime = useCallback((): string => {
    const minutes = Math.floor(timerState.timeRemaining / 60);
    const seconds = timerState.timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timerState.timeRemaining]);

  const getProgress = useCallback((): number => {
    if (initialDurationRef.current === 0) return 100;
    return Math.max(0, Math.min(100, 
      ((initialDurationRef.current - timerState.timeRemaining) / initialDurationRef.current) * 100
    ));
  }, [timerState.timeRemaining]);

  return {
    ...timerState,
    start,
    pause,
    resume,
    stop,
    reset,
    addTime,
    removeTime,
    formatTime,
    getProgress,
  };
};

// Specialized hook for quiz timers with audio warnings
export const useQuizTimer = (options: UseTimerOptions & {
  enableAudio?: boolean;
  warningSound?: string;
  urgentSound?: string;
} = {}) => {
  const {
    enableAudio = false,
    warningSound = '/sounds/warning.mp3',
    urgentSound = '/sounds/urgent.mp3',
    ...timerOptions
  } = options;

  const audioContextRef = useRef<AudioContext | null>(null);
  const warningAudioRef = useRef<HTMLAudioElement | null>(null);
  const urgentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio elements
  useEffect(() => {
    if (enableAudio && typeof window !== 'undefined') {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        warningAudioRef.current = new Audio(warningSound);
        urgentAudioRef.current = new Audio(urgentSound);
        
        // Preload audio files
        warningAudioRef.current.preload = 'auto';
        urgentAudioRef.current.preload = 'auto';
      } catch (error) {
        console.warn('Audio initialization failed:', error);
      }
    }

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [enableAudio, warningSound, urgentSound]);

  const playWarningSound = useCallback(async (type: 'warning' | 'urgent') => {
    if (!enableAudio) return;

    try {
      // Resume audio context if needed
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const audio = type === 'urgent' ? urgentAudioRef.current : warningAudioRef.current;
      if (audio) {
        audio.currentTime = 0; // Reset to start
        await audio.play();
      }
    } catch (error) {
      console.warn('Failed to play warning sound:', error);
    }
  }, [enableAudio]);

  const timer = useTimer({
    ...timerOptions,
    onWarning: (warningType) => {
      timerOptions.onWarning?.(warningType);
      
      if (warningType === 'fiveSeconds') {
        playWarningSound('urgent');
      } else if (warningType === 'tenSeconds' || warningType === 'halfTime') {
        playWarningSound('warning');
      }
    },
  });

  return timer;
};

// Hook for synchronizing timer with server time
export const useSynchronizedTimer = (options: UseTimerOptions & {
  syncInterval?: number;
  onSyncError?: (error: Error) => void;
} = {}) => {
  const { syncInterval = 30000, onSyncError, ...timerOptions } = options;
  
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to sync with server time
  const syncServerTime = useCallback(async () => {
    try {
      const startTime = Date.now();
      
      // Make a request to get server time (you'll need to implement this endpoint)
      const response = await fetch('/api/time', { method: 'HEAD' });
      const endTime = Date.now();
      const networkLatency = (endTime - startTime) / 2;
      
      const serverTimeStr = response.headers.get('Date');
      if (serverTimeStr) {
        const serverTime = new Date(serverTimeStr).getTime();
        const adjustedServerTime = serverTime + networkLatency;
        const offset = adjustedServerTime - endTime;
        
        setServerTimeOffset(offset);
      }
    } catch (error) {
      onSyncError?.(error as Error);
    }
  }, [onSyncError]);

  // Start periodic sync
  useEffect(() => {
    syncServerTime(); // Initial sync
    
    if (syncInterval > 0) {
      syncIntervalRef.current = setInterval(syncServerTime, syncInterval);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncServerTime, syncInterval]);

  // Override the timer's time calculation to use server time
  const timer = useTimer({
    ...timerOptions,
    onTick: (timeRemaining) => {
      timerOptions.onTick?.(timeRemaining);
      
      // You could add additional logic here to adjust for server time offset
      // This is a simplified implementation
    },
  });

  return {
    ...timer,
    serverTimeOffset,
    syncServerTime,
  };
};

export default useTimer;
