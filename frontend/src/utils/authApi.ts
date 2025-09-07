import { api, setTokens, clearTokens, handleApiError } from './api';
import {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
  RefreshTokenRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  UpdateProfileRequest,
  UserSession,
} from '@/types/auth';

export class AuthApiError extends Error {
  public code: string;
  public details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.details = details;
  }
}

export const authApi = {
  // User registration
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse>('/auth/register', data);
      
      if (response.success && response.data) {
        // Store tokens after successful registration
        setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
        return response.data;
      }
      
      // Handle API error response (when success: false)
      if (!response.success && response.error) {
        throw new AuthApiError(
          response.error.message || 'Registration failed', 
          response.error.code || 'REGISTRATION_FAILED',
          response.error
        );
      }
      
      throw new AuthApiError('Registration failed', 'REGISTRATION_FAILED');
    } catch (error: any) {
      // If it's already an AuthApiError, re-throw it
      if (error instanceof AuthApiError) {
        throw error;
      }
      
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'REGISTRATION_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // User login
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse>('/auth/login', data);
      
      if (response.success && response.data) {
        // Store tokens after successful login
        setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
        return response.data;
      }
      
      // Handle API error response (when success: false)
      if (!response.success && response.error) {
        throw new AuthApiError(
          response.error.message || 'Login failed', 
          response.error.code || 'LOGIN_FAILED',
          response.error
        );
      }
      
      throw new AuthApiError('Login failed', 'LOGIN_FAILED');
    } catch (error: any) {
      // If it's already an AuthApiError, re-throw it
      if (error instanceof AuthApiError) {
        throw error;
      }
      
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'LOGIN_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // User logout
  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Log error but don't throw - we want to clear tokens regardless
      console.warn('Logout request failed:', error);
    } finally {
      // Always clear tokens locally
      clearTokens();
    }
  },

  // Logout from all devices
  logoutAll: async (): Promise<void> => {
    try {
      await api.post('/auth/logout-all');
    } catch (error) {
      console.warn('Logout all request failed:', error);
    } finally {
      clearTokens();
    }
  },

  // Refresh access token
  refreshToken: async (refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> => {
    try {
      const response = await api.post<{ accessToken: string; expiresAt: string }>('/auth/refresh', {
        refreshToken,
      });
      
      if (response.success && response.data) {
        return response.data;
      }
      
      throw new AuthApiError('Token refresh failed', 'TOKEN_REFRESH_FAILED');
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'TOKEN_REFRESH_FAILED';
      
      // Clear tokens if refresh fails
      if (errorCode === 'REFRESH_TOKEN_EXPIRED' || errorCode === 'REFRESH_TOKEN_INVALID') {
        clearTokens();
      }
      
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // Get current user profile
  getProfile: async (): Promise<User> => {
    try {
      const response = await api.get<User>('/auth/profile');
      
      if (response.success && response.data) {
        return response.data;
      }
      
      throw new AuthApiError('Failed to fetch profile', 'PROFILE_FETCH_FAILED');
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'PROFILE_FETCH_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // Update user profile
  updateProfile: async (data: UpdateProfileRequest): Promise<User> => {
    try {
      const response = await api.put<User>('/auth/profile', data);
      
      if (response.success && response.data) {
        return response.data;
      }
      
      throw new AuthApiError('Profile update failed', 'PROFILE_UPDATE_FAILED');
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'PROFILE_UPDATE_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // Change password
  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    try {
      const response = await api.put('/auth/change-password', data);
      
      if (!response.success) {
        throw new AuthApiError('Password change failed', 'PASSWORD_CHANGE_FAILED');
      }
      
      // Clear tokens after password change (user will need to login again)
      clearTokens();
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'PASSWORD_CHANGE_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // Get user sessions
  getSessions: async (): Promise<UserSession[]> => {
    try {
      const response = await api.get<UserSession[]>('/auth/sessions');
      
      if (response.success && response.data) {
        return response.data;
      }
      
      return [];
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'SESSIONS_FETCH_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // Revoke specific session
  revokeSession: async (sessionId: string): Promise<void> => {
    try {
      const response = await api.delete(`/auth/sessions/${sessionId}`);
      
      if (!response.success) {
        throw new AuthApiError('Session revoke failed', 'SESSION_REVOKE_FAILED');
      }
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'SESSION_REVOKE_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // Check email availability
  checkEmailAvailability: async (email: string): Promise<{ available: boolean }> => {
    try {
      const response = await api.get<{ available: boolean }>(`/auth/check-email?email=${encodeURIComponent(email)}`);
      
      if (response.success && response.data) {
        return response.data;
      }
      
      return { available: false };
    } catch (error: any) {
      // If there's an error checking email, assume it's not available to be safe
      return { available: false };
    }
  },

  // Forgot password (UI preparation)
  forgotPassword: async (data: ForgotPasswordRequest): Promise<void> => {
    try {
      const response = await api.post('/auth/forgot-password', data);
      
      if (!response.success) {
        throw new AuthApiError('Forgot password request failed', 'FORGOT_PASSWORD_FAILED');
      }
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'FORGOT_PASSWORD_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },

  // Reset password (UI preparation)
  resetPassword: async (data: ResetPasswordRequest): Promise<void> => {
    try {
      const response = await api.post('/auth/reset-password', data);
      
      if (!response.success) {
        throw new AuthApiError('Password reset failed', 'PASSWORD_RESET_FAILED');
      }
    } catch (error: any) {
      const errorMessage = handleApiError(error);
      const errorCode = error.response?.data?.error?.code || 'PASSWORD_RESET_FAILED';
      throw new AuthApiError(errorMessage, errorCode, error.response?.data?.error?.details);
    }
  },
};
