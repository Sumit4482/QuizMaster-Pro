'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePerformance } from '@/components/providers/PerformanceProvider';

interface BaseLoadingProps {
  className?: string;
  'data-testid'?: string;
}

// Skeleton Loading Components
interface SkeletonProps extends BaseLoadingProps {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  variant = 'rectangular',
  animation = 'pulse',
  className = '',
  ...props
}: SkeletonProps) {
  const baseClasses = 'bg-gray-200 dark:bg-gray-700';
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-lg',
  };
  
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-wave',
    none: '',
  };

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={style}
      {...props}
    />
  );
}

// Card Skeleton
export function CardSkeleton({ className = '' }: BaseLoadingProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
      <div className="flex items-center space-x-4 mb-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1">
          <Skeleton height={20} className="mb-2" />
          <Skeleton height={16} width="60%" />
        </div>
      </div>
      <Skeleton height={16} className="mb-2" />
      <Skeleton height={16} className="mb-2" />
      <Skeleton height={16} width="40%" />
    </div>
  );
}

// Table Skeleton
interface TableSkeletonProps extends BaseLoadingProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4, className = '' }: TableSkeletonProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} height={20} />
          ))}
        </div>
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="border-b border-gray-100 dark:border-gray-700 p-4 last:border-b-0">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={colIndex} height={16} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Progressive Loading Component
interface ProgressiveLoadingProps extends BaseLoadingProps {
  stages: Array<{
    label: string;
    duration?: number;
    icon?: React.ReactNode;
  }>;
  currentStage: number;
  error?: string | null;
  onRetry?: () => void;
}

export function ProgressiveLoading({
  stages,
  currentStage,
  error,
  onRetry,
  className = '',
}: ProgressiveLoadingProps) {
  const [displayedStage, setDisplayedStage] = useState(0);

  useEffect(() => {
    if (currentStage > displayedStage) {
      const timer = setTimeout(() => {
        setDisplayedStage(currentStage);
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setDisplayedStage(currentStage);
    }
    // Return empty cleanup function for the else case
    return () => {};
  }, [currentStage, displayedStage]);

  if (error) {
    return (
      <div className={`text-center p-8 ${className}`}>
        <div className="text-red-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Loading Failed</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`text-center p-8 ${className}`}>
      <div className="max-w-md mx-auto">
        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-6">
          <motion.div
            className="bg-blue-600 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((displayedStage + 1) / stages.length) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Current stage */}
        <AnimatePresence mode="wait">
          <motion.div
            key={displayedStage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {stages[displayedStage]?.icon && (
              <div className="text-blue-600 mb-3">
                {stages[displayedStage].icon}
              </div>
            )}
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {stages[displayedStage]?.label || 'Loading...'}
            </h3>
            <div className="flex justify-center">
              <LoadingSpinner size="sm" />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Stage list */}
        <div className="mt-8 text-left">
          {stages.map((stage, index) => (
            <div key={index} className="flex items-center mb-2">
              <div className={`w-2 h-2 rounded-full mr-3 flex-shrink-0 ${
                index <= displayedStage ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`} />
              <span className={`text-sm ${
                index <= displayedStage 
                  ? 'text-gray-900 dark:text-white' 
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                {stage.label}
              </span>
              {index === displayedStage && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ml-2 w-3 h-3"
                >
                  <LoadingSpinner size="xs" />
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Smart Loading with Performance Optimization
interface SmartLoadingProps extends BaseLoadingProps {
  type?: 'spinner' | 'skeleton' | 'progressive';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  timeout?: number;
  onTimeout?: () => void;
  adaptiveDelay?: boolean; // Delay based on network speed
}

export function SmartLoading({
  type = 'spinner',
  size = 'md',
  text,
  timeout = 30000, // 30 seconds
  onTimeout,
  adaptiveDelay = true,
  className = '',
  ...props
}: SmartLoadingProps) {
  const [showLoading, setShowLoading] = useState(!adaptiveDelay);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  
  // Safely use performance context with fallback
  let isSlowNetwork = false;
  let shouldOptimize = false;
  
  try {
    const performance = usePerformance();
    isSlowNetwork = performance.isSlowNetwork;
    shouldOptimize = performance.shouldOptimize;
  } catch (e) {
    // Performance provider not available, use defaults
    console.warn('PerformanceProvider not found, using default performance settings');
  }

  // Adaptive delay based on network conditions
  useEffect(() => {
    if (!adaptiveDelay) return;

    const delay = isSlowNetwork ? 100 : shouldOptimize ? 300 : 500;
    const timer = setTimeout(() => setShowLoading(true), delay);
    
    return () => clearTimeout(timer);
  }, [adaptiveDelay, isSlowNetwork, shouldOptimize]);

  // Timeout handling
  useEffect(() => {
    if (!showLoading) return;

    const timer = setTimeout(() => {
      setHasTimedOut(true);
      onTimeout?.();
    }, timeout);

    return () => clearTimeout(timer);
  }, [showLoading, timeout, onTimeout]);

  if (!showLoading) {
    return null; // Don't flash loading for quick operations
  }

  if (hasTimedOut) {
    return (
      <div className={`text-center p-4 ${className}`} {...props}>
        <div className="text-orange-500 mb-2">
          <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          This is taking longer than expected...
        </p>
      </div>
    );
  }

  if (type === 'skeleton') {
    return <CardSkeleton className={className} {...props} />;
  }

  return (
    <LoadingSpinner 
      size={size} 
      {...(text && { text })}
      className={className} 
      {...props} 
    />
  );
}

// Enhanced LoadingSpinner with better animations
interface LoadingSpinnerProps extends BaseLoadingProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'white';
  text?: string;
  centered?: boolean;
}

export function LoadingSpinner({
  size = 'md',
  variant = 'primary',
  text,
  centered = false,
  className = '',
  ...props
}: LoadingSpinnerProps) {
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const variantClasses = {
    primary: 'text-blue-600',
    secondary: 'text-gray-600',
    white: 'text-white'
  };

  const spinnerContent = (
    <>
      <motion.div
        className={`inline-block ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        {...props}
      >
        <svg
          fill="none"
          viewBox="0 0 24 24"
          className="w-full h-full"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            className="opacity-25"
          />
          <path
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            className="opacity-75"
          />
        </svg>
      </motion.div>
      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-sm text-gray-600 dark:text-gray-300"
        >
          {text}
        </motion.p>
      )}
    </>
  );

  if (centered) {
    return (
      <div className="flex flex-col items-center justify-center">
        {spinnerContent}
      </div>
    );
  }

  return text ? (
    <div className="flex flex-col items-center">
      {spinnerContent}
    </div>
  ) : (
    spinnerContent
  );
}

// Loading Button State
interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingButton({
  loading = false,
  loadingText = 'Loading...',
  variant = 'primary',
  size = 'md',
  children,
  disabled,
  className = '',
  ...props
}: LoadingButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const disabledClasses = 'opacity-50 cursor-not-allowed';

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${
        (loading || disabled) ? disabledClasses : ''
      } ${className}`}
      disabled={loading || disabled}
      {...props}
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center"
          >
            <LoadingSpinner size="xs" variant="white" className="mr-2" />
            {loadingText}
          </motion.span>
        ) : (
          <motion.span
            key="children"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

// Hook for managing loading states
export function useLoadingState(initialState = false) {
  const [loading, setLoading] = useState(initialState);
  const [error, setError] = useState<string | null>(null);

  const startLoading = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  const stopLoading = useCallback(() => {
    setLoading(false);
  }, []);

  const setLoadingError = useCallback((error: string | Error) => {
    setLoading(false);
    setError(error instanceof Error ? error.message : error);
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  return {
    loading,
    error,
    startLoading,
    stopLoading,
    setError: setLoadingError,
    reset,
  };
}
