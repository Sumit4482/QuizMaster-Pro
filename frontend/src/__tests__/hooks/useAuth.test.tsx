import { renderHook, act } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/utils/authApi';

// Mock the auth API
jest.mock('@/utils/authApi');
const mockAuthApi = authApi as jest.Mocked<typeof authApi>;

// Mock the auth store
jest.mock('@/stores/authStore');
const mockUseAuthStore = useAuthStore as unknown as jest.MockedFunction<typeof useAuthStore>;

describe('useAuth Hook', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    role: 'PLAYER' as const,
    emailVerified: false,
    createdAt: '2024-01-01T00:00:00Z',
    lastLoginAt: null,
  };

  const mockAuthResponse = {
    user: mockUser,
    tokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: '2024-01-01T01:00:00Z',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default store state
    mockUseAuthStore.mockImplementation((selector) => {
      const state = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        logoutAll: jest.fn(),
        updateProfile: jest.fn(),
        changePassword: jest.fn(),
        loadUser: jest.fn(),
        clearError: jest.fn(),
      };
      
      return selector(state);
    });
  });

  it('should return auth state and actions', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isInitialized');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('register');
    expect(result.current).toHaveProperty('logout');
    expect(result.current).toHaveProperty('updateProfile');
    expect(result.current).toHaveProperty('changePassword');
  });

  it('should call loadUser when not initialized', () => {
    const mockLoadUser = jest.fn();
    
    mockUseAuthStore.mockImplementation((selector) => {
      const state = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: false, // Not initialized
        error: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        logoutAll: jest.fn(),
        updateProfile: jest.fn(),
        changePassword: jest.fn(),
        loadUser: mockLoadUser,
        clearError: jest.fn(),
      };
      
      return selector(state);
    });

    renderHook(() => useAuth());

    expect(mockLoadUser).toHaveBeenCalledTimes(1);
  });

  it('should not call loadUser when already initialized', () => {
    const mockLoadUser = jest.fn();
    
    mockUseAuthStore.mockImplementation((selector) => {
      const state = {
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true, // Already initialized
        error: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        logoutAll: jest.fn(),
        updateProfile: jest.fn(),
        changePassword: jest.fn(),
        loadUser: mockLoadUser,
        clearError: jest.fn(),
      };
      
      return selector(state);
    });

    renderHook(() => useAuth());

    expect(mockLoadUser).not.toHaveBeenCalled();
  });

  it('should handle successful login', async () => {
    const mockLogin = jest.fn().mockResolvedValue(undefined);
    mockAuthApi.login.mockResolvedValue(mockAuthResponse);
    
    mockUseAuthStore.mockImplementation((selector) => {
      const state = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: null,
        login: mockLogin,
        register: jest.fn(),
        logout: jest.fn(),
        logoutAll: jest.fn(),
        updateProfile: jest.fn(),
        changePassword: jest.fn(),
        loadUser: jest.fn(),
        clearError: jest.fn(),
      };
      
      return selector(state);
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password',
      });
    });

    expect(mockLogin).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    });
  });

  it('should handle login error', async () => {
    const mockError = new Error('Invalid credentials');
    const mockLogin = jest.fn().mockRejectedValue(mockError);
    
    mockUseAuthStore.mockImplementation((selector) => {
      const state = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: 'Invalid credentials',
        login: mockLogin,
        register: jest.fn(),
        logout: jest.fn(),
        logoutAll: jest.fn(),
        updateProfile: jest.fn(),
        changePassword: jest.fn(),
        loadUser: jest.fn(),
        clearError: jest.fn(),
      };
      
      return selector(state);
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      try {
        await result.current.login({
          email: 'test@example.com',
          password: 'wrong-password',
        });
      } catch (error) {
        expect(error).toBe(mockError);
      }
    });

    expect(mockLogin).toHaveBeenCalled();
    expect(result.current.error).toBe('Invalid credentials');
  });

  it('should handle successful registration', async () => {
    const mockRegister = jest.fn().mockResolvedValue(undefined);
    
    mockUseAuthStore.mockImplementation((selector) => {
      const state = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
        error: null,
        login: jest.fn(),
        register: mockRegister,
        logout: jest.fn(),
        logoutAll: jest.fn(),
        updateProfile: jest.fn(),
        changePassword: jest.fn(),
        loadUser: jest.fn(),
        clearError: jest.fn(),
      };
      
      return selector(state);
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.register({
        email: 'newuser@example.com',
        username: 'newuser',
        password: 'password',
        firstName: 'New',
        lastName: 'User',
      });
    });

    expect(mockRegister).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      username: 'newuser',
      password: 'password',
      firstName: 'New',
      lastName: 'User',
    });
  });

  it('should handle logout', async () => {
    const mockLogout = jest.fn().mockResolvedValue(undefined);
    
    mockUseAuthStore.mockImplementation((selector) => {
      const state = {
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
        error: null,
        login: jest.fn(),
        register: jest.fn(),
        logout: mockLogout,
        logoutAll: jest.fn(),
        updateProfile: jest.fn(),
        changePassword: jest.fn(),
        loadUser: jest.fn(),
        clearError: jest.fn(),
      };
      
      return selector(state);
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockLogout).toHaveBeenCalled();
  });
});
