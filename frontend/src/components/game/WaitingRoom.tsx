'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/hooks/useGame';
import { useGameStore } from '@/stores/gameStore';
import { useSocket } from '@/hooks/useSocketSingleton';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StartGameModal } from './StartGameModal';
import { GamePlayer, PlayerStatus } from '@/types/game';
import { clearRoomSession } from '@/utils/roomSession';
import {
  UserGroupIcon,
  PlayIcon,
  ClockIcon,
  CogIcon,
  CheckIcon,
  XMarkIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

interface WaitingRoomProps {
  roomId: string;
  roomName: string;
  roomCode: string;
  players: GamePlayer[];
  isHost: boolean;
  maxPlayers?: number;
}

function getStatusBadge(status: PlayerStatus) {
  const variants = {
    'WAITING': { variant: 'secondary' as const, label: 'Waiting', icon: ClockIcon },
    'READY': { variant: 'default' as const, label: 'Ready', icon: CheckIcon },
    'PLAYING': { variant: 'default' as const, label: 'Playing', icon: PlayIcon },
    'SPECTATING': { variant: 'outline' as const, label: 'Spectating', icon: UserGroupIcon },
    'DISCONNECTED': { variant: 'destructive' as const, label: 'Disconnected', icon: XMarkIcon }
  };

  const config = variants[status] || variants['WAITING'];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="flex items-center space-x-1">
      <Icon className="w-3 h-3" />
      <span>{config.label}</span>
    </Badge>
  );
}

function PlayerCard({ player, isCurrentUser }: { player: GamePlayer; isCurrentUser: boolean }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border-2 p-4 transition-colors ${
      isCurrentUser 
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
        : 'border-gray-200 dark:border-gray-700'
    } ${
      !player.isOnline 
        ? 'opacity-60' 
        : ''
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white ${
            player.isHost 
              ? 'bg-yellow-500' 
              : player.isOnline 
                ? 'bg-green-500' 
                : 'bg-gray-400'
          }`}>
            {player.username?.[0]?.toUpperCase() || '?'}
          </div>
          
          <div>
            <div className="flex items-center space-x-2">
              <span className={`font-medium ${
                isCurrentUser 
                  ? 'text-blue-700 dark:text-blue-300' 
                  : 'text-gray-900 dark:text-white'
              }`}>
                {player.username}
                {isCurrentUser && ' (You)'}
              </span>
              
              {player.isHost && (
                <Badge variant="outline" className="text-xs">
                  Host
                </Badge>
              )}
            </div>
            
            <div className="flex items-center space-x-2 mt-1">
              {getStatusBadge(player.status)}
              
              {player.latency !== undefined && player.latency > 0 && (
                <span className={`text-xs ${
                  player.latency < 100 
                    ? 'text-green-600 dark:text-green-400'
                    : player.latency < 300
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  {player.latency}ms
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Connection indicator */}
        <div className={`w-3 h-3 rounded-full ${
          player.isOnline 
            ? 'bg-green-400 animate-pulse' 
            : 'bg-gray-400'
        }`} />
      </div>
    </div>
  );
}

export function WaitingRoom({ 
  roomId, 
  roomName, 
  roomCode, 
  players, 
  isHost,
  maxPlayers = 20 
}: WaitingRoomProps) {
  const router = useRouter();
  const { socket, connectionStatus } = useSocket();
  const { setPlayerReady } = useGame();
  const { user } = useAuth();
  const currentPlayer = useGameStore(state => state.currentPlayer);
  const gameStatus = useGameStore(state => state.gameStatus);
  const [showStartModal, setShowStartModal] = useState(false);
  const [isSettingReady, setIsSettingReady] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const onlinePlayers = players.filter(p => p.isOnline);
  const readyPlayers = players.filter(p => p.status === 'READY');
  const allPlayersReady = onlinePlayers.length > 0 && readyPlayers.length === onlinePlayers.length;
  const canStartGame = onlinePlayers.length >= 2 && isHost && allPlayersReady;
  
  // Get the current user's status from the room data (most reliable source)
  const currentUserInRoom = user ? players.find(p => p.userId === user.id) : null;
  const currentUserStatus = currentUserInRoom?.status || currentPlayer?.status || 'WAITING';

  const handleReadyToggle = async () => {
    if (!user) return;
    
    setIsSettingReady(true);
    try {
      const newReadyState = currentUserStatus !== 'READY';
      console.log('🔄 Toggling ready status:', { 
        currentStatus: currentUserStatus, 
        newReadyState, 
        userId: user.id,
        isHost 
      });
      
      await setPlayerReady(roomId, newReadyState);
    } catch (error) {
      console.error('Failed to toggle ready status:', error);
    } finally {
      setIsSettingReady(false);
    }
  };

  const handleStartGame = () => {
    if (!canStartGame) return;
    setShowStartModal(true);
  };

  const handleLeaveRoom = async () => {
    if (isLeaving) return;
    
    setIsLeaving(true);
    try {
      // Leave via socket
      if (socket && connectionStatus.isConnected) {
        const response = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Leave room timeout'));
          }, 5000);

          socket.emit('room:leave', { roomId }, (response: any) => {
            clearTimeout(timeout);
            resolve(response);
          });
        });

        if (!response.success) {
          console.warn('Socket leave failed:', response.error);
        }
      }
      
      // Clear room session and navigate to dashboard
      clearRoomSession();
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to leave room:', err);
      // Still navigate away even if leaving failed
      router.push('/dashboard');
    } finally {
      setIsLeaving(false);
    }
  };

  if (gameStatus === 'STARTING') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Game Starting...
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Get ready! The quiz will begin in a moment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Room Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {roomName}
            </h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center space-x-1">
                <span>Room Code:</span>
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono font-semibold">
                  {roomCode}
                </code>
              </div>
              <div className="flex items-center space-x-1">
                <UserGroupIcon className="w-4 h-4" />
                <span>{onlinePlayers.length}/{maxPlayers} players</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 mt-4 md:mt-0">
            {/* Leave Room Button */}
            <Button
              onClick={handleLeaveRoom}
              variant="outline"
              size="sm"
              disabled={isLeaving}
              className="flex items-center space-x-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span>{isLeaving ? 'Leaving...' : 'Leave Room'}</span>
            </Button>

            {/* Ready Status - Available for all players including host */}
            {user && (
              <Button
                onClick={handleReadyToggle}
                disabled={isSettingReady}
                variant={currentUserStatus === 'READY' ? 'primary' : 'outline'}
                className="flex items-center space-x-2"
              >
                {currentUserStatus === 'READY' ? (
                  <CheckIcon className="w-4 h-4" />
                ) : (
                  <ClockIcon className="w-4 h-4" />
                )}
                <span>
                  {isSettingReady 
                    ? 'Updating...' 
                    : currentUserStatus === 'READY' 
                      ? 'Not Ready' 
                      : 'Mark Ready'
                  }
                </span>
              </Button>
            )}

            {/* Start Game Button */}
            {isHost && (
              <Button
                onClick={handleStartGame}
                disabled={!canStartGame}
                variant="primary"
                size="lg"
                className="flex items-center space-x-2"
              >
                <PlayIcon className="w-4 h-4" />
                <span>
                  {onlinePlayers.length < 2 
                    ? `Start Game (Need ${2 - onlinePlayers.length} more players)`
                    : !allPlayersReady
                      ? `Start Game (${onlinePlayers.length - readyPlayers.length} players not ready)`
                      : 'Start Game'
                  }
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Status Messages */}
        <div className="mt-4">
          {onlinePlayers.length < 2 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
              <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                ⚠️ At least 2 players are needed to start the game. 
                Share the room code <strong>{roomCode}</strong> with friends!
              </p>
            </div>
          )}

          {onlinePlayers.length >= 2 && !allPlayersReady && currentUserStatus !== 'READY' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                💡 Mark yourself as ready when you're prepared to play!
              </p>
            </div>
          )}

          {onlinePlayers.length >= 2 && !allPlayersReady && !isHost && currentUserStatus === 'READY' && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
              <p className="text-green-700 dark:text-green-300 text-sm">
                ✅ You're ready! Waiting for {onlinePlayers.length - readyPlayers.length} more player(s) and the host to start.
              </p>
            </div>
          )}

          {onlinePlayers.length >= 2 && !allPlayersReady && isHost && currentUserStatus === 'READY' && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md p-3">
              <p className="text-orange-700 dark:text-orange-300 text-sm">
                ⏳ You're ready! Waiting for {onlinePlayers.length - readyPlayers.length} more player(s) to be ready.
              </p>
            </div>
          )}

          {onlinePlayers.length >= 2 && !allPlayersReady && isHost && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md p-3">
              <p className="text-orange-700 dark:text-orange-300 text-sm">
                🔒 Cannot start game yet! {onlinePlayers.length - readyPlayers.length} player(s) need to mark themselves as ready.
              </p>
            </div>
          )}

          {onlinePlayers.length >= 2 && allPlayersReady && isHost && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
              <p className="text-green-700 dark:text-green-300 text-sm">
                ✅ All players are ready! You can start the game now.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Players Grid */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Players ({onlinePlayers.length}/{maxPlayers})
          </h2>
          
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-gray-600 dark:text-gray-400">
                Ready: {readyPlayers.length}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <ClockIcon className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">
                Waiting: {onlinePlayers.length - readyPlayers.length}
              </span>
            </div>
          </div>
        </div>

        {players.length === 0 ? (
          <div className="text-center py-12">
            <UserGroupIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No players in the room yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Room Code: {roomCode}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {players.map(player => (
              <PlayerCard
                key={player.userId}
                player={player}
                isCurrentUser={player.userId === currentPlayer?.userId || player.userId === user?.id}
              />
            ))}
          </div>
        )}

        {/* Empty slots */}
        {onlinePlayers.length < maxPlayers && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: Math.min(3, maxPlayers - onlinePlayers.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="bg-gray-50 dark:bg-gray-700/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex items-center justify-center"
              >
                <div className="text-center">
                  <UserGroupIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Waiting for player...
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
          How to Play:
        </h3>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>• Share the room code <strong>{roomCode}</strong> with friends to invite them</li>
          <li>• Mark yourself as ready when you're prepared to play</li>
          <li>• {isHost ? 'As the host, you can start the game when ready' : 'Wait for the host to start the game'}</li>
          <li>• Answer questions quickly to earn bonus points</li>
          <li>• Consecutive correct answers earn streak bonuses</li>
        </ul>
      </div>

      {/* Start Game Modal */}
      <StartGameModal
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        roomId={roomId}
        playerCount={onlinePlayers.length}
      />
    </div>
  );
}
