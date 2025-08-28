'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth, useRedirectIfAuthenticated } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { validateRegisterForm, getPasswordStrength } from '@/utils/validation';
import { RegisterFormData } from '@/types/auth';

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuth();
  
  // Redirect if already authenticated
  useRedirectIfAuthenticated('/dashboard');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setError,
  } = useForm<RegisterFormData>();

  const watchedPassword = watch('password', '');
  const passwordStrength = getPasswordStrength(watchedPassword || '');

  const onSubmit = async (data: RegisterFormData) => {
    // Validate form data
    const validation = validateRegisterForm(data);
    if (!validation.isValid) {
      // Set validation errors
      Object.entries(validation.errors).forEach(([field, fieldErrors]) => {
        setError(field as keyof RegisterFormData, {
          type: 'manual',
          message: fieldErrors[0],
        });
      });
      return;
    }

    try {
      await registerUser({
        email: data.email,
        username: data.username,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      // Redirect will happen automatically after successful registration
      router.push('/dashboard');
    } catch (error) {
      // Error handling is done in the auth store
      console.error('Registration failed:', error);
    }
  };

  const getPasswordStrengthColor = (strength: string) => {
    switch (strength) {
      case 'very-weak':
        return 'bg-error-500';
      case 'weak':
        return 'bg-warning-500';
      case 'fair':
        return 'bg-yellow-500';
      case 'good':
        return 'bg-primary-500';
      case 'strong':
        return 'bg-success-500';
      default:
        return 'bg-secondary-300';
    }
  };

  const getPasswordStrengthWidth = (strength: string) => {
    switch (strength) {
      case 'very-weak':
        return 'w-1/5';
      case 'weak':
        return 'w-2/5';
      case 'fair':
        return 'w-3/5';
      case 'good':
        return 'w-4/5';
      case 'strong':
        return 'w-full';
      default:
        return 'w-0';
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
            Create your account
          </h2>
          <p className="mt-2 text-sm text-secondary-600 dark:text-secondary-400">
            Join QuizMaster Pro and start creating amazing quizzes
          </p>
        </div>

        {/* Registration Form */}
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <CardHeader>
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white">
                Sign up for your account
              </h3>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="First name"
                  placeholder="John"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Last name"
                  placeholder="Doe"
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

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
                label="Username"
                placeholder="johndoe"
                error={errors.username?.message}
                required
                {...register('username', { required: true })}
                helperText="This will be your unique identifier"
                leftIcon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                }
              />

              <div>
                <Input
                  label="Password"
                  inputType="password"
                  placeholder="Create a strong password"
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
                
                {/* Password Strength Indicator */}
                {watchedPassword && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-secondary-600 dark:text-secondary-400">
                        Password strength
                      </span>
                      <span className={`capitalize ${
                        passwordStrength.strength === 'strong' ? 'text-success-600' :
                        passwordStrength.strength === 'good' ? 'text-primary-600' :
                        passwordStrength.strength === 'fair' ? 'text-yellow-600' :
                        'text-error-600'
                      }`}>
                        {passwordStrength.strength.replace('-', ' ')}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-secondary-200 dark:bg-secondary-700">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor(
                          passwordStrength.strength
                        )} ${getPasswordStrengthWidth(passwordStrength.strength)}`}
                      />
                    </div>
                    {passwordStrength.feedback.length > 0 && (
                      <ul className="mt-1 text-xs text-secondary-500">
                        {passwordStrength.feedback.map((tip, index) => (
                          <li key={index}>• {tip}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <Input
                label="Confirm password"
                inputType="password"
                placeholder="Confirm your password"
                error={errors.confirmPassword?.message}
                required
                {...register('confirmPassword', { required: true })}
                leftIcon={
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
              />

              {/* Terms Agreement */}
              <div className="text-sm text-secondary-600 dark:text-secondary-400">
                By creating an account, you agree to our{' '}
                <Link href="/terms" className="text-primary-600 hover:text-primary-500">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary-600 hover:text-primary-500">
                  Privacy Policy
                </Link>
                .
              </div>
            </CardContent>

            <CardFooter className="space-y-4">
              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
                loadingText="Creating account..."
              >
                Create account
              </Button>

              <div className="text-center text-sm">
                <span className="text-secondary-600 dark:text-secondary-400">
                  Already have an account?{' '}
                </span>
                <Link
                  href="/auth/login"
                  className="text-primary-600 hover:text-primary-500 dark:text-primary-400"
                >
                  Sign in
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
