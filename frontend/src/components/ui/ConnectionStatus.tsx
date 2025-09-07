'use client';

import React from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface ConnectionStatusProps {
  isConnected: boolean;
  isConnecting?: boolean;
  isReconnecting?: boolean;
  reconnectAttempts?: number;
  latency?: number;
  error?: string;
  className?: string;
}

export function ConnectionStatus({
  isConnected,
  isConnecting = false,
  isReconnecting = false,
  reconnectAttempts = 0,
  latency,
  error,
  className = ''
}: ConnectionStatusProps) {
  const getStatusInfo = () => {
    if (isConnected) {
      return {
        icon: CheckCircleIcon,
        color: 'text-green-500',
        bgColor: 'bg-green-500',
        text: latency ? `Connected (${latency}ms)` : 'Connected',
        pulse: false
      };
    }
    
    if (isReconnecting) {
      return {
        icon: ArrowPathIcon,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500',
        text: `Reconnecting... (${reconnectAttempts})`,
        pulse: true
      };
    }
    
    if (isConnecting) {
      return {
        icon: ArrowPathIcon,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500',
        text: 'Connecting...',
        pulse: true
      };
    }
    
    return {
      icon: ExclamationCircleIcon,
      color: 'text-red-500',
      bgColor: 'bg-red-500',
      text: error || 'Disconnected',
      pulse: false
    };
  };

  const { icon: Icon, color, bgColor, text, pulse } = getStatusInfo();

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Status Indicator Dot */}
      <div className="relative">
        <div className={`w-2.5 h-2.5 rounded-full ${bgColor}`} />
        {pulse && (
          <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${bgColor} animate-ping opacity-75`} />
        )}
      </div>
      
      {/* Status Icon and Text */}
      <div className="flex items-center space-x-1">
        <Icon className={`w-4 h-4 ${color} ${pulse ? 'animate-spin' : ''}`} />
        <span className={`text-sm font-medium ${color}`}>
          {text}
        </span>
      </div>

      {/* Latency Badge */}
      {isConnected && latency && (
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
          latency < 100 
            ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : latency < 300
              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {latency}ms
        </div>
      )}
    </div>
  );
}

// Simplified version for compact displays
export function ConnectionIndicator({ 
  isConnected, 
  isConnecting, 
  className = '' 
}: Pick<ConnectionStatusProps, 'isConnected' | 'isConnecting' | 'className'>) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${
        isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
      }`} />
      <span className={`text-sm ${
        isConnected ? 'text-green-600 dark:text-green-400' : 
        isConnecting ? 'text-yellow-600 dark:text-yellow-400' : 
        'text-red-600 dark:text-red-400'
      }`}>
        {isConnected ? 'Online' : isConnecting ? 'Connecting...' : 'Offline'}
      </span>
    </div>
  );
}

export default ConnectionStatus;
