# QuizMaster Pro - Complete Setup Guide

## 🎯 Overview

This guide will help you set up QuizMaster Pro Phase 1.1 - a complete authentication system with secure backend and responsive frontend.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+** - [Download here](https://nodejs.org/)
- **Docker & Docker Compose** - [Download here](https://docs.docker.com/get-docker/)
- **Git** - [Download here](https://git-scm.com/downloads)

## 🚀 Quick Start (5 minutes)

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd QuizMaster-Pro
```

### 2. Environment Setup
Create environment files from templates:

**Backend (.env):**
```bash
cd backend
cp .env.template .env
```

Edit `backend/.env` with your settings:
```env
NODE_ENV=development
DATABASE_URL="postgresql://quizmaster:development_password@localhost:5432/quizmaster"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-super-secure-jwt-secret-here-32-characters-minimum"
JWT_REFRESH_SECRET="your-super-secure-refresh-secret-here-32-characters-minimum"
PORT=3001
CORS_ORIGIN="http://localhost:3000"
```

### 3. Start Development Environment
```bash
# From project root
docker-compose up -d

# Wait for services to be ready
docker-compose logs -f
```

### 4. Setup Database
```bash
cd backend
npm install
npm run db:migrate
npm run db:seed  # Optional: seed with sample data
```

### 5. Install Frontend Dependencies
```bash
cd ../frontend
npm install
```

### 6. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 7. Open Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Health**: http://localhost:3001/health

---

## 📊 System Architecture

### High-Level Overview
```
Frontend (Next.js 14)  →  Backend (Express.js)  →  Database (PostgreSQL)
     ↓                          ↓                        ↓
- Authentication UI        - JWT Auth System        - User Data
- Responsive Design        - Password Hashing       - Session Management
- State Management         - Input Validation       - Question Storage
- Form Validation          - Rate Limiting          - Audit Logging
```

### Technology Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Zustand
- **Backend**: Node.js, Express, TypeScript, Prisma, JWT
- **Database**: PostgreSQL 15, Redis
- **DevOps**: Docker, GitHub Actions
- **Security**: bcrypt, Helmet, CORS, Rate limiting

---

## 🔐 Security Features

### ✅ Password Security
- **bcrypt hashing** with 12+ salt rounds
- **Password strength validation**
- **Secure password reset** (UI prepared)

### ✅ JWT Authentication
- **Access tokens** (15 min expiry)
- **Refresh tokens** (7 days expiry)
- **Token blacklisting** on logout
- **Automatic token refresh**

### ✅ Input Validation
- **Server-side validation** with Joi
- **Client-side validation** with real-time feedback
- **SQL injection prevention**
- **XSS protection**

### ✅ Security Headers
- Helmet.js security headers
- CORS configuration
- Rate limiting
- Request size limits

---

## 🧪 Testing

### Backend Tests
```bash
cd backend

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

### Frontend Tests
```bash
cd frontend

# Unit and component tests
npm run test

# E2E tests (requires running app)
npm run test:e2e
```

### Manual Testing Checklist

#### Authentication Flow
- [ ] User registration with validation
- [ ] User login with correct credentials
- [ ] Login fails with wrong credentials
- [ ] Password strength indicator works
- [ ] JWT tokens are properly stored
- [ ] Protected routes redirect correctly
- [ ] Logout clears authentication state

#### Security Testing
- [ ] Passwords are hashed (not stored in plaintext)
- [ ] JWT tokens expire properly
- [ ] Rate limiting prevents abuse
- [ ] Input validation blocks malicious data
- [ ] CORS blocks unauthorized origins

---

## 🗄️ Database Schema

### Core Tables

**Users Table:**
- `id` (UUID, Primary Key)
- `email` (Unique, Required)
- `username` (Unique, Required)
- `password_hash` (bcrypt, Required)
- `first_name`, `last_name` (Optional)
- `role` (ADMIN, HOST, PLAYER)
- `email_verified` (Boolean)
- Timestamps and indexes

**User Sessions Table:**
- `id` (UUID, Primary Key)
- `user_id` (Foreign Key to Users)
- `token_jti` (JWT ID for blacklisting)
- `refresh_token_hash` (bcrypt)
- `expires_at`, `created_at`

### Database Operations
```bash
# Reset database
npm run db:reset

# Run migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Open Prisma Studio
npm run db:studio
```

---

## 🌐 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | User registration | `{ email, username, password, firstName?, lastName? }` |
| POST | `/api/auth/login` | User login | `{ email, password, rememberMe? }` |
| POST | `/api/auth/logout` | Logout current session | None |
| POST | `/api/auth/logout-all` | Logout all sessions | None |
| POST | `/api/auth/refresh` | Refresh access token | `{ refreshToken }` |
| GET | `/api/auth/profile` | Get user profile | None |
| PUT | `/api/auth/profile` | Update user profile | `{ firstName?, lastName?, avatarUrl? }` |
| PUT | `/api/auth/change-password` | Change password | `{ currentPassword, newPassword, confirmPassword }` |

### Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed system health |
| GET | `/health/ready` | Readiness probe |
| GET | `/health/live` | Liveness probe |

### Example API Calls

**Register User:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "testuser",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

---

## 🎨 Frontend Components

### Available Components

**Form Components:**
- `Button` - Multiple variants and states
- `Input` - With validation and icons
- `Card` - Flexible container component

**Layout Components:**
- `LoadingPage` - Full-page loading states
- `LoadingSpinner` - Inline loading indicators

**Pages:**
- `HomePage` - Landing page with features
- `LoginPage` - Authentication form
- `RegisterPage` - User registration
- `DashboardPage` - Protected user dashboard

### State Management

**Authentication Store (Zustand):**
```typescript
const { user, login, register, logout } = useAuth();
```

**Theme Store:**
```typescript
const { theme, setTheme, toggleTheme } = useTheme();
```

---

## 🔧 Development Commands

### Backend Commands
```bash
cd backend

npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run all tests
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run type-check   # TypeScript type checking
```

### Frontend Commands
```bash
cd frontend

npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run type-check   # TypeScript type checking
```

### Docker Commands
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild services
docker-compose build

# Start specific service
docker-compose up backend
```

---

## 🐛 Troubleshooting

### Common Issues

**"Port already in use"**
```bash
# Kill processes on ports 3000 and 3001
npx kill-port 3000 3001

# Or use different ports
PORT=3002 npm run dev
```

**Database connection errors**
```bash
# Ensure PostgreSQL is running
docker-compose up postgres -d

# Check database logs
docker-compose logs postgres

# Reset database
npm run db:reset
```

**Frontend build errors**
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Docker issues**
```bash
# Clean Docker system
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache

# Check service health
docker-compose ps
```

### Performance Issues

**Slow API responses**
- Check database query performance
- Enable query logging in Prisma
- Monitor Redis connection

**Frontend loading slowly**
- Check bundle size: `npm run analyze`
- Optimize images and assets
- Enable service worker caching

### Security Checklist

- [ ] Environment variables are not committed
- [ ] JWT secrets are 256-bit minimum
- [ ] Database passwords are strong
- [ ] CORS origins are restricted
- [ ] Rate limiting is enabled
- [ ] Input validation is comprehensive

---

## 🚀 Deployment

### Staging Deployment
```bash
# Build production images
docker build -t quizmaster-backend:staging ./backend
docker build -t quizmaster-frontend:staging ./frontend

# Deploy with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables for Production
```env
NODE_ENV=production
DATABASE_URL="postgresql://user:password@host:5432/dbname"
JWT_SECRET="your-256-bit-production-secret"
JWT_REFRESH_SECRET="your-256-bit-refresh-secret"
CORS_ORIGIN="https://yourdomain.com"
```

---

## 📈 Monitoring & Logging

### Health Monitoring
- **Health endpoints**: `/health/*`
- **Application metrics**: Response times, error rates
- **Database metrics**: Connection pool, query performance
- **System metrics**: CPU, memory, disk usage

### Logging
- **Structured logging** with Winston
- **Correlation IDs** for request tracking
- **Error tracking** with stack traces
- **Audit logging** for sensitive operations

---

## 🎯 Next Steps (Phase 2)

Phase 1.1 provides a solid foundation. The next phase will add:

- **WebSocket integration** for real-time communication
- **Game room management** with unique codes
- **Live multiplayer gameplay** with synchronized questions
- **Real-time leaderboards** and scoring
- **Advanced game modes** and power-ups

---

## 🆘 Support

If you encounter issues:

1. **Check the logs** - Use `docker-compose logs` to see error details
2. **Review this guide** - Ensure all steps were followed correctly
3. **Test the API** - Use curl or Postman to test endpoints directly
4. **Check GitHub Issues** - Search for similar problems
5. **Run diagnostics** - Use health endpoints to check system status

**System Status Endpoints:**
- http://localhost:3001/health/detailed
- http://localhost:3001/api

This comprehensive setup gives you a production-ready authentication system that can scale to millions of users while maintaining security and performance standards. 🚀
