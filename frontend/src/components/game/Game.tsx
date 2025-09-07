'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '@/hooks/useGame';
import { useGameStore } from '@/stores/gameStore';
import { useSocket } from '@/hooks/useSocketSingleton';
import { useAuth } from '@/hooks/useAuth';
import { WaitingRoom } from './WaitingRoom';
import { LiveGame } from './LiveGame';
import { GameResults } from './GameResults';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { GameStatus, GamePlayer, PlayerStatus } from '@/types/game';
import { Room } from '@/types/room';
import { clearRoomSession } from '@/utils/roomSession';
import { toast } from 'react-hot-toast';
import {
  ExclamationTriangleIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

interface GameProps {
  room: Room;
}

export function Game({ room }: GameProps) {
  const router = useRouter();
  const { socket, connectionStatus } = useSocket();
  const { leaveGame, getGameState } = useGame();
  const { user } = useAuth();
  
  const {
    currentGame,
    gameStatus,
    isInGame,
    currentPlayer,
    isHost,
    isLoading,
    error,
    gameEnd
  } = useGameStore();
  
  const [isLeaving, setIsLeaving] = useState(false);
  const [showError, setShowError] = useState(false);

  // Initialize game state when component mounts
  useEffect(() => {
    if (socket && connectionStatus.isConnected && room.id) {
      // Check if there's an active game in this room
      if (room.status === 'IN_PROGRESS' && room.quizId) {
        // Try to join existing game
        getGameState(room.id);
      }
    }
  }, [socket, connectionStatus.isConnected, room.id, room.status, room.quizId, getGameState]);

  // Initialize current player from room participants if not set
  useEffect(() => {
    if (user?.id && room.participants && !currentPlayer) {
      const players = roomPlayersToGamePlayers(room.participants);
      const myPlayer = players.find(p => p.userId === user.id);
      if (myPlayer) {
        useGameStore.getState().actions.setCurrentPlayer(myPlayer);
        console.log('🎮 Initialized current player from room:', myPlayer.username, myPlayer.isHost ? '(HOST)' : '(PLAYER)');
      }
    }
  }, [user?.id, room.participants, currentPlayer]);

  // Handle connection issues
  useEffect(() => {
    if (!connectionStatus.isConnected && isInGame) {
      setShowError(true);
    } else {
      setShowError(false);
    }
  }, [connectionStatus.isConnected, isInGame]);

  // Auto-hide error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        useGameStore.getState().actions.setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
    return () => {}; // Return empty cleanup function if no error
  }, [error]);

  const handleLeaveGame = async () => {
    if (isLeaving) return;
    
    setIsLeaving(true);
    try {
      // First try to leave via socket
      if (socket && connectionStatus.isConnected) {
        const response = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Leave room timeout'));
          }, 5000);

          socket.emit('room:leave', { roomId: room.id }, (response: any) => {
            clearTimeout(timeout);
            resolve(response);
          });
        });

        if (!response.success) {
          console.warn('Socket leave failed:', response.error);
        }
      }

      // Also try game leave if there's an active game
      if (currentGame) {
        await leaveGame(room.id);
      }
      
      // Clear room session and navigate to dashboard
      clearRoomSession();
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to leave room/game:', err);
      // Still navigate away even if leaving failed
      router.push('/dashboard');
    } finally {
      setIsLeaving(false);
    }
  };

  const handlePlayAgain = () => {
    // Reset game state and show waiting room
    useGameStore.getState().actions.clearGame();
    // The waiting room will be shown automatically
  };

  const handlePlayNextQuiz = () => {
    // Clear current game state but keep the room active
    useGameStore.getState().actions.clearGame();
    // Navigate back to waiting room where players can start a new quiz
    toast.success('Ready for next quiz! Configure new settings in the waiting room.');
  };

  // Convert room participants to game players format
  const roomPlayersToGamePlayers = (participants: Map<string, any> | Record<string, any> | undefined): GamePlayer[] => {
    if (!participants) {
      console.log('⚠️ No participants provided to roomPlayersToGamePlayers');
      return [];
    }

    // Handle both Map and Object formats (Socket.io serialization converts Maps to Objects)
    let participantValues: any[];
    if (participants instanceof Map) {
      participantValues = Array.from(participants.values());
    } else if (typeof participants === 'object') {
      participantValues = Object.values(participants);
    } else {
      console.log('⚠️ Invalid participants format:', typeof participants);
      return [];
    }

    console.log('🎮 Converting participants to game players:', {
      count: participantValues.length,
      participants: participantValues.map(p => ({ id: p.userId, username: p.username, role: p.role, isOnline: p.isOnline }))
    });

    const gamePlayers = participantValues
      .filter(participant => {
        // Ensure participant has required fields
        if (!participant.userId || !participant.username) {
          console.warn('⚠️ Invalid participant data:', participant);
          return false;
        }
        return true;
      })
      .map((participant, index) => ({
        userId: participant.userId,
        username: participant.username,
        socketId: participant.socketId || '',
        status: (participant.isReady ? 'READY' : 'WAITING') as PlayerStatus,
        joinedAt: participant.joinedAt ? new Date(participant.joinedAt) : new Date(),
        score: 0,
        rank: index + 1,
        accuracy: 0,
        averageResponseTime: 0,
        totalTimeTaken: 0,
        averageTime: 0,
        currentStreak: 0,
        bestStreak: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        answers: new Map(),
        timeBonuses: 0,
        streakBonuses: 0,
        hintsUsed: 0,
        latency: 0,
        lastPing: new Date(),
        isHost: participant.role === 'HOST',
        isOnline: Boolean(participant.isOnline),
        canAnswer: true,
        canChat: true,
        lastActivity: participant.lastActivity ? new Date(participant.lastActivity) : new Date()
      }));

    console.log('✅ Converted to game players:', {
      count: gamePlayers.length,
      players: gamePlayers.map(p => ({ id: p.userId, username: p.username, isHost: p.isHost, isOnline: p.isOnline }))
    });

    return gamePlayers;
  };

  // Error state
  if (!connectionStatus.isConnected && !currentGame) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-700 dark:text-red-300 mb-2">
            Connection Lost
          </h2>
          <p className="text-red-600 dark:text-red-400 mb-4">
            You've been disconnected from the game. Please check your internet connection.
          </p>
          <Button onClick={() => window.location.reload()} variant="primary">
            Reconnect
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading && !currentGame) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600 dark:text-gray-400 mt-4">
            Loading game...
          </p>
        </div>
      </div>
    );
  }

  // Render based on game status
  const renderGameContent = () => {
    // Safety check - if no room data, show loading
    if (!room) {
      return (
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <LoadingSpinner size="lg" />
            <p className="text-gray-600 dark:text-gray-400 mt-4">
              Loading room data...
            </p>
          </div>
        </div>
      );
    }

    // Game finished - show results
    if (gameStatus === 'FINISHED' && gameEnd) {
      return (
        <GameResults
          result={gameEnd.finalResults}
          currentPlayer={currentPlayer}
          onLeaveGame={handleLeaveGame}
          onPlayNextQuiz={handlePlayNextQuiz}
          {...(isHost ? { onPlayAgain: handlePlayAgain } : {})}
        />
      );
    }

    // Active game - show live game interface
    if (currentGame && (gameStatus === 'IN_PROGRESS' || gameStatus === 'QUESTION_BREAK' || gameStatus === 'PAUSED')) {
      return <LiveGame roomId={room.id} />;
    }

    // Game starting
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

    // Default to waiting room
    console.log('🏠 Rendering waiting room - Current state:', {
      gameStatus,
      hasCurrentGame: !!currentGame,
      isInGame,
      roomStatus: room.status,
      roomId: room.id
    });
    
    console.log('🎯 About to convert participants to players:', {
      hasCurrentGame: !!currentGame,
      roomParticipants: room.participants,
      participantsSize: room.participants instanceof Map ? room.participants.size : 
                      typeof room.participants === 'object' ? Object.keys(room.participants).length : 'unknown',
      participantsType: room.participants instanceof Map ? 'Map' : typeof room.participants
    });
    
    const players = currentGame ? currentGame.players : roomPlayersToGamePlayers(room.participants);
    
    console.log('✅ Players after conversion:', {
      playersCount: players.length,
      players: players.map(p => ({ id: p.userId, username: p.username, isHost: p.isHost, isOnline: p.isOnline }))
    });
    
    // Debug: Check if creator is properly showing up
    if (players.length === 0) {
      console.log('⚠️ No players in UI - Room data:', {
        participantsSize: room.participants instanceof Map ? room.participants.size : 
                        typeof room.participants === 'object' ? Object.keys(room.participants).length : 'unknown',
        participantsType: room.participants instanceof Map ? 'Map' : typeof room.participants,
        currentPlayers: room.currentPlayers,
        roomId: room.id,
        roomCode: room.code,
        rawParticipants: room.participants
      });
    }

    // Set current player if not already set in game store
    if (!currentPlayer && players.length > 0) {
      const myPlayer = players.find(p => p.userId === user?.id);
      if (myPlayer) {
        useGameStore.getState().actions.setCurrentPlayer(myPlayer);
        console.log('🔧 Setting current player from room participants:', myPlayer.username);
      }
    }
    
    return (
      <WaitingRoom
        roomId={room.id}
        roomName={room.name}
        roomCode={room.code}
        players={players}
        isHost={players.some(p => p.userId === user?.id && p.isHost)}
        maxPlayers={room.maxPlayers}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button
                onClick={handleLeaveGame}
                variant="outline"
                size="sm"
                disabled={isLeaving}
                className="flex items-center space-x-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>{isLeaving ? 'Leaving...' : 'Leave Room'}</span>
              </Button>
              
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Room: <span className="font-mono font-semibold">{room.code}</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className={`flex items-center space-x-2 text-sm ${
                connectionStatus.isConnected 
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus.isConnected ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span>
                  {connectionStatus.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* Game Status */}
              {currentGame && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Status: <span className="font-semibold capitalize">{gameStatus.toLowerCase()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {(error || showError) && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                <span className="text-red-700 dark:text-red-300 text-sm">
                  {error || 'Connection issues detected. Some features may not work properly.'}
                </span>
              </div>
              
              {error && (
                <button
                  onClick={() => useGameStore.getState().actions.setError(null)}
                  className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="py-6">
        {renderGameContent()}
      </div>
    </div>
  );
}
