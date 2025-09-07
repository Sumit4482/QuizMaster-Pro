import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useUser, useIsAuthenticated, useAuthLoading, useAuthActions } from '@/stores/authStore';

// Main auth hook that combines store selectors and actions
export const useAuth = () => {
  const user = useUser();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const actions = useAuthActions();
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const error = useAuthStore((state) => state.error);
  
  // Initialize auth state on mount
  useEffect(() => {
    if (!isInitialized) {
      actions.loadUser();
    }
  }, [isInitialized]); // Removed actions dependency to prevent infinite loop

  return {
    user,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,
    ...actions,
  };
};

// Hook to require authentication (redirects to login if not authenticated)
export const useRequireAuth = (redirectTo: string = '/auth/login') => {
  const { isAuthenticated, isLoading, isInitialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for auth to initialize
    if (!isInitialized) return;

    // If not authenticated and not loading, redirect
    if (!isAuthenticated && !isLoading) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, isInitialized, router, redirectTo]);

  return { isAuthenticated, isLoading, isInitialized };
};

// Hook to redirect authenticated users (useful for login/register pages)
export const useRedirectIfAuthenticated = (redirectTo: string = '/dashboard') => {
  const { isAuthenticated, isLoading, isInitialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for auth to initialize
    if (!isInitialized) return;

    // If authenticated and not loading, redirect
    if (isAuthenticated && !isLoading) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, isInitialized, router, redirectTo]);

  return { isAuthenticated, isLoading, isInitialized };
};

// Hook to require specific roles (redirects if not authenticated or doesn't have required role)
export const useRequireRole = (requiredRoles: string[], redirectTo: string = '/dashboard') => {
  const { user, isAuthenticated, isLoading, isInitialized } = useAuth();
  const router = useRouter();

  const hasRequiredRole = user && requiredRoles.includes(user.role);

  useEffect(() => {
    // Wait for auth to initialize
    if (!isInitialized) return;

    // If not authenticated, redirect to login
    if (!isAuthenticated && !isLoading) {
      router.push('/auth/login');
      return;
    }

    // If authenticated but doesn't have required role, redirect
    if (isAuthenticated && !isLoading && !hasRequiredRole) {
      router.push(redirectTo);
      return;
    }
  }, [isAuthenticated, isLoading, isInitialized, hasRequiredRole, router, redirectTo]);

  return { 
    isAuthenticated: isAuthenticated && hasRequiredRole, 
    isLoading, 
    isInitialized,
    hasRequiredRole 
  };
};

// Hook to check if user has specific role
export const useHasRole = (roles: string | string[]) => {
  const user = useUser();
  
  const hasRole = () => {
    if (!user) return false;
    
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    return requiredRoles.includes(user.role);
  };

  return hasRole();
};

// Hook for role-based component rendering
export const useRoleGuard = (allowedRoles: string | string[]) => {
  const hasRole = useHasRole(allowedRoles);
  const isAuthenticated = useIsAuthenticated();
  
  return {
    canAccess: isAuthenticated && hasRole,
    isAuthenticated,
    hasRole,
  };
};

// Custom hook for form submission with loading state
export const useAuthSubmit = () => {
  const isLoading = useAuthLoading();
  
  return {
    isLoading,
    isDisabled: isLoading,
  };
};

// Hook to get user's display name
export const useUserDisplayName = () => {
  const user = useUser();
  
  const getDisplayName = () => {
    if (!user) return '';
    
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    
    if (user.firstName) {
      return user.firstName;
    }
    
    return user.username;
  };

  return getDisplayName();
};

// Hook to get user's initials for avatar
export const useUserInitials = () => {
  const user = useUser();
  
  const getInitials = () => {
    if (!user) return '';
    
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]?.toUpperCase() || ''}${user.lastName[0]?.toUpperCase() || ''}`;
    }
    
    if (user.firstName) {
      return user.firstName[0]?.toUpperCase() || '';
    }
    
    return user.username[0]?.toUpperCase() || '';
  };

  return getInitials();
};

// Hook for logout confirmation
export const useLogoutConfirm = () => {
  const { logout, logoutAll } = useAuthActions();
  
  const confirmLogout = async (type: 'current' | 'all' = 'current') => {
    const confirmed = window.confirm(
      type === 'all' 
        ? 'Are you sure you want to log out from all devices?' 
        : 'Are you sure you want to log out?'
    );
    
    if (confirmed) {
      if (type === 'all') {
        await logoutAll();
      } else {
        await logout();
      }
    }
  };

  return { confirmLogout };
};

export default useAuth;
