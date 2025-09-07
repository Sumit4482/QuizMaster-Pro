interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'white';
  className?: string;
  text?: string;
}

export function LoadingSpinner({ 
  size = 'md', 
  variant = 'primary', 
  className = '', 
  text 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const variantClasses = {
    primary: 'border-gray-200 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400',
    secondary: 'border-gray-200 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-400',
    white: 'border-white/20 border-t-white'
  };

  const borderWidth = size === 'xs' || size === 'sm' ? 'border-2' : 'border-3';

  if (text) {
    return (
      <div className={`flex flex-col items-center justify-center space-y-3 ${className}`}>
        <div className={`animate-spin rounded-full ${borderWidth} ${variantClasses[variant]} ${sizeClasses[size]}`}>
          <span className="sr-only">Loading...</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 animate-pulse">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className={`animate-spin rounded-full ${borderWidth} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export default LoadingSpinner;
