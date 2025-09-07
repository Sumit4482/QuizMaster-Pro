import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  User,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
} from '@/types/auth';
import { authApi, AuthApiError } from '@/utils/authApi';
import { getTokens, clearTokens } from '@/utils/api';
import toast from 'react-hot-toast';

interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateProfile: (data: UpdateProfileRequest) => Promise<void>;
  changePassword: (data: ChangePasswordRequest) => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,

      // Login action
      login: async (credentials: LoginRequest) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.login(credentials);
          
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          toast.success('Login successful! Welcome back.');
        } catch (error) {
          const errorMessage = error instanceof AuthApiError 
            ? error.message 
            : 'Login failed. Please try again.';
          
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });

          toast.error(errorMessage);
          
          // Auto-clear error after 10 seconds to improve UX
          setTimeout(() => {
            const currentState = get();
            if (currentState.error === errorMessage) {
              set({ error: null });
            }
          }, 10000);
          
          throw error;
        }
      },

      // Register action
      register: async (data: RegisterRequest) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.register(data);
          
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          toast.success('Registration successful! Welcome to QuizMaster Pro.');
        } catch (error) {
          const errorMessage = error instanceof AuthApiError 
            ? error.message 
            : 'Registration failed. Please try again.';
          
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });

          toast.error(errorMessage);
          throw error;
        }
      },

      // Logout action
      logout: async () => {
        set({ isLoading: true });

        try {
          await authApi.logout();
          toast.success('Logged out successfully.');
        } catch (error) {
          // Log error but don't show to user
          console.warn('Logout API call failed:', error);
        } finally {
          // Clear state regardless of API call result
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      // Logout from all devices action
      logoutAll: async () => {
        set({ isLoading: true });

        try {
          await authApi.logoutAll();
          toast.success('Logged out from all devices.');
        } catch (error) {
          console.warn('Logout all API call failed:', error);
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      // Update profile action
      updateProfile: async (data: UpdateProfileRequest) => {
        set({ isLoading: true, error: null });

        try {
          const updatedUser = await authApi.updateProfile(data);
          
          set({
            user: updatedUser,
            isLoading: false,
            error: null,
          });

          toast.success('Profile updated successfully.');
        } catch (error) {
          const errorMessage = error instanceof AuthApiError 
            ? error.message 
            : 'Profile update failed. Please try again.';
          
          set({
            isLoading: false,
            error: errorMessage,
          });

          toast.error(errorMessage);
          throw error;
        }
      },

      // Change password action
      changePassword: async (data: ChangePasswordRequest) => {
        set({ isLoading: true, error: null });

        try {
          await authApi.changePassword(data);
          
          // Clear auth state after password change (user needs to login again)
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });

          toast.success('Password changed successfully. Please log in again.');
        } catch (error) {
          const errorMessage = error instanceof AuthApiError 
            ? error.message 
            : 'Password change failed. Please try again.';
          
          set({
            isLoading: false,
            error: errorMessage,
          });

          toast.error(errorMessage);
          throw error;
        }
      },

      // Load user action (for initialization and refresh)  
      loadUser: async () => {
        const currentState = get();
        
        // Prevent multiple simultaneous loadUser calls or if already initialized
        if (currentState.isLoading || currentState.isInitialized) {
          return;
        }
        
        // Set loading and prevent further calls
        set({ isLoading: true });

        try {
          const tokens = getTokens();
          
          // If no access token, user is not authenticated
          if (!tokens.accessToken) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            // Don't clear existing error during initialization
            // error: null,
          });
          return;
          }

          // Try to fetch user profile
          const user = await authApi.getProfile();
          
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            isInitialized: true,
            error: null, // Clear error on successful auth
          });
        } catch (error) {
          // If profile fetch fails, clear tokens and auth state
          clearTokens();
          
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: true,
            // Don't clear error during failed profile fetch
            // error: null,
          });

          // Don't show error toast for profile fetch failures (usually token expiry)
          console.warn('Failed to load user profile:', error);
        }
      },

      // Clear error action
      clearError: () => {
        set({ error: null });
      },

      // Set loading action
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'auth-store',
      // Only persist the user data, not loading states or errors
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Custom storage to handle SSR
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          const item = localStorage.getItem(name);
          return item ? JSON.parse(item) : null;
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return;
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
          localStorage.removeItem(name);
        },
      },
    }
  )
);

// Selector hooks for better performance
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useAuthActions = () => useAuthStore((state) => ({
  login: state.login,
  register: state.register,
  logout: state.logout,
  logoutAll: state.logoutAll,
  updateProfile: state.updateProfile,
  changePassword: state.changePassword,
  loadUser: state.loadUser,
  clearError: state.clearError,
}));
