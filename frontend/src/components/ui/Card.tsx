import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  border?: boolean;
  hover?: boolean;
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  border?: boolean;
}

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
  border?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      className,
      padding = 'md',
      shadow = 'sm',
      border = true,
      hover = false,
      ...props
    },
    ref
  ) => {
    const paddingClasses = {
      none: '',
      sm: 'p-3',
      md: 'p-6',
      lg: 'p-8',
      xl: 'p-10',
    };

    const shadowClasses = {
      none: '',
      sm: 'shadow-soft',
      md: 'shadow-soft-lg',
      lg: 'shadow-soft-xl',
      xl: 'shadow-soft-xl',
    };

    return (
      <div
        ref={ref}
        className={clsx(
          'rounded-2xl bg-white/90 dark:bg-secondary-900/90 backdrop-blur-sm',
          paddingClasses[padding],
          shadowClasses[shadow],
          {
            'border border-surface-200 dark:border-secondary-800/50': border,
            'transition-all duration-300 hover:shadow-soft-lg hover:-translate-y-0.5 transform-gpu': hover,
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, className, border = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          'card-header',
          {
            'border-b border-surface-200 dark:border-secondary-800/50 pb-6 mb-6': border,
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx('', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ children, className, border = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          {
            'border-t border-surface-200 dark:border-secondary-800/50 pt-6 mt-6': border,
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
CardHeader.displayName = 'CardHeader';
CardContent.displayName = 'CardContent';
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardContent, CardFooter };
