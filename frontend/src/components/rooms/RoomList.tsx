'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRoom } from '@/contexts/SocketContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RoomCard, type RoomData } from '@/components/ui/RoomCard';
import {
  UserGroupIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface RoomListProps {
  onJoinRoom?: (room: RoomData) => void;
}

export function RoomList({ onJoinRoom }: RoomListProps) {
  const router = useRouter();
  const { getRooms, joinRoom, on, off } = useRoom();
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null);

  // Load rooms with optional refresh
  const loadRooms = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const roomList = await getRooms(20);
      setRooms(roomList);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Handle joining a room
  const handleJoinRoom = async (room: RoomData) => {
    if (joiningRoom) return;
    
    setJoiningRoom(room.id);
    try {
      let password: string | undefined;
      
      // Prompt for password if room is password protected
      if (room.hasPassword) {
        const promptResult = window.prompt(`Enter password for room "${room.name}":`);
        password = promptResult || undefined;
        if (!password) {
          return; // User cancelled
        }
      }

      const joinedRoom = await joinRoom(room.code, password);
      
      // Navigate to room using Next.js router
      router.push(`/room/${room.code}`);
      
      onJoinRoom?.(joinedRoom);
    } catch (error) {
      console.error('Failed to join room:', error);
    } finally {
      setJoiningRoom(null);
    }
  };

  // Handle refresh button click
  const handleRefresh = () => {
    loadRooms(true);
  };

  // Filter rooms based on search
  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Set up real-time room updates
  useEffect(() => {
    const handleRoomsUpdated = (data: any) => {
      if (data.type === 'created') {
        setRooms(prev => [data.room, ...prev]);
      } else if (data.type === 'updated') {
        setRooms(prev => 
          prev.map(room => 
            room.id === data.room.id ? { ...room, ...data.room } : room
          )
        );
      } else if (data.type === 'deleted') {
        setRooms(prev => prev.filter(room => room.id !== data.room.id));
      }
    };

    on('rooms:updated', handleRoomsUpdated);
    
    return () => {
      off('rooms:updated', handleRoomsUpdated);
    };
  }, [on, off]);

  // Load rooms on mount
  useEffect(() => {
    loadRooms();
  }, []);

  return (
    <div className="space-y-8">
      {/* Modern Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
            <SparklesIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Discover Rooms
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Join public quiz rooms and play with others
            </p>
          </div>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={loading || refreshing}
          variant="outline"
          className="flex items-center space-x-2 hover:scale-105 transition-transform"
        >
          <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          type="text"
          placeholder="Search rooms by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Loading State */}
      {loading && !refreshing && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <LoadingSpinner size="lg" text="Discovering rooms..." />
        </div>
      )}

      {/* Rooms Content */}
      {!loading && (
        <>
          {/* Empty State */}
          {filteredRooms.length === 0 && (
            <div className="text-center py-16">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <UserGroupIcon className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                {searchTerm ? 'No rooms match your search' : 'No public rooms available'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                {searchTerm 
                  ? 'Try adjusting your search terms or browse all available rooms'
                  : 'Be the first to create a room and invite others to join your quiz!'
                }
              </p>
              {searchTerm && (
                <Button
                  onClick={() => setSearchTerm('')}
                  variant="outline"
                  className="hover:scale-105 transition-transform"
                >
                  Clear Search
                </Button>
              )}
            </div>
          )}

          {/* Room Grid */}
          {filteredRooms.length > 0 && (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onJoin={handleJoinRoom}
                    isJoining={joiningRoom === room.id}
                  />
                ))}
              </div>

              {/* Results Info */}
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {filteredRooms.length} of {rooms.length} rooms
                  {searchTerm && ` matching "${searchTerm}"`}
                </p>
                <div className="flex items-center justify-center space-x-2 mt-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Updates automatically
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
