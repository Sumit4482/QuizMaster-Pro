# QuizMaster Pro
**Industry-Level Multiplayer Quiz Platform**

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ LTS
- Docker & Docker Compose
- Git

### Development Setup
```bash
# Clone the repository
git clone <repository-url>
cd QuizMaster-Pro

# Start the development environment
docker-compose up -d

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Run database migrations
cd backend && npm run db:migrate

# Start development servers
npm run dev
```

## 🏗️ Project Structure

```
QuizMaster-Pro/
├── backend/              # Node.js + Express + TypeScript API
├── frontend/             # Next.js 14 + TypeScript frontend
├── screenshots/             # UI screenshots
├── docker-compose.yml    # Development environment
└── README.md             # This file
```

## 📸 Screenshots

| | | | |
|--|--|--|--|
| [![](screenshots/image%20(18).png)](screenshots/image%20(18).png) | [![](screenshots/image%20(19).png)](screenshots/image%20(19).png) | [![](screenshots/image%20(20).png)](screenshots/image%20(20).png) | [![](screenshots/image%20(21).png)](screenshots/image%20(21).png) |
| [![](screenshots/image%20(22).png)](screenshots/image%20(22).png) | [![](screenshots/image%20(23).png)](screenshots/image%20(23).png) | [![](screenshots/image%20(24).png)](screenshots/image%20(24).png) | [![](screenshots/image%20(25).png)](screenshots/image%20(25).png) |
| [![](screenshots/image%20(26).png)](screenshots/image%20(26).png) | [![](screenshots/image%20(27).png)](screenshots/image%20(27).png) | [![](screenshots/image%20(28).png)](screenshots/image%20(28).png) | [![](screenshots/image%20(29).png)](screenshots/image%20(29).png) |
| [![](screenshots/image%20(30).png)](screenshots/image%20(30).png) | [![](screenshots/image%20(31).png)](screenshots/image%20(31).png) | [![](screenshots/image%20(32).png)](screenshots/image%20(32).png) | [![](screenshots/image%20(33).png)](screenshots/image%20(33).png) |
| [![](screenshots/image%20(34).png)](screenshots/image%20(34).png) | [![](screenshots/image%20(35).png)](screenshots/image%20(35).png) | [![](screenshots/image%20(36).png)](screenshots/image%20(36).png) | [![](screenshots/image%20(37).png)](screenshots/image%20(37).png) |
| [![](screenshots/image%20(38).png)](screenshots/image%20(38).png) | [![](screenshots/image%20(39).png)](screenshots/image%20(39).png) | [![](screenshots/image%20(40).png)](screenshots/image%20(40).png) | [![](screenshots/image%20(41).png)](screenshots/image%20(41).png) |
| [![](screenshots/image%20(42).png)](screenshots/image%20(42).png) | [![](screenshots/image%20(43).png)](screenshots/image%20(43).png) |

*Click any screenshot to open full size.*

---

## 📊 Current Status
**Phase 1.3**: ✅ Single-Player Quiz System - Simple & Fun!

**What Players Can Do Right Now:**
- 🎯 **Play Quiz Alone**: Choose categories or random mix
- 📊 **View Performance**: Track your quiz history and stats
- 🎮 **Instant Play**: From login to quiz in under 30 seconds

**Coming Soon:**
- ⚔️ **1 vs 1 Battles**: Challenge other players
- 👥 **Quiz Rooms**: Multiplayer quiz parties

## ⚡ Quick Start

Run the automated setup script:
```bash
chmod +x setup.sh
./setup.sh
```

Or manually:
```bash
# 1. Start Docker services
docker-compose up -d

# 2. Setup backend
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run dev

# 3. Setup frontend (new terminal)
cd frontend
npm install
npm run dev
```

**Open your browser:**
- 🌐 Frontend: http://localhost:3000
- 🔧 Backend API: http://localhost:3001
- ❤️ Health Check: http://localhost:3001/health

## 🔧 Development Commands

```bash
# Backend
cd backend
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run db:migrate   # Run database migrations

# Frontend  
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run lint         # Run linting

# Docker
docker-compose up -d    # Start all services
docker-compose down     # Stop all services
docker-compose logs     # View logs
```

## 🛡️ Security Features
- bcrypt password hashing (12+ rounds)
- JWT with refresh tokens
- Input validation and sanitization
- CORS configuration
- Security headers
- Rate limiting preparation

## 📚 Documentation
- [Phase Implementation Plan](./Phase-1.1-Implementation-Plan.md)
- [Technical Specifications](./Phase-1.1-Instructions.md)
- [Development Phases](./QuizMaster-Pro-Phases.md)
