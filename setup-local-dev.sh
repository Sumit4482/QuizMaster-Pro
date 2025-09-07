#!/bin/bash
# QuizMaster Pro - Local Development Setup (Alternative to Docker)

echo "🚀 Setting up QuizMaster Pro for local development..."

# Start local services
echo "📦 Starting local services..."

# Start Redis
echo "Starting Redis..."
redis-server --daemonize yes --port 6379

# Start PostgreSQL (try different methods)
echo "Starting PostgreSQL..."

# Method 1: Try brew services
if brew services start postgresql@15 2>/dev/null; then
    echo "✅ PostgreSQL started with brew services"
elif /opt/homebrew/bin/pg_ctl -D /opt/homebrew/var/postgresql@15 start 2>/dev/null; then
    echo "✅ PostgreSQL started with pg_ctl (Apple Silicon)"
elif /usr/local/bin/pg_ctl -D /usr/local/var/postgresql@15 start 2>/dev/null; then
    echo "✅ PostgreSQL started with pg_ctl (Intel)"
else
    echo "⚠️  PostgreSQL might already be running or need manual start"
fi

# Wait for services to start
echo "⏱️  Waiting for services to start..."
sleep 3

# Test connections
echo "🔍 Testing service connections..."

# Test Redis
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis connection: OK"
else
    echo "❌ Redis connection: FAILED"
fi

# Test PostgreSQL
if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "✅ PostgreSQL connection: OK"
else
    echo "❌ PostgreSQL connection: FAILED"
fi

# Create database if needed
echo "🗄️  Setting up database..."
createdb quizmaster 2>/dev/null && echo "✅ Database 'quizmaster' created" || echo "ℹ️  Database 'quizmaster' already exists or failed to create"

echo ""
echo "🎯 Local Development Environment Ready!"
echo ""
echo "📝 Use these environment variables in your .env file:"
echo "DATABASE_URL=\"postgresql://postgres:@localhost:5432/quizmaster\""
echo "REDIS_URL=\"redis://localhost:6379\""
echo ""
echo "📍 Next steps:"
echo "1. cd backend"
echo "2. npm install"
echo "3. npx prisma migrate dev"
echo "4. npm run dev"
echo ""
echo "🐳 To stop Docker issues, reset Docker Desktop:"
echo "Docker Desktop → Settings → Troubleshoot → Reset to factory defaults"
