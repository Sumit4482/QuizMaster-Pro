'use client';

import React from 'react';
import { Button } from './Button';
import { Badge } from './Badge';
import { LoadingSpinner } from './LoadingSpinner';
import {
  UserGroupIcon,
  LockClosedIcon,
  ClockIcon,
  ArrowRightIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

export type RoomStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'PAUSED';

export interface RoomData {
  id: string;
  code: string;
  name: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  hasPassword: boolean;
  status: RoomStatus;
  createdAt: string;
  gameType?: string;
}

interface RoomCardProps {
  room: RoomData;
  onJoin?: (room: RoomData) => void;
  isJoining?: boolean;
  className?: string;
}

export function RoomCard({ room, onJoin, isJoining = false, className = '' }: RoomCardProps) {
  const getStatusInfo = (status: RoomStatus) => {
    switch (status) {
      case 'WAITING':
        return {
          badge: { variant: 'default' as const, text: 'Waiting' },
          icon: ClockIcon,
          iconColor: 'text-green-500',
          canJoin: room.currentPlayers < room.maxPlayers,
          joinText: 'Join Room'
        };
      case 'IN_PROGRESS':
        return {
          badge: { variant: 'outline' as const, text: 'In Progress' },
          icon: PlayIcon,
          iconColor: 'text-blue-500',
          canJoin: false,
          joinText: 'Game Started'
        };
      case 'PAUSED':
        return {
          badge: { variant: 'outline' as const, text: 'Paused' },
          icon: PauseIcon,
          iconColor: 'text-yellow-500',
          canJoin: false,
          joinText: 'Game Paused'
        };
      case 'FINISHED':
        return {
          badge: { variant: 'secondary' as const, text: 'Finished' },
          icon: CheckIcon,
          iconColor: 'text-gray-500',
          canJoin: false,
          joinText: 'Game Ended'
        };
      default:
        return {
          badge: { variant: 'secondary' as const, text: status },
          icon: ExclamationCircleIcon,
          iconColor: 'text-gray-500',
          canJoin: false,
          joinText: 'Unavailable'
        };
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  const getPlayersColor = () => {
    const ratio = room.currentPlayers / room.maxPlayers;
    if (ratio >= 0.9) return 'text-red-600 dark:text-red-400';
    if (ratio >= 0.7) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const statusInfo = getStatusInfo(room.status);

  return (
    <div className={`
      group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 
      shadow-sm hover:shadow-md transition-all duration-300 ease-in-out
      hover:border-blue-300 dark:hover:border-blue-600
      transform hover:-translate-y-1 hover:scale-[1.02]
      ${className}
    `}>
      {/* Room Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {room.name}
            </h3>
            <div className="flex items-center space-x-3 mt-1">
              <p className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                {room.code}
              </p>
              {room.gameType && (
                <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                  {room.gameType}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2 ml-3">
            {room.isPrivate && (
              <div className="p-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-full" title="Private Room">
                <LockClosedIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              </div>
            )}
            <Badge variant={statusInfo.badge.variant}>
              {statusInfo.badge.text}
            </Badge>
          </div>
        </div>

        {/* Room Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          {/* Players */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
              <UserGroupIcon className="w-4 h-4" />
              <span>Players:</span>
            </div>
            <div className={`flex items-center space-x-1 font-medium ${getPlayersColor()}`}>
              <span>{room.currentPlayers}</span>
              <span className="text-gray-400">/</span>
              <span>{room.maxPlayers}</span>
            </div>
          </div>

          {/* Created Time */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
              <ClockIcon className="w-4 h-4" />
              <span>Created:</span>
            </div>
            <span className="text-gray-900 dark:text-white font-medium">
              {formatTimeAgo(room.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Room Footer */}
      <div className="px-6 pb-6">
        <Button
          onClick={() => onJoin?.(room)}
          disabled={!statusInfo.canJoin || isJoining}
          className="w-full group-hover:scale-105 transition-transform duration-200"
          variant={statusInfo.canJoin ? 'primary' : 'secondary'}
        >
          {isJoining ? (
            <LoadingSpinner size="sm" />
          ) : (
            <>
              <statusInfo.icon className={`w-4 h-4 mr-2 ${statusInfo.iconColor}`} />
              {statusInfo.joinText}
              {statusInfo.canJoin && <ArrowRightIcon className="w-4 h-4 ml-2" />}
            </>
          )}
        </Button>

        {/* Status Messages */}
        <div className="mt-3 text-center">
          {room.currentPlayers >= room.maxPlayers && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
              Room is full
            </p>
          )}
          {room.status !== 'WAITING' && room.status !== 'PAUSED' && (
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {room.status === 'IN_PROGRESS' ? 'Game in progress' : 'Game has ended'}
            </p>
          )}
          {room.hasPassword && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded mt-1">
              Password required
            </p>
          )}
        </div>
      </div>

      {/* Animated Background Gradient */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </div>
  );
}

export default RoomCard;
