import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'QuizMaster Pro',
  description: 'Industry-Level Multiplayer Quiz Platform - Real-time quizzes with AI-powered question generation',
  keywords: ['quiz', 'multiplayer', 'real-time', 'education', 'AI', 'learning'],
  authors: [{ name: 'QuizMaster Pro Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],

  openGraph: {
    title: 'QuizMaster Pro',
    description: 'Industry-Level Multiplayer Quiz Platform with AI-powered questions',
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    siteName: 'QuizMaster Pro',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QuizMaster Pro',
    description: 'Industry-Level Multiplayer Quiz Platform with AI-powered questions',
    creator: '@quizmasterpro',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
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
      <body className={`${inter.className} min-h-screen bg-white text-secondary-900 antialiased dark:bg-secondary-950 dark:text-secondary-100`} suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            {/* Skip to main content link for accessibility */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Skip to main content
            </a>

            {/* Main application content */}
            <div id="main-content" className="min-h-screen">
              {children}
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
          </AuthProvider>
        </ThemeProvider>

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
