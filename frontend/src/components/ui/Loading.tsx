import React from 'react';
import { clsx } from 'clsx';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'primary' | 'secondary' | 'white';
}

interface LoadingDotsProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  color?: 'primary' | 'secondary' | 'white';
}

interface LoadingOverlayProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
  blur?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
  color = 'primary',
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12',
  };

  const colorClasses = {
    primary: 'text-primary-600',
    secondary: 'text-secondary-600',
    white: 'text-white',
  };

  return (
    <div
      className={clsx('animate-spin', sizeClasses[size], colorClasses[color], className)}
      role="status"
      aria-label="Loading"
    >
      <svg
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export const LoadingDots: React.FC<LoadingDotsProps> = ({
  size = 'md',
  className,
  color = 'primary',
}) => {
  const sizeClasses = {
    sm: 'h-1 w-1',
    md: 'h-2 w-2',
    lg: 'h-3 w-3',
  };

  const colorClasses = {
    primary: 'bg-primary-600',
    secondary: 'bg-secondary-600',
    white: 'bg-white',
  };

  return (
    <div className={clsx('flex space-x-1', className)} role="status" aria-label="Loading">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className={clsx(
            'animate-pulse rounded-full',
            sizeClasses[size],
            colorClasses[color]
          )}
          style={{
            animationDelay: `${index * 0.15}s`,
            animationDuration: '1s',
          }}
        />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export const LoadingSkeleton: React.FC<{ className?: string; lines?: number }> = ({
  className,
  lines = 1,
}) => {
  return (
    <div className={clsx('animate-pulse', className)} role="status" aria-label="Loading content">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={clsx(
            'h-4 bg-secondary-200 rounded dark:bg-secondary-700',
            {
              'mb-2': index < lines - 1,
              'w-full': index < lines - 1,
              'w-3/4': index === lines - 1 && lines > 1,
            }
          )}
        />
      ))}
      <span className="sr-only">Loading content...</span>
    </div>
  );
};

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  children,
  className,
  blur = true,
}) => {
  return (
    <div className={clsx('relative', className)}>
      {children}
      {isLoading && (
        <div
          className={clsx(
            'absolute inset-0 z-50 flex items-center justify-center',
            'bg-white/80 dark:bg-secondary-900/80',
            {
              'backdrop-blur-sm': blur,
            }
          )}
          role="status"
          aria-label="Loading overlay"
        >
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-400">
              Loading...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const LoadingPage: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-white dark:bg-secondary-900"
      role="status"
      aria-label={message}
    >
      <div className="text-center">
        <LoadingSpinner size="xl" />
        <h2 className="mt-4 text-lg font-medium text-secondary-900 dark:text-secondary-100">
          {message}
        </h2>
      </div>
    </div>
  );
};
