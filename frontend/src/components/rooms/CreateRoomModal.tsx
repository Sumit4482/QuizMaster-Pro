'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoom } from '@/contexts/SocketContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  XMarkIcon,
  UserGroupIcon,
  LockClosedIcon,
  CogIcon,
} from '@heroicons/react/24/outline';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomCreated?: (room: any) => void;
}

interface RoomSettings {
  allowSpectators: boolean;
  allowReconnection: boolean;
  autoStart: boolean;
  questionTimeLimit: number;
  showCorrectAnswers: boolean;
  allowHints: boolean;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  requireApproval: boolean;
}

export function CreateRoomModal({ isOpen, onClose, onRoomCreated }: CreateRoomModalProps) {
  const router = useRouter();
  const { createRoom } = useRoom();
  const [isCreating, setIsCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    maxPlayers: 10,
    isPrivate: false,
    password: '',
  });

  const [settings, setSettings] = useState<RoomSettings>({
    allowSpectators: true,
    allowReconnection: true,
    autoStart: false,
    questionTimeLimit: 30,
    showCorrectAnswers: true,
    allowHints: false,
    shuffleQuestions: true,
    shuffleAnswers: true,
    requireApproval: false,
  });

  // Handle form field changes
  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSettingChange = (setting: keyof RoomSettings, value: any) => {
    setSettings(prev => ({ ...prev, [setting]: value }));
  };

  // Handle form submission with improved validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate form data
    if (!formData.name.trim()) {
      setError('Room name is required');
      return;
    }

    if (formData.name.trim().length < 3) {
      setError('Room name must be at least 3 characters long');
      return;
    }

    if (formData.name.length > 100) {
      setError('Room name cannot exceed 100 characters');
      return;
    }

    if (formData.maxPlayers < 2) {
      setError('Minimum 2 players required');
      return;
    }

    if (formData.maxPlayers > 50) {
      setError('Maximum 50 players allowed');
      return;
    }

    if (formData.isPrivate && formData.password && formData.password.length > 100) {
      setError('Password cannot exceed 100 characters');
      return;
    }

    // Validate settings
    if (settings.questionTimeLimit < 10) {
      setError('Question time limit must be at least 10 seconds');
      return;
    }

    if (settings.questionTimeLimit > 300) {
      setError('Question time limit cannot exceed 300 seconds (5 minutes)');
      return;
    }

    setIsCreating(true);
    try {
      const roomData: {
        name: string;
        maxPlayers: number;
        isPrivate: boolean;
        password?: string;
        settings: any;
      } = {
        name: formData.name.trim(),
        maxPlayers: formData.maxPlayers,
        isPrivate: formData.isPrivate,
        settings,
      };

      if (formData.isPrivate && formData.password) {
        roomData.password = formData.password;
      }

      const createdRoom = await createRoom(roomData);
      
      // Navigate to the created room using Next.js router
      router.push(`/room/${createdRoom.code}`);
      
      onRoomCreated?.(createdRoom);
      onClose();
      
      // Reset form
      resetForm();
    } catch (error: any) {
      console.error('Failed to create room:', error);
      
      // Handle specific errors
      const errorMessage = error.message || 'Failed to create room';
      
      if (errorMessage.includes('TOO_MANY_ROOMS')) {
        setError('You can only create up to 5 rooms at a time. Please delete some existing rooms first.');
      } else if (errorMessage.includes('INVALID_ROOM_NAME')) {
        setError('Invalid room name. Please use a different name.');
      } else if (errorMessage.includes('INVALID_MAX_PLAYERS')) {
        setError('Invalid number of maximum players. Must be between 2 and 50.');
      } else if (errorMessage.includes('INVALID_PASSWORD')) {
        setError('Password is too long. Must be 100 characters or less.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Helper function to reset form
  const resetForm = () => {
    setFormData({
      name: '',
      maxPlayers: 10,
      isPrivate: false,
      password: '',
    });
    setSettings({
      allowSpectators: true,
      allowReconnection: true,
      autoStart: false,
      questionTimeLimit: 30,
      showCorrectAnswers: true,
      allowHints: false,
      shuffleQuestions: true,
      shuffleAnswers: true,
      requireApproval: false,
    });
    setShowAdvanced(false);
    setError(null);
  };

  // Handle close
  const handleClose = () => {
    if (isCreating) return;
    resetForm();
    onClose();
  };

  // Handle input changes with validation feedback
  const handleInputChangeWithValidation = (field: string, value: any) => {
    handleInputChange(field, value);
    
    // Clear error when user starts fixing the issue
    if (error) {
      if (field === 'name' && value.trim()) {
        setError(null);
      } else if (field === 'maxPlayers' && value >= 2 && value <= 50) {
        setError(null);
      } else if (field === 'password' && (!formData.isPrivate || value.length <= 100)) {
        setError(null);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Create New Room
            </h2>
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              disabled={isCreating}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Room Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Room Name *
              </label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChangeWithValidation('name', e.target.value)}
                placeholder="Enter room name..."
                maxLength={100}
                required
                disabled={isCreating}
                className={error && error.includes('name') ? 'border-red-300 focus:border-red-500' : ''}
              />
            </div>

            {/* Max Players */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Players
              </label>
              <div className="relative">
                <UserGroupIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="number"
                  value={formData.maxPlayers}
                  onChange={(e) => handleInputChangeWithValidation('maxPlayers', parseInt(e.target.value) || 2)}
                  min={2}
                  max={50}
                  className={`pl-10 ${error && error.includes('players') ? 'border-red-300 focus:border-red-500' : ''}`}
                  disabled={isCreating}
                />
              </div>
            </div>

            {/* Private Room */}
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="isPrivate"
                checked={formData.isPrivate}
                onChange={(e) => handleInputChange('isPrivate', e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                disabled={isCreating}
              />
              <label htmlFor="isPrivate" className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                <LockClosedIcon className="w-4 h-4 mr-1" />
                Private Room
              </label>
            </div>

            {/* Password (if private) */}
            {formData.isPrivate && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password (optional)
                </label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChangeWithValidation('password', e.target.value)}
                  placeholder="Enter password..."
                  maxLength={100}
                  disabled={isCreating}
                  className={error && error.includes('Password') ? 'border-red-300 focus:border-red-500' : ''}
                />
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              disabled={isCreating}
            >
              <CogIcon className="w-4 h-4 mr-1" />
              {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
            </button>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-white">Game Settings</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="allowSpectators"
                      checked={settings.allowSpectators}
                      onChange={(e) => handleSettingChange('allowSpectators', e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      disabled={isCreating}
                    />
                    <label htmlFor="allowSpectators" className="text-sm text-gray-700 dark:text-gray-300">
                      Allow Spectators
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="allowReconnection"
                      checked={settings.allowReconnection}
                      onChange={(e) => handleSettingChange('allowReconnection', e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      disabled={isCreating}
                    />
                    <label htmlFor="allowReconnection" className="text-sm text-gray-700 dark:text-gray-300">
                      Allow Reconnection
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="showCorrectAnswers"
                      checked={settings.showCorrectAnswers}
                      onChange={(e) => handleSettingChange('showCorrectAnswers', e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      disabled={isCreating}
                    />
                    <label htmlFor="showCorrectAnswers" className="text-sm text-gray-700 dark:text-gray-300">
                      Show Correct Answers
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="shuffleQuestions"
                      checked={settings.shuffleQuestions}
                      onChange={(e) => handleSettingChange('shuffleQuestions', e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      disabled={isCreating}
                    />
                    <label htmlFor="shuffleQuestions" className="text-sm text-gray-700 dark:text-gray-300">
                      Shuffle Questions
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Question Time Limit (seconds)
                  </label>
                  <Input
                    type="number"
                    value={settings.questionTimeLimit}
                    onChange={(e) => handleSettingChange('questionTimeLimit', parseInt(e.target.value) || 30)}
                    min={10}
                    max={300}
                    disabled={isCreating}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={isCreating}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating || !formData.name.trim()}
                className="flex-1"
              >
                {isCreating ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  'Create Room'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
