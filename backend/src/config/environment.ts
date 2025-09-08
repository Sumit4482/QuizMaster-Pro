import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://quizmaster:development_password@localhost:5432/quizmaster',
  
  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // JWT Configuration
  JWT: {
    SECRET: process.env.JWT_SECRET || 'development_jwt_secret_change_in_production_256_bit_minimum',
    REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'development_refresh_secret_change_in_production_256_bit_minimum',
    ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  
  // Security
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  
  // Rate Limiting (Very permissive for development)
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10), // 1000 requests per minute
  },
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  
  // Email (Future use)
  EMAIL: {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  },
  
  // AI Configuration (Phase 3.1)
  AI: {
    // API Keys
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
    
    // Model Configuration
    DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL || 'gpt-3.5-turbo',
    FALLBACK_MODEL: process.env.AI_FALLBACK_MODEL || 'llama2',
    
    // Usage Limits & Cost Management
    DAILY_USAGE_LIMIT: parseInt(process.env.AI_DAILY_USAGE_LIMIT || '1000', 10),
    MONTHLY_BUDGET_LIMIT: parseFloat(process.env.AI_MONTHLY_BUDGET_LIMIT || '100.0'),
    COST_PER_REQUEST_LIMIT: parseFloat(process.env.AI_COST_PER_REQUEST_LIMIT || '1.0'),
    
    // Request Configuration
    REQUEST_TIMEOUT: parseInt(process.env.AI_REQUEST_TIMEOUT || '30000', 10), // 30 seconds
    MAX_RETRIES: parseInt(process.env.AI_MAX_RETRIES || '3', 10),
    RETRY_DELAY: parseInt(process.env.AI_RETRY_DELAY || '1000', 10), // 1 second
    
    // Quality & Content Settings
    MIN_QUALITY_SCORE: parseFloat(process.env.AI_MIN_QUALITY_SCORE || '0.7'),
    MAX_QUESTIONS_PER_BATCH: parseInt(process.env.AI_MAX_QUESTIONS_PER_BATCH || '10', 10),
    
    // Caching Configuration
    CACHE_TTL: parseInt(process.env.AI_CACHE_TTL || '3600', 10), // 1 hour
    CACHE_MAX_SIZE: parseInt(process.env.AI_CACHE_MAX_SIZE || '10000', 10),
    
    // Rate Limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: parseInt(process.env.AI_RATE_LIMIT_RPM || '60', 10),
    RATE_LIMIT_REQUESTS_PER_HOUR: parseInt(process.env.AI_RATE_LIMIT_RPH || '1000', 10),
    
    // Local Model Configuration
    LOCAL_MODEL_ENDPOINT: process.env.AI_LOCAL_MODEL_ENDPOINT,
    LOCAL_MODEL_ENABLED: process.env.AI_LOCAL_MODEL_ENABLED === 'true',
  },
} as const;

// Validate required environment variables
export function validateEnvironment(): void {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ] as const;
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate JWT secrets are strong enough for production
  if (config.NODE_ENV === 'production') {
    if (config.JWT.SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long in production');
    }
    if (config.JWT.REFRESH_SECRET.length < 32) {
      throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long in production');
    }
  }
}
