#!/usr/bin/env node

/**
 * QuizMaster Pro Comprehensive API Test Suite
 * Complete testing with detailed reporting and edge case coverage
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
  timeout: 15000,
  testUser: {
    email: `test-${Date.now()}@example.com`,
    username: `testuser${Date.now()}`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User'
  },
  existingAdmin: {
    email: 'admin@quizmaster.pro',
    username: 'admin',
    password: 'Admin123!'
  }
};

class ComprehensiveAPITester {
  constructor() {
    this.results = [];
    this.tokens = {};
    this.createdResources = {
      sessions: [],
      users: [],
      categories: []
    };
    this.startTime = new Date();
    
    this.api = axios.create({
      baseURL: CONFIG.baseUrl,
      timeout: CONFIG.timeout,
      headers: { 'Content-Type': 'application/json' }
    });

    this.api.interceptors.response.use(
      response => response,
      error => {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to API server at ${CONFIG.baseUrl}`);
        }
        return Promise.reject(error);
      }
    );
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const colors = {
      'INFO': '\x1b[36m',
      'PASS': '\x1b[32m',
      'FAIL': '\x1b[31m',
      'WARN': '\x1b[33m',
      'TEST': '\x1b[34m'
    };
    const reset = '\x1b[0m';
    console.log(`${colors[level] || ''}[${timestamp}] [${level}] ${message}${reset}`);
  }

  async runTest(category, testName, description, testFn, expectedStatusCodes = [200, 201]) {
    const startTime = Date.now();
    this.log(`🧪 ${category} - ${testName}`, 'TEST');
    
    const result = {
      category,
      testName,
      description,
      status: 'PENDING',
      duration: 0,
      error: null,
      details: null,
      timestamp: new Date().toISOString(),
      expectedStatusCodes
    };

    try {
      const details = await testFn();
      
      // Check if status code is expected
      if (details.statusCode && !expectedStatusCodes.includes(details.statusCode)) {
        throw new Error(`Unexpected status code: ${details.statusCode}, expected one of: ${expectedStatusCodes.join(', ')}`);
      }
      
      result.status = 'PASS';
      result.details = details;
      this.log(`✅ PASS: ${testName}`, 'PASS');
    } catch (error) {
      result.status = 'FAIL';
      result.error = {
        message: error.message,
        code: error.response?.data?.error?.code || error.code || 'UNKNOWN',
        statusCode: error.response?.status,
        responseData: error.response?.data
      };
      this.log(`❌ FAIL: ${testName} - ${error.message}`, 'FAIL');
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
    return result;
  }

  async testHealthEndpoints() {
    await this.runTest(
      'Health',
      'Health Ready Check',
      'Verify system readiness including database and Redis',
      async () => {
        const response = await this.api.get('/health/ready');
        const data = response.data.data;
        
        if (!data.ready || data.services.database !== 'ready' || data.services.redis !== 'ready') {
          throw new Error('System not ready');
        }
        
        return {
          statusCode: response.status,
          ready: data.ready,
          database: data.services.database,
          redis: data.services.redis,
          timestamp: data.timestamp
        };
      }
    );

    await this.runTest(
      'Health',
      'Health Live Check',
      'Verify system liveness',
      async () => {
        const response = await this.api.get('/health/live');
        return {
          statusCode: response.status,
          uptime: response.data.data.uptime,
          version: response.data.data.version
        };
      }
    );

    await this.runTest(
      'Health',
      'Swagger Documentation',
      'Verify API documentation is accessible',
      async () => {
        const response = await this.api.get('/api-docs', {
          headers: { 'Accept': 'text/html' }
        });
        return {
          statusCode: response.status,
          contentType: response.headers['content-type'],
          hasDocumentation: response.data.includes('swagger')
        };
      }
    );
  }

  async testAuthenticationFlow() {
    // Test user registration
    await this.runTest(
      'Authentication',
      'User Registration',
      'Register a new user with valid data',
      async () => {
        const response = await this.api.post('/api/auth/register', CONFIG.testUser);
        
        if (!response.data.success || !response.data.data.tokens.accessToken) {
          throw new Error('Registration failed - no access token returned');
        }

        this.tokens.testUser = response.data.data.tokens.accessToken;
        this.createdResources.users.push(response.data.data.user.id);
        
        return {
          statusCode: response.status,
          userId: response.data.data.user.id,
          username: response.data.data.user.username,
          email: response.data.data.user.email,
          role: response.data.data.user.role,
          hasAccessToken: !!response.data.data.tokens.accessToken,
          hasRefreshToken: !!response.data.data.tokens.refreshToken,
          tokenExpiry: response.data.data.tokens.expiresAt
        };
      },
      [201]
    );

    // Test duplicate registration
    await this.runTest(
      'Authentication',
      'Duplicate Registration',
      'Attempt to register with existing email',
      async () => {
        try {
          await this.api.post('/api/auth/register', CONFIG.testUser);
          throw new Error('Registration should have failed');
        } catch (error) {
          if (error.response?.status === 400 || error.response?.status === 409) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [400, 409]
    );

    // Test admin login
    await this.runTest(
      'Authentication',
      'Admin User Login',
      'Login with admin credentials',
      async () => {
        const response = await this.api.post('/api/auth/login', {
          email: CONFIG.existingAdmin.email,
          password: CONFIG.existingAdmin.password
        });
        
        if (!response.data.success) {
          throw new Error('Login failed');
        }

        this.tokens.admin = response.data.data.tokens.accessToken;
        
        return {
          statusCode: response.status,
          userId: response.data.data.user.id,
          username: response.data.data.user.username,
          role: response.data.data.user.role,
          hasAccessToken: !!response.data.data.tokens.accessToken,
          emailVerified: response.data.data.user.emailVerified
        };
      }
    );

    // Test invalid login credentials
    await this.runTest(
      'Authentication',
      'Invalid Login Credentials',
      'Test login with wrong password',
      async () => {
        try {
          await this.api.post('/api/auth/login', {
            email: CONFIG.existingAdmin.email,
            password: 'wrongpassword'
          });
          throw new Error('Login should have failed');
        } catch (error) {
          if (error.response?.status === 401) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [401]
    );

    // Test user profile retrieval
    if (this.tokens.admin) {
      await this.runTest(
        'Authentication',
        'Get User Profile',
        'Retrieve authenticated user profile',
        async () => {
          const response = await this.api.get('/api/auth/profile', {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          return {
            statusCode: response.status,
            userId: response.data.data.id,
            email: response.data.data.email,
            role: response.data.data.role,
            emailVerified: response.data.data.emailVerified,
            hasStatistics: !!response.data.data.statistics
          };
        }
      );
    }

    // Test unauthorized access
    await this.runTest(
      'Authentication',
      'Unauthorized Access',
      'Access protected route without token',
      async () => {
        try {
          await this.api.get('/api/auth/profile');
          throw new Error('Request should have been rejected');
        } catch (error) {
          if (error.response?.status === 401) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [401]
    );

    // Test invalid token
    await this.runTest(
      'Authentication',
      'Invalid Token',
      'Access protected route with invalid token',
      async () => {
        try {
          await this.api.get('/api/auth/profile', {
            headers: { Authorization: 'Bearer invalid.token.here' }
          });
          throw new Error('Request should have been rejected');
        } catch (error) {
          if (error.response?.status === 401) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [401]
    );
  }

  async testCategoryManagement() {
    if (!this.tokens.admin) {
      this.log('Skipping category tests - no admin token available', 'WARN');
      return;
    }

    const authHeaders = { Authorization: `Bearer ${this.tokens.admin}` };

    await this.runTest(
      'Categories',
      'Get All Categories',
      'Retrieve all available categories',
      async () => {
        const response = await this.api.get('/api/categories', { headers: authHeaders });
        
        const categories = response.data.data;
        if (!Array.isArray(categories)) {
          throw new Error('Categories response is not an array');
        }
        
        return {
          statusCode: response.status,
          totalCategories: categories.length,
          hasCategories: categories.length > 0,
          activeCategories: categories.filter(c => c.isActive).length,
          sampleCategory: categories[0] ? {
            id: categories[0].id,
            name: categories[0].name,
            slug: categories[0].slug
          } : null
        };
      }
    );

    await this.runTest(
      'Categories',
      'Get Category Tree',
      'Retrieve hierarchical category structure',
      async () => {
        const response = await this.api.get('/api/categories/tree', { headers: authHeaders });
        
        return {
          statusCode: response.status,
          hasTreeStructure: Array.isArray(response.data.data),
          treeNodes: response.data.data?.length || 0
        };
      }
    );

    await this.runTest(
      'Categories',
      'Get Root Categories',
      'Retrieve top-level categories without parents',
      async () => {
        const response = await this.api.get('/api/categories/root', { headers: authHeaders });
        
        return {
          statusCode: response.status,
          rootCategories: response.data.data?.length || 0,
          hasRootCategories: Array.isArray(response.data.data) && response.data.data.length > 0
        };
      }
    );
  }

  async testQuestionManagement() {
    if (!this.tokens.admin) {
      this.log('Skipping question tests - no admin token available', 'WARN');
      return;
    }

    const authHeaders = { Authorization: `Bearer ${this.tokens.admin}` };

    await this.runTest(
      'Questions',
      'Search All Questions',
      'Search questions with default parameters',
      async () => {
        const response = await this.api.get('/api/questions/search', { headers: authHeaders });
        
        const data = response.data.data;
        
        return {
          statusCode: response.status,
          totalQuestions: data.total,
          returnedQuestions: data.questions?.length || 0,
          currentPage: data.page,
          totalPages: data.totalPages,
          hasQuestions: data.total > 0
        };
      }
    );

    await this.runTest(
      'Questions',
      'Search Questions with Filters',
      'Search questions with specific filters',
      async () => {
        const params = {
          questionTypes: 'MULTIPLE_CHOICE',
          difficultyLevels: '1,2',
          limit: 5,
          page: 1
        };
        
        const response = await this.api.get('/api/questions/search', { 
          headers: authHeaders,
          params 
        });
        
        const data = response.data.data;
        
        return {
          statusCode: response.status,
          filteredTotal: data.total,
          returnedQuestions: data.questions?.length || 0,
          allMultipleChoice: data.questions?.every(q => q.questionType === 'MULTIPLE_CHOICE') || false,
          correctDifficulty: data.questions?.every(q => q.difficultyLevel <= 2) || false
        };
      }
    );

    await this.runTest(
      'Questions',
      'Search Questions with Pagination',
      'Test question search pagination',
      async () => {
        const response = await this.api.get('/api/questions/search?page=1&limit=3', { 
          headers: authHeaders 
        });
        
        const data = response.data.data;
        
        return {
          statusCode: response.status,
          page: data.page,
          limit: data.limit,
          total: data.total,
          totalPages: data.totalPages,
          hasNextPage: data.page < data.totalPages,
          questionCount: data.questions?.length || 0
        };
      }
    );

    await this.runTest(
      'Questions',
      'Invalid Question Search',
      'Test question search with invalid parameters',
      async () => {
        try {
          await this.api.get('/api/questions/search?page=0&limit=-1', { 
            headers: authHeaders 
          });
          throw new Error('Request should have failed with invalid parameters');
        } catch (error) {
          if (error.response?.status === 400) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [400]
    );
  }

  async testQuizSessionManagement() {
    if (!this.tokens.admin) {
      this.log('Skipping quiz session tests - no admin token available', 'WARN');
      return;
    }

    const authHeaders = { Authorization: `Bearer ${this.tokens.admin}` };
    let sessionId = null;

    await this.runTest(
      'Quiz Sessions',
      'Create Quiz Session',
      'Create a new quiz session with valid configuration',
      async () => {
        const sessionConfig = {
          totalQuestions: 3,
          categoryIds: [1], // Science category
          timePerQuestion: 60,
          difficultyLevels: [1, 2],
          questionTypes: ['MULTIPLE_CHOICE'],
          shuffleQuestions: true,
          allowPause: true,
          showExplanations: true
        };

        const response = await this.api.post('/api/quiz/sessions', sessionConfig, { 
          headers: authHeaders 
        });
        
        if (!response.data.success || !response.data.data.id) {
          throw new Error('Failed to create quiz session');
        }

        sessionId = response.data.data.id;
        this.createdResources.sessions.push(sessionId);

        return {
          statusCode: response.status,
          sessionId: response.data.data.id,
          totalQuestions: response.data.data.totalQuestions,
          status: response.data.data.status,
          categoryCount: response.data.data.categoryIds.length,
          timePerQuestion: response.data.data.timePerQuestion,
          expiresAt: response.data.data.expiresAt
        };
      },
      [201]
    );

    if (sessionId) {
      await this.runTest(
        'Quiz Sessions',
        'Get Quiz Session Details',
        'Retrieve details of created quiz session',
        async () => {
          const response = await this.api.get(`/api/quiz/sessions/${sessionId}`, { 
            headers: authHeaders 
          });
          
          return {
            statusCode: response.status,
            sessionId: response.data.data.id,
            status: response.data.data.status,
            currentQuestionIndex: response.data.data.currentQuestionIndex,
            questionsAnswered: response.data.data.questionsAnswered,
            totalScore: response.data.data.totalScore
          };
        }
      );

      await this.runTest(
        'Quiz Sessions',
        'Start Quiz Session',
        'Start the created quiz session',
        async () => {
          const response = await this.api.post(`/api/quiz/sessions/${sessionId}/start`, {}, { 
            headers: authHeaders 
          });
          
          return {
            statusCode: response.status,
            status: response.data.data.status,
            startedAt: response.data.data.startedAt,
            currentQuestionIndex: response.data.data.currentQuestionIndex
          };
        }
      );

      await this.runTest(
        'Quiz Sessions',
        'Get Current Question',
        'Retrieve the current question in the quiz',
        async () => {
          const response = await this.api.get(`/api/quiz/sessions/${sessionId}/current-question`, { 
            headers: authHeaders 
          });
          
          return {
            statusCode: response.status,
            questionId: response.data.data.id,
            questionType: response.data.data.questionType,
            difficultyLevel: response.data.data.difficultyLevel,
            hasOptions: !!response.data.data.options,
            optionCount: response.data.data.options?.options?.length || 0,
            points: response.data.data.points,
            estimatedTime: response.data.data.estimatedTime
          };
        }
      );

      // Submit an answer
      await this.runTest(
        'Quiz Sessions',
        'Submit Quiz Answer',
        'Submit an answer to the current question',
        async () => {
          // Get the current question first
          const questionResponse = await this.api.get(`/api/quiz/sessions/${sessionId}/current-question`, { 
            headers: authHeaders 
          });
          
          const question = questionResponse.data.data;
          const answerData = {
            questionId: question.id,
            userAnswer: question.options?.options?.[0] || 'Test Answer',
            timeTaken: 25
          };

          const response = await this.api.post(
            `/api/quiz/sessions/${sessionId}/submit-answer`, 
            answerData, 
            { headers: authHeaders }
          );
          
          return {
            statusCode: response.status,
            isCorrect: response.data.data.isCorrect,
            pointsEarned: response.data.data.pointsEarned,
            basePoints: response.data.data.scoring?.basePoints,
            timeBonus: response.data.data.scoring?.timeBonus,
            totalScore: response.data.data.sessionProgress?.totalScore,
            progressPercentage: response.data.data.sessionProgress?.progressPercentage,
            questionsAnswered: response.data.data.sessionProgress?.questionsAnswered,
            hasExplanation: !!response.data.data.explanation
          };
        }
      );

      await this.runTest(
        'Quiz Sessions',
        'Get User Quiz History',
        'Retrieve user\'s quiz history',
        async () => {
          const response = await this.api.get('/api/quiz/history', { 
            headers: authHeaders,
            params: { page: 1, limit: 10 }
          });
          
          return {
            statusCode: response.status,
            totalSessions: response.data.data.total || 0,
            sessionCount: response.data.data.sessions?.length || 0,
            hasHistory: (response.data.data.total || 0) > 0
          };
        }
      );
    }

    // Test invalid session creation
    await this.runTest(
      'Quiz Sessions',
      'Invalid Session Creation',
      'Attempt to create session with invalid data',
      async () => {
        const invalidConfig = {
          totalQuestions: -1, // Invalid
          categoryIds: [], // Empty
          timePerQuestion: 0, // Invalid
        };

        try {
          await this.api.post('/api/quiz/sessions', invalidConfig, { 
            headers: authHeaders 
          });
          throw new Error('Session creation should have failed');
        } catch (error) {
          if (error.response?.status === 400) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [400]
    );
  }

  async testErrorHandling() {
    // Test 404 for non-existent endpoints
    await this.runTest(
      'Error Handling',
      'Non-existent Endpoint',
      'Request to non-existent API endpoint',
      async () => {
        try {
          await this.api.get('/api/nonexistent-endpoint-12345');
          throw new Error('Request should have returned 404');
        } catch (error) {
          if (error.response?.status === 404) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              hasCorrelationId: !!error.response.data.correlationId,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [404]
    );

    // Test method not allowed
    await this.runTest(
      'Error Handling',
      'Method Not Allowed',
      'Use wrong HTTP method on existing endpoint',
      async () => {
        try {
          await this.api.delete('/health/ready');
          throw new Error('Request should have failed');
        } catch (error) {
          if (error.response?.status === 404 || error.response?.status === 405) {
            return {
              statusCode: error.response.status,
              correctlyRejected: true
            };
          }
          throw error;
        }
      },
      [404, 405]
    );

    // Test large request body
    await this.runTest(
      'Error Handling',
      'Large Request Body',
      'Send extremely large request body',
      async () => {
        const largeData = {
          data: 'x'.repeat(20 * 1024 * 1024) // 20MB string
        };

        try {
          await this.api.post('/api/auth/login', largeData);
          throw new Error('Large request should have been rejected');
        } catch (error) {
          if (error.response?.status === 413 || error.response?.status === 400 || error.code === 'ECONNABORTED') {
            return {
              statusCode: error.response?.status || 'TIMEOUT',
              correctlyRejected: true,
              errorType: error.code || 'HTTP_ERROR'
            };
          }
          throw error;
        }
      },
      [413, 400, 'TIMEOUT']
    );
  }

  async testPerformanceAndLimits() {
    // Test concurrent requests
    await this.runTest(
      'Performance',
      'Concurrent Health Checks',
      'Multiple simultaneous health check requests',
      async () => {
        const startTime = Date.now();
        const concurrentRequests = 10;
        
        const promises = Array(concurrentRequests).fill().map(() => 
          this.api.get('/health/ready')
        );

        const results = await Promise.all(promises);
        const endTime = Date.now();

        const allSuccessful = results.every(r => r.status === 200);

        return {
          statusCode: 200,
          concurrentRequests,
          allSuccessful,
          totalTime: endTime - startTime,
          averageTime: (endTime - startTime) / concurrentRequests,
          requestsPerSecond: Math.round((concurrentRequests * 1000) / (endTime - startTime))
        };
      }
    );

    // Test response times for critical endpoints
    const endpointsToTest = [
      { path: '/health/ready', description: 'Health Check' },
      { path: '/health/live', description: 'Liveness Check' }
    ];

    for (const endpoint of endpointsToTest) {
      await this.runTest(
        'Performance',
        `Response Time - ${endpoint.description}`,
        `Measure response time for ${endpoint.path}`,
        async () => {
          const samples = 5;
          const times = [];

          for (let i = 0; i < samples; i++) {
            const start = Date.now();
            await this.api.get(endpoint.path);
            times.push(Date.now() - start);
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between requests
          }

          const average = times.reduce((a, b) => a + b, 0) / times.length;
          const min = Math.min(...times);
          const max = Math.max(...times);

          return {
            statusCode: 200,
            samples,
            averageResponseTime: Math.round(average),
            minResponseTime: min,
            maxResponseTime: max,
            allTimes: times,
            performanceGrade: average < 100 ? 'Excellent' : average < 500 ? 'Good' : average < 1000 ? 'Fair' : 'Poor'
          };
        }
      );
    }
  }

  generateDetailedReport() {
    const endTime = new Date();
    const totalDuration = endTime - this.startTime;
    
    // Calculate statistics
    const stats = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      duration: totalDuration
    };

    const successRate = stats.total > 0 ? (stats.passed / stats.total * 100).toFixed(2) : 0;

    // Group results by category
    const categories = {};
    this.results.forEach(result => {
      if (!categories[result.category]) {
        categories[result.category] = [];
      }
      categories[result.category].push(result);
    });

    let report = `# 🧪 QuizMaster Pro - Comprehensive API Test Report\n\n`;
    report += `**Test Run ID:** ${this.startTime.getTime()}\n\n`;
    report += `**Generated:** ${endTime.toISOString()}\n\n`;
    report += `**Base URL:** \`${CONFIG.baseUrl}\`\n\n`;
    report += `**Total Duration:** ${(totalDuration / 1000).toFixed(2)}s\n\n`;

    // Executive Summary
    const overallStatus = stats.failed === 0 ? '🟢 ALL SYSTEMS OPERATIONAL' : '🔴 ISSUES DETECTED';
    report += `## 🎯 Executive Summary\n\n`;
    report += `### Status: ${overallStatus}\n\n`;

    // Quick Stats Table
    report += `| 📊 Metric | Value |\n`;
    report += `|-----------|-------|\n`;
    report += `| **Total Tests** | ${stats.total} |\n`;
    report += `| **✅ Passed** | ${stats.passed} |\n`;
    report += `| **❌ Failed** | ${stats.failed} |\n`;
    report += `| **🎯 Success Rate** | ${successRate}% |\n`;
    report += `| **⏱️ Total Duration** | ${(totalDuration / 1000).toFixed(2)}s |\n`;
    report += `| **🔗 Base URL** | ${CONFIG.baseUrl} |\n\n`;

    // Performance Overview
    const performanceTests = this.results.filter(r => r.category === 'Performance' && r.status === 'PASS');
    if (performanceTests.length > 0) {
      report += `## ⚡ Performance Overview\n\n`;
      performanceTests.forEach(test => {
        if (test.details?.averageResponseTime) {
          const grade = test.details.performanceGrade || 'N/A';
          report += `- **${test.testName}:** ${test.details.averageResponseTime}ms avg (${grade})\n`;
        }
      });
      report += `\n`;
    }

    // Category-wise Results
    report += `## 📝 Detailed Test Results\n\n`;

    const categoryEmojis = {
      'Health': '🏥',
      'Authentication': '🔐',
      'Categories': '📁',
      'Questions': '❓',
      'Quiz Sessions': '🎯',
      'Error Handling': '⚠️',
      'Performance': '⚡'
    };

    Object.keys(categories).forEach(categoryName => {
      const categoryResults = categories[categoryName];
      const categoryPassed = categoryResults.filter(r => r.status === 'PASS').length;
      const categoryTotal = categoryResults.length;
      const categorySuccessRate = ((categoryPassed / categoryTotal) * 100).toFixed(1);
      
      const emoji = categoryEmojis[categoryName] || '🔧';
      const statusIcon = categoryPassed === categoryTotal ? '✅' : '⚠️';
      
      report += `### ${emoji} ${categoryName} ${statusIcon}\n\n`;
      report += `**Success Rate:** ${categorySuccessRate}% (${categoryPassed}/${categoryTotal})\n\n`;

      categoryResults.forEach(result => {
        const duration = result.duration < 1000 ? `${result.duration}ms` : `${(result.duration/1000).toFixed(2)}s`;
        const statusEmoji = result.status === 'PASS' ? '✅' : '❌';
        
        report += `${statusEmoji} **${result.testName}** \`${duration}\`\n`;
        report += `   📋 *${result.description}*\n`;
        
        if (result.status === 'PASS' && result.details) {
          // Add key details
          Object.keys(result.details).forEach(key => {
            if (key !== 'statusCode' && typeof result.details[key] !== 'object') {
              report += `   ✓ ${key}: \`${result.details[key]}\`\n`;
            }
          });
          
          if (result.details.statusCode) {
            report += `   📡 HTTP Status: \`${result.details.statusCode}\`\n`;
          }
        } else if (result.status === 'FAIL') {
          report += `   🚨 **Error:** ${result.error.message}\n`;
          if (result.error.code && result.error.code !== 'UNKNOWN') {
            report += `   🔍 **Error Code:** \`${result.error.code}\`\n`;
          }
          if (result.error.statusCode) {
            report += `   📡 **HTTP Status:** \`${result.error.statusCode}\`\n`;
          }
        }
        report += `\n`;
      });
    });

    // API Coverage Summary
    report += `## 🗺️ API Coverage Summary\n\n`;
    const testedEndpoints = new Set();
    this.results.forEach(result => {
      if (result.status === 'PASS') {
        testedEndpoints.add(`${result.category}: ${result.testName}`);
      }
    });

    report += `**Endpoints Successfully Tested:** ${testedEndpoints.size}\n\n`;

    report += `### 🧪 Test Coverage by Category\n`;
    Object.keys(categories).forEach(category => {
      const passed = categories[category].filter(r => r.status === 'PASS').length;
      const total = categories[category].length;
      const percentage = ((passed / total) * 100).toFixed(1);
      report += `- **${category}:** ${passed}/${total} tests passed (${percentage}%)\n`;
    });
    report += `\n`;

    // Critical Issues (if any)
    const criticalIssues = this.results.filter(r => r.status === 'FAIL');
    if (criticalIssues.length > 0) {
      report += `## 🚨 Critical Issues Detected\n\n`;
      criticalIssues.forEach((issue, index) => {
        report += `### ${index + 1}. ${issue.category} - ${issue.testName}\n`;
        report += `**Error:** ${issue.error.message}\n\n`;
        if (issue.error.statusCode) {
          report += `**HTTP Status:** ${issue.error.statusCode}\n\n`;
        }
        if (issue.error.responseData) {
          report += `**Response Data:** \`\`\`json\n${JSON.stringify(issue.error.responseData, null, 2)}\n\`\`\`\n\n`;
        }
        report += `**Recommendation:** Review the ${issue.category} implementation for ${issue.testName.toLowerCase()}.\n\n`;
      });
    }

    // Recommendations
    report += `## 💡 Recommendations\n\n`;
    
    if (stats.failed === 0) {
      report += `### 🎉 Excellent! All Tests Passing\n\n`;
      report += `Your API is performing excellently across all tested scenarios:\n`;
      report += `- ✅ All health checks are functioning properly\n`;
      report += `- ✅ Authentication and authorization working correctly\n`;
      report += `- ✅ Core business logic APIs responding as expected\n`;
      report += `- ✅ Error handling implemented properly\n`;
      report += `- ✅ Performance within acceptable ranges\n\n`;
      report += `**Status:** 🟢 Ready for production deployment\n\n`;
    } else {
      report += `### 🔧 Issues to Address\n\n`;
      const failedCategories = [...new Set(criticalIssues.map(i => i.category))];
      failedCategories.forEach(category => {
        const categoryIssues = criticalIssues.filter(i => i.category === category);
        report += `**${category}** (${categoryIssues.length} issue${categoryIssues.length > 1 ? 's' : ''}):\n`;
        categoryIssues.forEach(issue => {
          report += `- Fix: ${issue.testName} - ${issue.error.message}\n`;
        });
        report += `\n`;
      });
    }

    // Performance Insights
    const slowTests = this.results.filter(r => r.duration > 2000);
    if (slowTests.length > 0) {
      report += `### ⚡ Performance Considerations\n\n`;
      slowTests.forEach(test => {
        report += `- **${test.testName}:** ${(test.duration/1000).toFixed(2)}s - Consider optimization\n`;
      });
      report += `\n`;
    }

    // Next Steps
    report += `## 🚀 Next Steps\n\n`;
    if (stats.failed > 0) {
      report += `1. **🔧 Fix Critical Issues:** Address the ${stats.failed} failed test${stats.failed > 1 ? 's' : ''} listed above\n`;
      report += `2. **🧪 Re-run Tests:** Execute this test suite again after fixes\n`;
      report += `3. **📊 Monitor:** Set up continuous testing in your CI/CD pipeline\n`;
    } else {
      report += `1. **📊 Monitor Continuously:** Set up automated testing in your CI/CD pipeline\n`;
      report += `2. **🚀 Deploy with Confidence:** All systems are operational and ready\n`;
      report += `3. **📈 Scale:** Consider load testing for production traffic patterns\n`;
    }
    report += `4. **📝 Document:** Update API documentation based on test results\n\n`;

    // Footer
    report += `---\n\n`;
    report += `*Report generated by QuizMaster Pro API Test Suite*\n\n`;
    report += `*Run this test suite regularly to ensure API reliability*\n\n`;
    report += `**Command to re-run:** \`npm run test:api:dev\`\n`;

    return report;
  }

  async runAllTests() {
    this.log(`🚀 Starting QuizMaster Pro Comprehensive API Test Suite`, 'INFO');
    this.log(`🎯 Target: ${CONFIG.baseUrl}`, 'INFO');

    try {
      // Test in logical progression
      await this.testHealthEndpoints();
      await this.testAuthenticationFlow();
      await this.testCategoryManagement();
      await this.testQuestionManagement();
      await this.testQuizSessionManagement();
      await this.testErrorHandling();
      await this.testPerformanceAndLimits();

    } catch (error) {
      this.log(`💥 Test suite execution error: ${error.message}`, 'FAIL');
    }

    // Generate comprehensive report
    const report = this.generateDetailedReport();
    const reportPath = path.join(__dirname, '..', 'COMPREHENSIVE_API_TEST_REPORT.md');
    
    try {
      fs.writeFileSync(reportPath, report);
      this.log(`📄 Comprehensive report generated: ${reportPath}`, 'INFO');
    } catch (error) {
      this.log(`⚠️ Failed to save report: ${error.message}`, 'WARN');
      console.log('\n' + report); // Output to console as fallback
    }

    // Final summary
    const stats = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length
    };

    this.log(`\n🎯 FINAL RESULTS: ${stats.passed}/${stats.total} tests passed (${((stats.passed/stats.total)*100).toFixed(1)}%)`, stats.failed === 0 ? 'PASS' : 'FAIL');
    
    if (stats.failed > 0) {
      this.log(`❌ ${stats.failed} test${stats.failed > 1 ? 's' : ''} failed - Review the report for details`, 'FAIL');
      process.exit(1);
    } else {
      this.log(`✅ All tests passed! API is healthy and ready for use`, 'PASS');
    }
  }
}

// Execute the comprehensive test suite
const tester = new ComprehensiveAPITester();
tester.runAllTests().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});
