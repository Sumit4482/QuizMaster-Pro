'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoom } from '@/contexts/SocketContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ArrowRightIcon, HashtagIcon } from '@heroicons/react/24/outline';

interface QuickJoinProps {
  onRoomJoined?: (room: any) => void;
  className?: string;
}

export function QuickJoin({ onRoomJoined, className = '' }: QuickJoinProps) {
  const router = useRouter();
  const { joinRoom } = useRoom();
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleRoomCodeChange = (value: string) => {
    // Convert to uppercase and limit to 6 characters
    const formattedCode = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomCode(formattedCode);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate room code
    if (!roomCode || roomCode.trim().length === 0) {
      setError('Please enter a room code');
      return;
    }
    
    if (roomCode.length !== 6) {
      setError('Room code must be exactly 6 characters long');
      return;
    }

    // Validate password if shown
    if (showPassword && !password.trim()) {
      setError('Password is required for this room');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      const room = await joinRoom(roomCode.toUpperCase(), password.trim() || undefined);
      
      // Navigate to room page on success using Next.js router
      router.push(`/room/${roomCode.toUpperCase()}`);
      
      onRoomJoined?.(room);
      
      // Reset form on success
      setRoomCode('');
      setPassword('');
      setShowPassword(false);
    } catch (error: any) {
      console.error('Failed to join room:', error);
      
      // Handle specific error types with better user messaging
      const errorMessage = error.message || 'Failed to join room';
      
      if (errorMessage.includes('PASSWORD_REQUIRED') || errorMessage.includes('password') && !showPassword) {
        setShowPassword(true);
        setError('This room requires a password. Please enter it below.');
      } else if (errorMessage.includes('INVALID_PASSWORD') || (errorMessage.includes('password') && showPassword)) {
        setError('Incorrect password. Please check with the room host.');
      } else if (errorMessage.includes('ROOM_NOT_FOUND') || errorMessage.includes('not found')) {
        setError('Room not found. Please check the room code.');
      } else if (errorMessage.includes('ROOM_FULL') || errorMessage.includes('full')) {
        setError('This room is full. Please try another room.');
      } else if (errorMessage.includes('ROOM_FINISHED') || errorMessage.includes('finished')) {
        setError('This room has already finished.');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('connection')) {
        setError('Connection timeout. Please check your internet and try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const isFormValid = roomCode.length === 6 && (!showPassword || password.trim());

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Join Room
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter a 6-character room code to join an existing room
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Room Code Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Room Code
          </label>
          <div className="relative">
            <HashtagIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              value={roomCode}
              onChange={(e) => handleRoomCodeChange(e.target.value)}
              placeholder="ABC123"
              className="pl-10 font-mono text-lg tracking-wider"
              maxLength={6}
              disabled={isJoining}
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {roomCode.length}/6 characters
          </p>
        </div>

        {/* Password Input (shown when needed) */}
        {showPassword && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Room Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter room password..."
              disabled={isJoining}
              maxLength={100}
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!isFormValid || isJoining}
          className="w-full"
        >
          {isJoining ? (
            <LoadingSpinner size="sm" />
          ) : (
            <>
              Join Room
              <ArrowRightIcon className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </form>

      {/* Help Text */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Room codes are case-insensitive and contain only letters and numbers.
          Ask the room host for the code and password (if required).
        </p>
      </div>
    </div>
  );
}
