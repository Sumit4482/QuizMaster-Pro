# Test Execution Guide - QuizMaster Pro Backend

## Quick Start

```bash
# Install and setup
npm install
npx prisma generate
npx prisma db push

# Run all tests
npm test
```

## Test Categories

### 1. Unit Tests
Test individual functions and services in isolation.

```bash
# Run all unit tests
npm run test:unit

# Specific unit tests
npm test -- --testPathPattern=unit/auth
npm test -- --testPathPattern=unit/question
```

**Coverage:**
- Authentication utilities ✅
- Question service logic ✅  
- Validation functions ✅
- Utility functions ✅

### 2. Integration Tests
Test API endpoints with database and external services.

```bash
# Run all integration tests
npm run test:integration

# Specific integration tests
npm test -- --testPathPattern=integration/auth
npm test -- --testPathPattern=integration/question
```

**Coverage:**
- Authentication endpoints ✅
- Question CRUD operations ✅
- Quiz session management ⚠️
- WebSocket connections ❌

### 3. Performance Tests
Load testing for scalability and performance benchmarking.

```bash
# Install performance testing tools
npm install -g artillery k6

# Run Artillery load tests
cd src/__tests__/performance
artillery run loadTest.js

# Run K6 performance tests
k6 run k6LoadTest.js

# Generate performance report
artillery report --output report.html
```

### 4. Security Tests
```bash
# Dependency vulnerability scan
npm audit

# Run with security focus
npm test -- --testNamePattern="security|auth|validation"
```

## Test Environment Setup

### Database Setup
```bash
# Using Docker (recommended)
docker run --name postgres-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=quizmaster_test -p 5433:5432 -d postgres:15
docker run --name redis-test -p 6380:6379 -d redis:7

# Using local installations
# Install PostgreSQL and Redis locally
createdb quizmaster_test
redis-server
```

### Environment Variables
Create `.env.test`:
```env
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5433/quizmaster_test
REDIS_URL=redis://localhost:6380
JWT_SECRET=test_jwt_secret_for_testing_minimum_256_bits
JWT_REFRESH_SECRET=test_jwt_refresh_secret_for_testing_minimum_256_bits
```

## Test Data Management

### Creating Test Data
```typescript
// In your test files
import { createTestUser, createTestQuestion, generateTestToken } from '../setup';

const user = await createTestUser({ email: 'test@example.com' });
const question = await createTestQuestion(user.id, { difficulty: 2 });
const token = generateTestToken();
```

### Database Cleanup
Tests automatically clean up database between runs. Manual cleanup:
```bash
# Reset test database
npx prisma migrate reset --force
npx prisma db seed
```

## Running Specific Test Scenarios

### Authentication Flow Testing
```bash
# Test user registration
npm test -- --testNamePattern="register"

# Test login flow
npm test -- --testNamePattern="login"

# Test token validation
npm test -- --testNamePattern="auth.*token"
```

### API Endpoint Testing
```bash
# Test all question endpoints
npm test -- --testPathPattern=question

# Test specific HTTP methods
npm test -- --testNamePattern="POST.*questions"
npm test -- --testNamePattern="GET.*questions"
```

### Error Scenario Testing
```bash
# Test validation errors
npm test -- --testNamePattern="validation"

# Test authentication errors
npm test -- --testNamePattern="unauthorized|forbidden"

# Test not found scenarios
npm test -- --testNamePattern="404|not found"
```

## Test Coverage Analysis

### Generate Coverage Report
```bash
# Run tests with coverage
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Coverage Targets
- **Unit Tests:** > 80%
- **Integration Tests:** > 70%
- **Overall Coverage:** > 75%

### Current Coverage Status
```
Auth Module:     ████████████████░░░░ 85%
Question Module: ████████████████░░░░ 75%
Quiz Module:     ████████░░░░░░░░░░░░ 45%
User Module:     ████████████████░░░░ 80%
Overall:         █████████████░░░░░░░ 65%
```

## Performance Test Execution

### Load Testing Scenarios

#### 1. Authentication Load Test
Tests user registration, login, and profile access under load.
```bash
artillery run loadTest.js --config config.auth.yml
```

#### 2. Question Management Load Test
Tests question CRUD operations with concurrent users.
```bash
artillery run loadTest.js --config config.questions.yml
```

#### 3. Quiz Session Load Test
Tests quiz session creation and question answering flow.
```bash
k6 run k6LoadTest.js
```

### Performance Thresholds
- **Response Time P95:** < 500ms
- **Success Rate:** > 95%
- **Concurrent Users:** 50+
- **Requests/Second:** 40+

## Troubleshooting Common Issues

### Database Connection Issues
```bash
# Check database connection
npx prisma db pull

# Reset database if corrupted
npx prisma migrate reset --force
```

### Test Isolation Problems
```bash
# Run tests sequentially
npm test -- --runInBand

# Increase test timeout
npm test -- --testTimeout=10000
```

### Memory Issues
```bash
# Run with increased memory
node --max-old-space-size=4096 ./node_modules/.bin/jest

# Run specific test files only
npm test -- src/__tests__/unit/auth.test.ts
```

### Foreign Key Constraint Errors
The test setup automatically handles cleanup order. If you see constraint errors:
1. Check if new models were added to Prisma schema
2. Update `src/__tests__/setup.ts` cleanup order
3. Ensure all dependent records are deleted first

## CI/CD Integration

### GitHub Actions
Tests run automatically on:
- Push to main/develop branches
- Pull requests
- Scheduled runs (weekly)

View pipeline: `.github/workflows/backend-ci.yml`

### Local CI Simulation
```bash
# Run the full CI pipeline locally
npm run ci:local

# Individual CI steps
npm run lint
npm run type-check
npm run test:coverage
npm run build
```

## Test Maintenance

### Weekly Tasks
- [ ] Review failing tests
- [ ] Update test data as needed
- [ ] Check performance metrics
- [ ] Update dependencies

### Monthly Tasks
- [ ] Analyze coverage reports
- [ ] Review and update test scenarios
- [ ] Performance baseline updates
- [ ] Security audit review

### Adding New Tests

#### 1. Unit Test Template
```typescript
import { ServiceName } from '@/services/serviceName';

describe('ServiceName', () => {
  let service: ServiceName;
  
  beforeEach(() => {
    service = new ServiceName();
  });
  
  describe('methodName', () => {
    it('should handle success case', async () => {
      const result = await service.methodName(validInput);
      expect(result.success).toBe(true);
    });
    
    it('should handle error case', async () => {
      await expect(service.methodName(invalidInput)).rejects.toThrow();
    });
  });
});
```

#### 2. Integration Test Template
```typescript
import request from 'supertest';
import { createApp } from '@/app';

describe('Endpoint Integration Tests', () => {
  let app: Application;
  let authToken: string;
  
  beforeAll(async () => {
    app = createApp();
    // Setup auth token
  });
  
  describe('POST /api/endpoint', () => {
    it('should create resource successfully', async () => {
      const response = await request(app)
        .post('/api/endpoint')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validData)
        .expect(201);
        
      expect(response.body.success).toBe(true);
    });
  });
});
```

## Best Practices

### Test Writing Guidelines
1. **Descriptive Names:** Use clear, descriptive test names
2. **Single Responsibility:** Each test should test one thing
3. **Arrange-Act-Assert:** Structure tests clearly
4. **Test Edge Cases:** Include boundary conditions
5. **Mock External Services:** Isolate unit tests

### Performance Testing Guidelines
1. **Realistic Load:** Use production-like data volumes
2. **Gradual Ramp:** Start with low load and increase
3. **Monitor Resources:** Track CPU, memory, database connections
4. **Document Baselines:** Record performance benchmarks
5. **Automate Regression:** Include in CI pipeline

### Security Testing Guidelines
1. **Input Validation:** Test malicious inputs
2. **Authentication:** Verify token validation
3. **Authorization:** Test permission boundaries
4. **SQL Injection:** Test with malicious queries
5. **XSS Prevention:** Test script injection attempts

## Help and Support

### Debug Information
Enable verbose test output:
```bash
npm test -- --verbose --detectOpenHandles
```

### Common Commands Reference
```bash
# Test specific file
npm test auth.test.ts

# Test with pattern
npm test -- --testNamePattern="register"

# Run tests in watch mode
npm run test:watch

# Generate coverage
npm run test:coverage

# Performance tests
artillery run loadTest.js
k6 run k6LoadTest.js
```

### Getting Help
- Check test logs: `npm test -- --verbose`
- Review setup file: `src/__tests__/setup.ts`
- Database issues: Check Prisma schema
- Performance issues: Review K6/Artillery configs
- CI failures: Check GitHub Actions logs
