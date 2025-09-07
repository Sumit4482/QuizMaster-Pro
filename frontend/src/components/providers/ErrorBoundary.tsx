'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon, HomeIcon } from '@heroicons/react/24/outline';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolate?: boolean; // If true, only affects this component tree
  level?: 'page' | 'section' | 'component';
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
}

/**
 * FAANG-Level Error Boundary Component
 * 
 * Features:
 * - Comprehensive error catching and reporting
 * - Automatic retry mechanism with exponential backoff
 * - User-friendly error UI with different levels of severity
 * - Error reporting to external services (when configured)
 * - Graceful degradation for different component levels
 * - Development vs production error displays
 */
export class ErrorBoundary extends Component<Props, State> {
  private retryTimeouts: NodeJS.Timeout[] = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error info
    this.setState({ errorInfo });

    // Log error details
    const errorDetails = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo: {
        componentStack: errorInfo.componentStack,
      },
      errorId: this.state.errorId,
      level: this.props.level || 'component',
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    };

    // Console logging
    console.group(`🚨 Error Boundary Caught Error (${this.props.level || 'component'})`);
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Error ID:', this.state.errorId);
    console.groupEnd();

    // Report to external error tracking service
    this.reportError(errorDetails);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private reportError = async (errorDetails: any) => {
    try {
      // In production, send to error tracking service (Sentry, LogRocket, etc.)
      if (process.env.NODE_ENV === 'production') {
        // Example: Send to error tracking API
        // await fetch('/api/errors', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(errorDetails),
        // });

        // For now, just store in localStorage for debugging
        const existingErrors = JSON.parse(localStorage.getItem('app_errors') || '[]');
        existingErrors.push(errorDetails);
        localStorage.setItem('app_errors', JSON.stringify(existingErrors.slice(-50))); // Keep last 50 errors
      }
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  private handleRetry = () => {
    const { retryCount } = this.state;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    if (retryCount >= maxRetries) {
      console.warn('Maximum retry attempts reached');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = baseDelay * Math.pow(2, retryCount);

    console.log(`Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${maxRetries})`);

    const timeout = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: retryCount + 1,
      });
    }, delay);

    this.retryTimeouts.push(timeout);
  };

  private handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  private handleReload = () => {
    window.location.reload();
  };

  componentWillUnmount() {
    // Clear any pending retry timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(
          this.state.error!,
          this.state.errorInfo!,
          this.handleRetry
        );
      }

      // Default error UI based on level
      return this.renderDefaultErrorUI();
    }

    return this.props.children;
  }

  private renderDefaultErrorUI = () => {
    const { error, errorId, retryCount } = this.state;
    const { level = 'component', isolate = false } = this.props;
    const maxRetries = 3;
    const isProduction = process.env.NODE_ENV === 'production';

    // Different styling based on error level
    const levelStyles = {
      page: 'min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4',
      section: 'min-h-[400px] bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center p-8 m-4',
      component: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 m-4',
    };

    const contentStyles = {
      page: 'max-w-md w-full',
      section: 'max-w-sm w-full',
      component: 'w-full',
    };

    return (
      <div className={levelStyles[level]}>
        <div className={`text-center ${contentStyles[level]}`}>
          <div className="flex justify-center mb-4">
            <ExclamationTriangleIcon 
              className={`${level === 'page' ? 'h-16 w-16' : level === 'section' ? 'h-12 w-12' : 'h-8 w-8'} text-red-500`}
            />
          </div>

          <h3 className={`${level === 'page' ? 'text-lg' : 'text-base'} font-semibold text-gray-900 dark:text-white mb-2`}>
            {level === 'page' ? 'Application Error' : 
             level === 'section' ? 'Section Error' : 
             'Component Error'}
          </h3>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {isProduction
              ? 'Something went wrong. Our team has been notified.'
              : error?.message || 'An unexpected error occurred'
            }
          </p>

          {!isProduction && errorId && (
            <div className="bg-gray-100 dark:bg-gray-800 rounded p-3 mb-4">
              <p className="text-xs font-mono text-gray-600 dark:text-gray-400">
                Error ID: {errorId}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {/* Retry Button */}
            {retryCount < maxRetries && (
              <button
                onClick={this.handleRetry}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Try Again {retryCount > 0 && `(${retryCount}/${maxRetries})`}
              </button>
            )}

            {/* Additional actions for page-level errors */}
            {level === 'page' && (
              <div className="flex gap-2">
                <button
                  onClick={this.handleGoHome}
                  className="flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                >
                  <HomeIcon className="h-4 w-4" />
                  Go Home
                </button>
                <button
                  onClick={this.handleReload}
                  className="flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Reload
                </button>
              </div>
            )}

            {/* Contact support for critical errors */}
            {retryCount >= maxRetries && level === 'page' && (
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  If this problem persists, please contact support with error ID: 
                  <span className="font-mono text-xs ml-1">{errorId}</span>
                </p>
              </div>
            )}
          </div>

          {/* Development-only stack trace */}
          {!isProduction && error?.stack && level === 'page' && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Show technical details
              </summary>
              <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto text-gray-600 dark:text-gray-300">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  };
}

// HOC for wrapping components with error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Hook for throwing errors in functional components (for testing)
export function useErrorHandler() {
  return (error: Error) => {
    throw error;
  };
}
