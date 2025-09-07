# QuizMaster Pro API Test Report

**Generated:** 2025-09-06T17:45:09.499Z

**Base URL:** http://localhost:3001

**Total Duration:** 753ms

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 9 |
| Passed | 7 |
| Failed | 2 |
| Success Rate | 77.78% |
| Total Duration | 753ms |

## Overall Status: 🔴 SOME TESTS FAILING

## Detailed Results

### Health Checks

✅ **Health Check - Ready** (115ms)
   - Test health/ready endpoint
   - Status: 200
   - database: "ready"
   - redis: "ready"

✅ **Health Check - Live** (2ms)
   - Test health/live endpoint
   - Status: 200
   - uptime: 13.3075205

### Authentication

✅ **User Registration** (549ms)
   - Register a new test user
   - Status: 201
   - userId: "59fc56e6-3580-4281-a324-5a218b3dfb30"
   - hasTokens: true

❌ **User Login** (5ms)
   - Login with existing user credentials
   - **Error:** Request failed with status code 401
   - **Error Code:** UNAUTHORIZED
   - **HTTP Status:** 401

✅ **Invalid Login** (3ms)
   - Test login with invalid credentials
   - Status: 401
   - errorCode: "UNAUTHORIZED"
   - message: "Correctly rejected invalid credentials"

### Error Handling

✅ **Not Found Endpoint** (1ms)
   - Test non-existent endpoint returns 404
   - Status: 404
   - errorCode: "NOT_FOUND"
   - message: "Correctly returned 404 for non-existent endpoint"

❌ **Malformed Request Body** (3ms)
   - Test endpoint with invalid JSON
   - **Error:** Request failed with status code 500
   - **Error Code:** INTERNAL_SERVER_ERROR
   - **HTTP Status:** 500

### Performance

✅ **Rate Limiting** (69ms)
   - Test rate limiting with rapid requests
   - Status: N/A
   - totalRequests: 10
   - rateLimitedRequests: 0
   - rateLimitingActive: false

## API Coverage

### Tested Endpoints
- Health endpoints: /health/ready, /health/live
- Auth endpoints: /api/auth/register, /api/auth/login, /api/auth/profile
- Category endpoints: /api/categories, /api/categories/tree
- Question endpoints: /api/questions/search
- Quiz endpoints: /api/quiz/sessions, /api/quiz/sessions/:id/start, /api/quiz/sessions/:id/current-question, /api/quiz/sessions/:id/submit-answer

## Recommendations

### 🔴 Critical Issues
- **User Login:** Request failed with status code 401
- **Malformed Request Body:** Request failed with status code 500

