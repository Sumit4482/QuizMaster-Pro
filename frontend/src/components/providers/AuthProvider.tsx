'use client';

import React from 'react';
import { useAuthStore } from '@/stores/authStore';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const loadUser = useAuthStore((state) => state.loadUser);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  React.useEffect(() => {
    // Initialize auth state when the provider mounts
    if (!isInitialized) {
      loadUser();
    }
  }, [isInitialized]); // Removed loadUser dependency to prevent infinite loop

  return <>{children}</>;
};
