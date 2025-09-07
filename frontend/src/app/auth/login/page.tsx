'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth, useRedirectIfAuthenticated } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { validateLoginForm } from '@/utils/validation';
import { LoginFormData } from '@/types/auth';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error } = useAuth();
  
  // Redirect if already authenticated
  useRedirectIfAuthenticated('/dashboard');

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>();

  const onSubmit = async (data: LoginFormData) => {
    // Validate form data
    const validation = validateLoginForm(data);
    if (!validation.isValid) {
      // Set validation errors
      Object.entries(validation.errors).forEach(([field, fieldErrors]) => {
        setError(field as keyof LoginFormData, {
          type: 'manual',
          message: fieldErrors[0] || 'Invalid value',
        });
      });
      return;
    }

    try {
      await login(data);
      // Show success message and redirect
      console.log('Login successful! Redirecting to dashboard...');
      router.push('/dashboard');
    } catch (error: any) {
      // Enhanced error handling with specific field errors
      console.error('Login failed:', error);
      
      // Handle specific login errors
      if (error.code === 'INVALID_CREDENTIALS' || error.code === 'USER_NOT_FOUND') {
        setError('email', {
          type: 'manual',
          message: 'Invalid email or password. Please check your credentials.',
        });
        setError('password', {
          type: 'manual', 
          message: 'Invalid email or password. Please check your credentials.',
        });
      } else if (error.code === 'ACCOUNT_LOCKED') {
        setError('email', {
          type: 'manual',
          message: 'Account is temporarily locked. Please try again later.',
        });
      } else if (error.code === 'EMAIL_NOT_VERIFIED') {
        setError('email', {
          type: 'manual',
          message: 'Please verify your email address before logging in.',
        });
      }
      // The auth store will handle showing the toast error message
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary-50 px-4 py-12 dark:bg-secondary-950 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600 text-white">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-secondary-900 dark:text-white">
              QuizMaster Pro
            </span>
          </Link>
          <h2 className="mt-6 text-3xl font-bold text-secondary-900 dark:text-white">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-400">
            Sign in to your account to continue
          </p>
        </div>

        {/* Login Form */}
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <CardHeader>
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white">
                Sign in to your account
              </h3>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Display authentication error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                  <div className="flex items-center">
                    <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-medium">{error}</span>
                  </div>
                </div>
              )}

              <Input
                label="Email address"
                inputType="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                required
                {...register('email', { required: true })}
                leftIcon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                    />
                  </svg>
                }
              />

              <Input
                label="Password"
                inputType="password"
                placeholder="Enter your password"
                error={errors.password?.message}
                required
                {...register('password', { required: true })}
                leftIcon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                }
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
                    {...register('rememberMe')}
                  />
                  <span className="ml-2 text-sm text-secondary-600 dark:text-secondary-400">
                    Remember me
                  </span>
                </label>

                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400"
                >
                  Forgot password?
                </Link>
              </div>
            </CardContent>

            <CardFooter className="space-y-4">
              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
                loadingText="Signing in..."
              >
                Sign in
              </Button>

              <div className="text-center text-sm">
                <span className="text-secondary-600 dark:text-secondary-400">
                  Don't have an account?{' '}
                </span>
                <Link
                  href="/auth/register"
                  className="text-primary-600 hover:text-primary-500 dark:text-primary-400"
                >
                  Sign up
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>

        {/* Back to home */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-secondary-600 hover:text-secondary-500 dark:text-secondary-400"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
