#!/bin/bash

# QuizMaster Pro - Quick Setup Script
# This script automates the setup process for development

set -e  # Exit on any error

echo "🎯 QuizMaster Pro - Quick Setup"
echo "================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required. Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is required. Please install Docker Compose"
    exit 1
fi

node_version=$(node -v)
echo "✅ Node.js version: $node_version"
echo "✅ Docker version: $(docker --version)"
echo "✅ Docker Compose version: $(docker-compose --version)"

# Setup environment files
echo ""
echo "🔧 Setting up environment files..."

# Backend environment
if [ ! -f "backend/.env" ]; then
    cat > backend/.env << 'ENVEOF'
NODE_ENV=development
DATABASE_URL="postgresql://quizmaster:development_password_change_in_production@localhost:5432/quizmaster"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="development_jwt_secret_change_in_production_256_bit_minimum"
JWT_REFRESH_SECRET="development_refresh_secret_change_in_production_256_bit_minimum"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3001
CORS_ORIGIN="http://localhost:3000"
LOG_LEVEL=debug
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENVEOF
    echo "✅ Created backend/.env"
else
    echo "⚠️  backend/.env already exists, skipping..."
fi

# Start Docker services
echo ""
echo "🐳 Starting Docker services..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Setup backend
echo ""
echo "🔧 Setting up backend..."
cd backend

if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
else
    echo "✅ Backend dependencies already installed"
fi

echo "🗄️ Setting up database..."
npm run db:generate
npm run db:migrate

echo "✅ Backend setup complete!"
cd ..

# Setup frontend
echo ""
echo "🎨 Setting up frontend..."
cd frontend

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
else
    echo "✅ Frontend dependencies already installed"
fi

echo "✅ Frontend setup complete!"
cd ..

# Final instructions
echo ""
echo "🎉 Setup Complete!"
echo "==================="
echo ""
echo "To start development:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend && npm run dev"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend && npm run dev"
echo ""
echo "Then open:"
echo "  🌐 Frontend: http://localhost:3000"
echo "  🔧 Backend API: http://localhost:3001"
echo "  ❤️  Health Check: http://localhost:3001/health"
echo ""
echo "📚 Read SETUP.md for detailed instructions"
echo ""
echo "Happy coding! 🚀"

