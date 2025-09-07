'use client';

import React from 'react';
import { 
  CheckCircleIcon, 
  ExclamationCircleIcon, 
  InformationCircleIcon, 
  XMarkIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  isVisible: boolean;
  onClose: (id: string) => void;
}

export function Toast({
  id,
  type,
  title,
  message,
  isVisible,
  onClose
}: ToastProps) {
  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircleIcon,
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          iconColor: 'text-green-400',
          titleColor: 'text-green-800 dark:text-green-200',
          messageColor: 'text-green-700 dark:text-green-300'
        };
      case 'error':
        return {
          icon: ExclamationCircleIcon,
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          iconColor: 'text-red-400',
          titleColor: 'text-red-800 dark:text-red-200',
          messageColor: 'text-red-700 dark:text-red-300'
        };
      case 'warning':
        return {
          icon: ExclamationTriangleIcon,
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          iconColor: 'text-yellow-400',
          titleColor: 'text-yellow-800 dark:text-yellow-200',
          messageColor: 'text-yellow-700 dark:text-yellow-300'
        };
      case 'info':
      default:
        return {
          icon: InformationCircleIcon,
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          iconColor: 'text-blue-400',
          titleColor: 'text-blue-800 dark:text-blue-200',
          messageColor: 'text-blue-700 dark:text-blue-300'
        };
    }
  };

  const { 
    icon: Icon, 
    bgColor, 
    borderColor, 
    iconColor, 
    titleColor, 
    messageColor 
  } = getToastStyles();

  return (
    <div
      className={`
        fixed top-4 right-4 z-50 w-full max-w-sm transform transition-all duration-300 ease-in-out
        ${isVisible 
          ? 'translate-x-0 opacity-100 scale-100' 
          : 'translate-x-full opacity-0 scale-95'
        }
      `}
    >
      <div className={`
        rounded-lg border ${borderColor} ${bgColor} p-4 shadow-lg backdrop-blur-sm
        animate-in slide-in-from-right-full duration-300
      `}>
        <div className="flex">
          <div className="flex-shrink-0">
            <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" />
          </div>
          
          <div className="ml-3 flex-1">
            <p className={`text-sm font-medium ${titleColor}`}>
              {title}
            </p>
            {message && (
              <p className={`mt-1 text-sm ${messageColor}`}>
                {message}
              </p>
            )}
          </div>
          
          <div className="ml-4 flex flex-shrink-0">
            <button
              className={`
                inline-flex rounded-md ${bgColor} ${titleColor} 
                hover:${bgColor} focus:outline-none focus:ring-2 focus:ring-offset-2
                transition-colors duration-200
              `}
              onClick={() => onClose(id)}
            >
              <span className="sr-only">Close</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Toast manager hook
export interface ToastItem extends Omit<ToastProps, 'isVisible' | 'onClose'> {}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const showToast = React.useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const duration = toast.duration || 5000;
    const newToast: ToastItem = {
      ...toast,
      id,
      duration,
    };

    setToasts(current => [...current, newToast]);

    // Auto-remove toast after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const removeAllToasts = React.useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const success = React.useCallback((title: string, message?: string, duration?: number) => {
    return showToast({ 
      type: 'success', 
      title, 
      ...(message && { message }), 
      duration: duration || 5000 
    });
  }, [showToast]);

  const error = React.useCallback((title: string, message?: string, duration?: number) => {
    return showToast({ 
      type: 'error', 
      title, 
      ...(message && { message }), 
      duration: duration || 5000 
    });
  }, [showToast]);

  const warning = React.useCallback((title: string, message?: string, duration?: number) => {
    return showToast({ 
      type: 'warning', 
      title, 
      ...(message && { message }), 
      duration: duration || 5000 
    });
  }, [showToast]);

  const info = React.useCallback((title: string, message?: string, duration?: number) => {
    return showToast({ 
      type: 'info', 
      title, 
      ...(message && { message }), 
      duration: duration || 5000 
    });
  }, [showToast]);

  return {
    toasts,
    showToast,
    removeToast,
    removeAllToasts,
    success,
    error,
    warning,
    info,
  };
}

// Toast Container Component
export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          isVisible={true}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}
