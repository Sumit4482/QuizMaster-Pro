import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { SocketProvider } from '@/contexts/SocketContext';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { PerformanceProvider } from '@/components/providers/PerformanceProvider';
import '@/styles/globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
});

// Configure viewport separately in Next.js 14+
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

// Set metadata base for proper Open Graph images
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'QuizMaster Pro',
    template: '%s | QuizMaster Pro'
  },
  description: 'Industry-Level Multiplayer Quiz Platform - Real-time quizzes with AI-powered question generation, advanced analytics, and seamless collaboration',
  keywords: [
    'quiz platform', 
    'multiplayer quiz', 
    'real-time gaming', 
    'education technology', 
    'AI-powered questions', 
    'collaborative learning',
    'quiz maker',
    'online assessment',
    'gamified learning',
    'educational games'
  ],
  authors: [{ name: 'QuizMaster Pro Team', url: siteUrl }],
  creator: 'QuizMaster Pro Team',
  publisher: 'QuizMaster Pro',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  openGraph: {
    title: 'QuizMaster Pro - Industry-Level Multiplayer Quiz Platform',
    description: 'Create, play, and master quizzes with our advanced real-time multiplayer platform featuring AI-powered questions and comprehensive analytics',
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'QuizMaster Pro',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'QuizMaster Pro - Multiplayer Quiz Platform',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QuizMaster Pro - Industry-Level Quiz Platform',
    description: 'Create, play, and master quizzes with real-time multiplayer features',
    creator: '@quizmasterpro',
    images: ['/twitter-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add verification codes when available
    ...(process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION && {
      google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    }),
  },
  alternates: {
    canonical: siteUrl,
  },
  category: 'education',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen bg-gradient-to-br from-surface-50 via-white to-surface-100 text-secondary-800 antialiased dark:bg-gradient-to-br dark:from-secondary-950 dark:via-secondary-900 dark:to-secondary-950 dark:text-secondary-200`} suppressHydrationWarning>
        <ErrorBoundary level="page">
          <PerformanceProvider enableReporting={process.env.NODE_ENV === 'production'}>
            <ThemeProvider>
              <AuthProvider>
                <SocketProvider>
                  {/* Skip to main content link for accessibility */}
                  <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    Skip to main content
                  </a>

                  {/* Main application content */}
                  <div id="main-content" className="min-h-screen">
                    <ErrorBoundary level="section">
                      {children}
                    </ErrorBoundary>
                  </div>

                  {/* Global toast notifications */}
                  <Toaster
                    position="top-right"
                    toastOptions={{
                      duration: 4000,
                      style: {
                        background: 'var(--toast-bg, #ffffff)',
                        color: 'var(--toast-color, #374151)',
                        fontSize: '14px',
                        maxWidth: '500px',
                      },
                      success: {
                        iconTheme: {
                          primary: '#10b981',
                          secondary: '#ffffff',
                        },
                      },
                      error: {
                        iconTheme: {
                          primary: '#ef4444',
                          secondary: '#ffffff',
                        },
                        duration: 6000,
                      },
                      loading: {
                        iconTheme: {
                          primary: '#3b82f6',
                          secondary: '#ffffff',
                        },
                      },
                    }}
                  />
                </SocketProvider>
              </AuthProvider>
            </ThemeProvider>
          </PerformanceProvider>
        </ErrorBoundary>

        {/* Development tools (only in development) */}
        {process.env.NODE_ENV === 'development' && (
          <div
            id="development-tools"
            className="fixed bottom-4 right-4 z-50 rounded-lg bg-yellow-100 p-2 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
            style={{ display: 'none' }}
          >
            <div>ENV: {process.env.NODE_ENV}</div>
            <div>API: {process.env.NEXT_PUBLIC_API_URL}</div>
          </div>
        )}
      </body>
    </html>
  );
}
