'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocketSingleton';
import { useAuth } from '@/hooks/useAuth';
import { Game } from '@/components/game/Game';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import { Room, RoomStatus } from '@/types/room';
import { storeRoomSession, clearRoomSession, isCurrentRoomSession } from '@/utils/roomSession';
import {
  ExclamationTriangleIcon,
  HomeIcon
} from '@heroicons/react/24/outline';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const { socket, connectionStatus } = useSocket();
  const { user, isAuthenticated, isLoading } = useAuth();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const roomCode = params.roomId as string; // Note: Still using roomId param name for URL compatibility, but it's actually a room code

  // Convert serialized room data to frontend format with better error handling
  const deserializeRoom = (roomData: any): Room => {
    try {
      if (!roomData || typeof roomData !== 'object') {
        throw new Error('Invalid room data received');
      }

      // Validate essential required fields only
      const requiredFields = ['id', 'code', 'name', 'status'];
      const missingFields = requiredFields.filter(field => !roomData[field]);
      
      if (missingFields.length > 0) {
        console.warn('Room data missing fields:', missingFields, 'Available fields:', Object.keys(roomData));
        // Instead of throwing, provide defaults for missing fields
        roomData = {
          id: roomData.id || 'unknown',
          code: roomData.code || 'UNKNOWN',
          name: roomData.name || 'Unnamed Room',
          status: roomData.status || 'WAITING',
          ...roomData
        };
      }

      // Validate field types more safely
      const id = String(roomData.id);
      const code = String(roomData.code);
      const name = String(roomData.name);
      const status = String(roomData.status);

      return {
        id: id,
        code: code,
        name: name,
        createdBy: roomData.createdBy || roomData.hostId || 'unknown',
        createdAt: roomData.createdAt ? new Date(roomData.createdAt) : new Date(),
        maxPlayers: roomData.maxPlayers || 10,
        currentPlayers: roomData.currentPlayers || 0,
        isPrivate: Boolean(roomData.isPrivate),
        password: roomData.password,
        status: status as RoomStatus,
        settings: {
          allowSpectators: true,
          allowReconnection: true,
          autoStart: false,
          questionTimeLimit: 30,
          showCorrectAnswers: true,
          allowHints: false,
          shuffleQuestions: true,
          shuffleAnswers: true,
          requireApproval: false,
          ...roomData.settings
        },
        participants: roomData.participants 
          ? roomData.participants instanceof Map 
            ? roomData.participants
            : new Map(Object.entries(roomData.participants || {}))
          : new Map(),
        lastActivity: roomData.lastActivity ? new Date(roomData.lastActivity) : new Date(),
        quizId: roomData.quizId,
        currentQuestionIndex: roomData.currentQuestionIndex
      };
    } catch (err) {
      console.error('Failed to deserialize room data:', err);
      console.error('Room data received:', JSON.stringify(roomData, null, 2));
      
      // Provide more helpful error info
      if (roomData && typeof roomData === 'object') {
        const availableFields = Object.keys(roomData);
        console.error('Available fields in room data:', availableFields);
      }
      
      throw new Error(`Failed to process room data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Redirect if not authenticated, but wait for auth to initialize
  useEffect(() => {
    // Don't redirect while auth is still loading
    if (isLoading) return;
    
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
  }, [isAuthenticated, isLoading, router]);

  // Load room data when socket is connected with retry logic
  useEffect(() => {
    if (!socket || !connectionStatus.isConnected || !roomCode || isLoading) {
      return;
    }

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    const loadRoom = async (attempt = 1): Promise<void> => {
      setLoading(true);
      if (attempt === 1) setError(null);

      try {
        // Validate room code format
        if (!roomCode || roomCode.length !== 6) {
          throw new Error('Invalid room code. Room codes must be 6 characters long.');
        }

        // Try to join the room first to get full room data
        const response = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Request timed out. Please check your connection.'));
          }, 10000); // 10 second timeout

          socket.emit('room:join', { roomCode: roomCode.toUpperCase() }, (response: any) => {
            clearTimeout(timeout);
            resolve(response);
          });
        });

        console.log('Room join response:', response);
        
        if (response.success) {
          const roomData = deserializeRoom(response.data);
          console.log('🏠 Room Joined Successfully:', roomData.name, 'Participants:', roomData.participants.size);
          console.log('🔍 Full room data structure:', {
            id: roomData.id,
            code: roomData.code,
            participants: roomData.participants,
            participantsArray: Array.from(roomData.participants.entries()),
            currentPlayers: roomData.currentPlayers
          });
          
          // Store room session for reconnection
          storeRoomSession({
            id: roomData.id,
            code: roomData.code,
            name: roomData.name,
          });
          
          setRoom(roomData);
          setError(null);
        } else {
          const errorMessage = response.error?.message || 'Failed to join room';
          
          // Handle specific error types
          if (response.error?.code === 'PASSWORD_REQUIRED') {
            const password = window.prompt('This room requires a password:');
            if (password) {
              // Retry with password
              const passwordResponse = await new Promise<any>((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Request timed out. Please check your connection.'));
                }, 10000);

                socket.emit('room:join', { 
                  roomCode: roomCode.toUpperCase(), 
                  password 
                }, (response: any) => {
                  clearTimeout(timeout);
                  resolve(response);
                });
              });

              if (passwordResponse.success) {
                const roomData = deserializeRoom(passwordResponse.data);
                
                // Store room session for reconnection
                storeRoomSession({
                  id: roomData.id,
                  code: roomData.code,
                  name: roomData.name,
                });
                
                setRoom(roomData);
                setError(null);
                return;
              } else {
                throw new Error(passwordResponse.error?.message || 'Invalid password');
              }
            } else {
              throw new Error('Password required to join this room');
            }
          } else {
            throw new Error(errorMessage);
          }
        }
      } catch (err) {
        console.error(`Failed to join room (attempt ${attempt}):`, err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to join room';
        
        // Retry logic for transient errors
        if (attempt < maxRetries && (
          errorMessage.includes('timeout') || 
          errorMessage.includes('connection') ||
          errorMessage.includes('network')
        )) {
          console.log(`Retrying room join in ${retryDelay}ms... (${attempt}/${maxRetries})`);
          setTimeout(() => {
            loadRoom(attempt + 1);
          }, retryDelay * attempt);
          return;
        }
        
        setError(errorMessage);
      } finally {
        if (attempt >= maxRetries || !error) {
          setLoading(false);
        }
      }
    };

    loadRoom();
  }, [socket, connectionStatus.isConnected, roomCode]);

  // Handle room updates with better error handling
  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdate = (data: any) => {
      try {
        console.log('Room update event received:', data);
        
        // Skip updates that don't include participant data (public room list updates)
        if (data.room && data.room.id === room?.id) {
          // Check if this update has participant data - if not, skip it to avoid clearing participants
          const hasParticipants = data.room.participants && 
            (typeof data.room.participants === 'object') &&
            (data.room.participants instanceof Map ? data.room.participants.size > 0 : Object.keys(data.room.participants).length > 0);
          
          console.log('🔍 Room update analysis:', {
            roomId: data.room.id,
            hasParticipants,
            participantsType: typeof data.room.participants,
            participantsData: data.room.participants,
            skipUpdate: !hasParticipants
          });
          
          if (hasParticipants) {
            const updatedRoom = deserializeRoom(data.room);
            console.log('✅ Applying room update with participants:', updatedRoom.participants.size);
            setRoom(updatedRoom);
          } else {
            console.log('⚠️ Skipping room update - no participant data (likely public room list update)');
          }
        }
      } catch (err) {
        console.error('Failed to handle room update:', err);
      }
    };

    const handleUserJoined = (data: any) => {
      try {
        console.log('👤 User joined event received:', data);
        
        // Always prefer full room data if available
        if (data.room) {
          console.log('🔍 User joined - checking room data:', {
            hasParticipants: !!data.room.participants,
            participantsType: typeof data.room.participants,
            participantsLength: data.room.participants ? Object.keys(data.room.participants).length : 0,
            rawParticipants: data.room.participants
          });
          
          const updatedRoom = deserializeRoom(data.room);
          console.log('✅ Room updated via user_joined event:', {
            roomCode: updatedRoom.code,
            participants: updatedRoom.participants.size,
            participantsList: Array.from(updatedRoom.participants.entries())
          });
          setRoom(updatedRoom);
          return;
        }
        
        // Otherwise, update participants manually (fallback)
        setRoom(prev => {
          if (!prev) {
            console.log('No room state yet, waiting for room data');
            return prev;
          }
          
          try {
            const updatedParticipants = new Map(prev.participants);
            
            // Use participant data if provided, otherwise construct from user data
            const participantData = data.participant ? {
              ...data.participant,
              joinedAt: new Date(data.participant.joinedAt),
              lastActivity: new Date(data.participant.lastActivity || Date.now()),
              isOnline: true
            } : {
              userId: data.user?.id,
              username: data.user?.username,
              socketId: '',
              joinedAt: new Date(data.timestamp || Date.now()),
              role: 'PLAYER',
              isOnline: true,
              lastActivity: new Date()
            };
            
            // Validate required participant data
            if (!participantData.userId || !participantData.username) {
              console.warn('Invalid participant data received:', participantData);
              return prev;
            }
            
            updatedParticipants.set(participantData.userId, participantData);
            
            const onlineParticipants = Array.from(updatedParticipants.values()).filter(p => p.isOnline);
            console.log('Updated participants:', {
              total: updatedParticipants.size,
              online: onlineParticipants.length,
              list: Array.from(updatedParticipants.entries())
            });
            
            return {
              ...prev,
              participants: updatedParticipants,
              currentPlayers: onlineParticipants.length
            };
          } catch (err) {
            console.error('Failed to update participants:', err);
            return prev;
          }
        });
      } catch (err) {
        console.error('Failed to handle user joined event:', err);
      }
    };

    const handleUserLeft = (data: any) => {
      try {
        console.log('User left event received:', data);
        if (!room || !data.user?.id) return;

        setRoom(prev => {
          if (!prev) return prev;
          
          try {
            const updatedParticipants = new Map(prev.participants);
            const removed = updatedParticipants.delete(data.user.id);
            
            if (removed) {
              console.log(`Removed user ${data.user.username} from room`);
              return {
                ...prev,
                participants: updatedParticipants,
                currentPlayers: updatedParticipants.size
              };
            }
            return prev;
          } catch (err) {
            console.error('Failed to remove participant:', err);
            return prev;
          }
        });
      } catch (err) {
        console.error('Failed to handle user left event:', err);
      }
    };

    const handleRoomStatusChanged = (data: any) => {
      try {
        console.log('Room status changed:', data);
        if (data.room && data.room.id === room?.id) {
          const updatedRoom = deserializeRoom(data.room);
          setRoom(updatedRoom);
        } else if (room && data.roomId === room.id) {
          setRoom(prev => prev ? { ...prev, status: data.newStatus } : prev);
        }
      } catch (err) {
        console.error('Failed to handle room status change:', err);
      }
    };

    const handleParticipantReady = (data: any) => {
      try {
        console.log('🔥 Participant ready status changed:', data);
        
        // If room data is provided in the event, use it to update everything  
        if (data.room) {
          const updatedRoom = deserializeRoom(data.room);
          console.log('✅ Room updated via participant_ready event:', {
            roomCode: updatedRoom.code,
            participants: updatedRoom.participants.size,
            readyParticipants: Array.from(updatedRoom.participants.values()).filter(p => p.isReady).length
          });
          setRoom(updatedRoom);
          return;
        }
        
        // Otherwise, update participant manually
        setRoom(prev => {
          if (!prev) return prev;
          
          try {
            const updatedParticipants = new Map(prev.participants);
            const participant = updatedParticipants.get(data.user.id);
            
            if (participant) {
              participant.isReady = data.isReady;
              participant.lastActivity = new Date();
              updatedParticipants.set(data.user.id, participant);
              
              console.log(`✅ Updated ${data.user.username} ready status: ${data.isReady}`);
              return {
                ...prev,
                participants: updatedParticipants
              };
            }
            return prev;
          } catch (err) {
            console.error('Failed to update participant ready status:', err);
            return prev;
          }
        });
      } catch (err) {
        console.error('Failed to handle participant ready event:', err);
      }
    };

    // Register event handlers
    socket.on('rooms:updated', handleRoomUpdate);
    socket.on('room:user_joined', handleUserJoined);
    socket.on('room:user_left', handleUserLeft);
    socket.on('room:status_changed', handleRoomStatusChanged);
    socket.on('room:participant_ready', handleParticipantReady);

    return () => {
      socket.off('rooms:updated', handleRoomUpdate);
      socket.off('room:user_joined', handleUserJoined);
      socket.off('room:user_left', handleUserLeft);
      socket.off('room:status_changed', handleRoomStatusChanged);
      socket.off('room:participant_ready', handleParticipantReady);
    };
  }, [socket, room]);

  // Show loading state
  if (isLoading || (!isAuthenticated && !isLoading) || loading) {
    const getLoadingText = () => {
      if (isLoading) return 'Checking authentication...';
      if (!isAuthenticated) return 'Redirecting to login...';
      return `Joining room ${roomCode.toUpperCase()}...`;
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center p-8 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-2xl">
          <LoadingSpinner 
            size="xl" 
            text={getLoadingText()}
          />
        </div>
      </div>
    );
  }

  // Show error state with improved UI and better error handling
  if (error || (!loading && !room)) {
    const getErrorTitle = () => {
      if (!error) return 'Room Not Found';
      if (error.includes('password')) return 'Access Denied';
      if (error.includes('full')) return 'Room is Full';
      if (error.includes('timeout') || error.includes('connection')) return 'Connection Problem';
      if (error.includes('code')) return 'Invalid Room Code';
      return 'Unable to Join Room';
    };

    const getErrorIcon = () => {
      if (error?.includes('password')) return 'lock';
      if (error?.includes('full')) return 'users';
      if (error?.includes('timeout') || error?.includes('connection')) return 'wifi';
      return 'warning';
    };

    const iconClass = getErrorIcon() === 'warning' ? 'text-red-500' : 
                     getErrorIcon() === 'lock' ? 'text-yellow-500' : 
                     getErrorIcon() === 'users' ? 'text-blue-500' : 'text-orange-500';

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <ExclamationTriangleIcon className={`w-16 h-16 ${iconClass} mx-auto mb-4`} />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {getErrorTitle()}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {error || 'The room you\'re looking for doesn\'t exist or you don\'t have access to it.'}
            </p>
            
            {/* Show room code being attempted */}
            {roomCode && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3 mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Attempted to join room:</p>
                <p className="font-mono text-lg font-semibold text-gray-900 dark:text-white">
                  {roomCode.toUpperCase()}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <Button
                onClick={() => router.push('/dashboard')}
                variant="primary"
                className="w-full flex items-center justify-center space-x-2"
              >
                <HomeIcon className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </Button>
              
              {/* Show retry button for connection issues */}
              {(error?.includes('timeout') || error?.includes('connection')) && (
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="w-full"
                >
                  Retry Connection
                </Button>
              )}
              
              {/* Show different room code input for invalid code */}
              {error?.includes('code') && (
                <Button
                  onClick={() => {
                    const newCode = window.prompt('Enter a different room code (6 characters):');
                    if (newCode && newCode.length === 6) {
                      router.push(`/room/${newCode.toUpperCase()}`);
                    }
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Try Different Code
                </Button>
              )}
            </div>

            {/* Help text */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Need help? Make sure you have the correct 6-character room code from the host.
                {error?.includes('password') && ' Private rooms require a password from the host.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show connection error
  if (!connectionStatus.isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="max-w-md mx-auto p-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <ExclamationTriangleIcon className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Connection Lost
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You've been disconnected. Please check your internet connection and try again.
            </p>
            <Button
              onClick={() => window.location.reload()}
              variant="primary"
              className="w-full"
            >
              Reconnect
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render the game component
  return room ? <Game room={room} /> : null;
}
