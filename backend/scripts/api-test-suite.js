#!/usr/bin/env node

/**
 * QuizMaster Pro API Test Suite
 * Comprehensive testing script for all API endpoints
 * Generates detailed markdown report
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
  timeout: 10000,
  testUser: {
    email: 'test-user@example.com',
    username: 'testuser',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User'
  },
  adminUser: {
    email: 'admin@quizmasterpro.com',
    username: 'quizadmin',
    password: 'admin123'
  }
};

class APITestSuite {
  constructor() {
    this.results = [];
    this.tokens = {};
    this.currentSession = null;
    this.currentQuestion = null;
    this.startTime = new Date();
    
    // Create axios instance with default config
    this.api = axios.create({
      baseURL: CONFIG.baseUrl,
      timeout: CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add response interceptor for logging
    this.api.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          return Promise.reject(error);
        }
        return Promise.reject(new Error(`Network error: ${error.message}`));
      }
    );
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
  }

  async runTest(testName, description, testFn) {
    const startTime = Date.now();
    this.log(`Running test: ${testName}`, 'TEST');
    
    const result = {
      testName,
      description,
      status: 'PENDING',
      duration: 0,
      error: null,
      details: null,
      timestamp: new Date().toISOString()
    };

    try {
      const details = await testFn();
      result.status = 'PASS';
      result.details = details;
      this.log(`✅ PASS: ${testName}`, 'PASS');
    } catch (error) {
      result.status = 'FAIL';
      result.error = {
        message: error.message,
        code: error.response?.data?.error?.code || 'UNKNOWN',
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
      'Health Check - Ready',
      'Test health/ready endpoint',
      async () => {
        const response = await this.api.get('/health/ready');
        if (!response.data.success || !response.data.data.ready) {
          throw new Error('Health check failed');
        }
        return {
          statusCode: response.status,
          database: response.data.data.services.database,
          redis: response.data.data.services.redis
        };
      }
    );

    await this.runTest(
      'Health Check - Live',
      'Test health/live endpoint',
      async () => {
        const response = await this.api.get('/health/live');
        if (!response.data.success) {
          throw new Error('Liveness check failed');
        }
        return {
          statusCode: response.status,
          uptime: response.data.data.uptime
        };
      }
    );
  }

  async testAuthEndpoints() {
    // Test user registration
    await this.runTest(
      'User Registration',
      'Register a new test user',
      async () => {
        const userData = {
          ...CONFIG.testUser,
          email: `test-${Date.now()}@example.com`,
          username: `testuser${Date.now()}`
        };

        const response = await this.api.post('/api/auth/register', userData);
        
        if (!response.data.success || !response.data.data.tokens.accessToken) {
          throw new Error('Registration failed - no tokens returned');
        }

        this.tokens.test = response.data.data.tokens.accessToken;
        
        return {
          statusCode: response.status,
          userId: response.data.data.user.id,
          hasTokens: !!response.data.data.tokens.accessToken
        };
      }
    );

    // Test user login
    await this.runTest(
      'User Login',
      'Login with existing user credentials',
      async () => {
        const response = await this.api.post('/api/auth/login', {
          email: CONFIG.adminUser.email,
          password: CONFIG.adminUser.password
        });
        
        if (!response.data.success || !response.data.data.tokens.accessToken) {
          throw new Error('Login failed - no tokens returned');
        }

        this.tokens.admin = response.data.data.tokens.accessToken;
        
        return {
          statusCode: response.status,
          userId: response.data.data.user.id,
          userRole: response.data.data.user.role,
          hasTokens: !!response.data.data.tokens.accessToken
        };
      }
    );

    // Test invalid login
    await this.runTest(
      'Invalid Login',
      'Test login with invalid credentials',
      async () => {
        try {
          await this.api.post('/api/auth/login', {
            email: 'invalid@example.com',
            password: 'wrongpassword'
          });
          throw new Error('Login should have failed but succeeded');
        } catch (error) {
          if (error.response?.status === 400 || error.response?.status === 401) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              message: 'Correctly rejected invalid credentials'
            };
          }
          throw error;
        }
      }
    );

    // Test profile retrieval
    if (this.tokens.admin) {
      await this.runTest(
        'Get User Profile',
        'Retrieve authenticated user profile',
        async () => {
          const response = await this.api.get('/api/auth/profile', {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          if (!response.data.success || !response.data.data.id) {
            throw new Error('Failed to retrieve profile');
          }

          return {
            statusCode: response.status,
            userId: response.data.data.id,
            email: response.data.data.email,
            role: response.data.data.role
          };
        }
      );
    }

    // Test unauthorized access
    await this.runTest(
      'Unauthorized Access',
      'Test protected route without authentication',
      async () => {
        try {
          await this.api.get('/api/auth/profile');
          throw new Error('Request should have failed but succeeded');
        } catch (error) {
          if (error.response?.status === 401) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              message: 'Correctly rejected unauthorized request'
            };
          }
          throw error;
        }
      }
    );
  }

  async testCategoryEndpoints() {
    if (!this.tokens.admin) {
      this.log('Skipping category tests - no admin token', 'WARN');
      return;
    }

    const authHeader = { Authorization: `Bearer ${this.tokens.admin}` };

    await this.runTest(
      'Get Categories',
      'Retrieve all categories',
      async () => {
        const response = await this.api.get('/api/categories', { headers: authHeader });
        
        if (!response.data.success || !Array.isArray(response.data.data)) {
          throw new Error('Failed to retrieve categories');
        }

        return {
          statusCode: response.status,
          categoryCount: response.data.data.length,
          hasCategories: response.data.data.length > 0
        };
      }
    );

    await this.runTest(
      'Get Category Tree',
      'Retrieve category hierarchy',
      async () => {
        const response = await this.api.get('/api/categories/tree', { headers: authHeader });
        
        if (!response.data.success) {
          throw new Error('Failed to retrieve category tree');
        }

        return {
          statusCode: response.status,
          hasTree: Array.isArray(response.data.data)
        };
      }
    );
  }

  async testQuestionEndpoints() {
    if (!this.tokens.admin) {
      this.log('Skipping question tests - no admin token', 'WARN');
      return;
    }

    const authHeader = { Authorization: `Bearer ${this.tokens.admin}` };

    await this.runTest(
      'Search Questions',
      'Search for questions with filters',
      async () => {
        const response = await this.api.get('/api/questions/search?page=1&limit=10', { 
          headers: authHeader 
        });
        
        if (!response.data.success) {
          throw new Error('Failed to search questions');
        }

        return {
          statusCode: response.status,
          totalQuestions: response.data.data.total,
          pageQuestions: response.data.data.questions?.length || 0,
          hasQuestions: response.data.data.total > 0
        };
      }
    );

    await this.runTest(
      'Search Questions by Type',
      'Search for multiple choice questions',
      async () => {
        const response = await this.api.get('/api/questions/search?questionTypes=MULTIPLE_CHOICE&limit=5', { 
          headers: authHeader 
        });
        
        if (!response.data.success) {
          throw new Error('Failed to search questions by type');
        }

        return {
          statusCode: response.status,
          foundQuestions: response.data.data.questions?.length || 0,
          allMultipleChoice: response.data.data.questions?.every(q => q.questionType === 'MULTIPLE_CHOICE') || false
        };
      }
    );
  }

  async testQuizEndpoints() {
    if (!this.tokens.admin) {
      this.log('Skipping quiz tests - no admin token', 'WARN');
      return;
    }

    const authHeader = { Authorization: `Bearer ${this.tokens.admin}` };

    // Create quiz session
    await this.runTest(
      'Create Quiz Session',
      'Create a new quiz session',
      async () => {
        const sessionConfig = {
          totalQuestions: 2,
          categoryIds: [1], // Science category
          timePerQuestion: 60,
          difficultyLevels: [1, 2],
          questionTypes: ['MULTIPLE_CHOICE'],
          shuffleQuestions: true
        };

        const response = await this.api.post('/api/quiz/sessions', sessionConfig, { 
          headers: authHeader 
        });
        
        if (!response.data.success || !response.data.data.id) {
          throw new Error('Failed to create quiz session');
        }

        this.currentSession = response.data.data.id;

        return {
          statusCode: response.status,
          sessionId: response.data.data.id,
          totalQuestions: response.data.data.totalQuestions,
          status: response.data.data.status
        };
      }
    );

    // Start quiz session
    if (this.currentSession) {
      await this.runTest(
        'Start Quiz Session',
        'Start the created quiz session',
        async () => {
          const response = await this.api.post(`/api/quiz/sessions/${this.currentSession}/start`, {}, { 
            headers: authHeader 
          });
          
          if (!response.data.success) {
            throw new Error('Failed to start quiz session');
          }

          return {
            statusCode: response.status,
            status: response.data.data.status
          };
        }
      );

      // Get current question
      await this.runTest(
        'Get Current Question',
        'Retrieve the current question',
        async () => {
          const response = await this.api.get(`/api/quiz/sessions/${this.currentSession}/current-question`, { 
            headers: authHeader 
          });
          
          if (!response.data.success || !response.data.data.id) {
            throw new Error('Failed to get current question');
          }

          this.currentQuestion = response.data.data;

          return {
            statusCode: response.status,
            questionId: response.data.data.id,
            questionText: response.data.data.questionText.substring(0, 50) + '...',
            hasOptions: !!response.data.data.options,
            optionCount: response.data.data.options?.options?.length || 0
          };
        }
      );

      // Submit answer
      if (this.currentQuestion) {
        await this.runTest(
          'Submit Quiz Answer',
          'Submit an answer to the current question',
          async () => {
            const answerData = {
              questionId: this.currentQuestion.id,
              userAnswer: this.currentQuestion.options?.options?.[0] || 'Test Answer',
              timeTaken: 15
            };

            const response = await this.api.post(
              `/api/quiz/sessions/${this.currentSession}/submit-answer`, 
              answerData, 
              { headers: authHeader }
            );
            
            if (!response.data.success) {
              throw new Error('Failed to submit answer');
            }

            return {
              statusCode: response.status,
              isCorrect: response.data.data.isCorrect,
              pointsEarned: response.data.data.pointsEarned,
              totalScore: response.data.data.sessionProgress.totalScore,
              progress: response.data.data.sessionProgress.progressPercentage
            };
          }
        );
      }
    }
  }

  async testErrorHandling() {
    // Test 404 endpoint
    await this.runTest(
      'Not Found Endpoint',
      'Test non-existent endpoint returns 404',
      async () => {
        try {
          await this.api.get('/api/nonexistent-endpoint');
          throw new Error('Request should have failed but succeeded');
        } catch (error) {
          if (error.response?.status === 404) {
            return {
              statusCode: error.response.status,
              errorCode: error.response.data.error.code,
              message: 'Correctly returned 404 for non-existent endpoint'
            };
          }
          throw error;
        }
      }
    );

    // Test malformed JSON
    await this.runTest(
      'Malformed Request Body',
      'Test endpoint with invalid JSON',
      async () => {
        try {
          await this.api.post('/api/auth/login', 'invalid-json', {
            headers: { 'Content-Type': 'application/json' }
          });
          throw new Error('Request should have failed but succeeded');
        } catch (error) {
          if (error.response?.status === 400) {
            return {
              statusCode: error.response.status,
              message: 'Correctly rejected malformed JSON'
            };
          }
          throw error;
        }
      }
    );
  }

  async testPerformanceAndLimits() {
    // Test rate limiting (multiple rapid requests)
    await this.runTest(
      'Rate Limiting',
      'Test rate limiting with rapid requests',
      async () => {
        const promises = Array(10).fill().map(() => 
          this.api.post('/api/auth/login', {
            email: 'nonexistent@example.com',
            password: 'wrongpassword'
          }).catch(e => e)
        );

        const results = await Promise.all(promises);
        const rateLimited = results.some(result => 
          result.response?.status === 429
        );

        return {
          totalRequests: results.length,
          rateLimitedRequests: results.filter(r => r.response?.status === 429).length,
          rateLimitingActive: rateLimited
        };
      }
    );
  }

  generateReport() {
    const endTime = new Date();
    const totalDuration = endTime - this.startTime;
    
    const stats = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      duration: totalDuration
    };

    const successRate = stats.total > 0 ? (stats.passed / stats.total * 100).toFixed(2) : 0;

    let report = `# QuizMaster Pro API Test Report\n\n`;
    report += `**Generated:** ${endTime.toISOString()}\n\n`;
    report += `**Base URL:** ${CONFIG.baseUrl}\n\n`;
    report += `**Total Duration:** ${totalDuration}ms\n\n`;

    // Summary table
    report += `## Summary\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Total Tests | ${stats.total} |\n`;
    report += `| Passed | ${stats.passed} |\n`;
    report += `| Failed | ${stats.failed} |\n`;
    report += `| Success Rate | ${successRate}% |\n`;
    report += `| Total Duration | ${totalDuration}ms |\n\n`;

    // Status indicator
    const overallStatus = stats.failed === 0 ? '🟢 ALL TESTS PASSING' : '🔴 SOME TESTS FAILING';
    report += `## Overall Status: ${overallStatus}\n\n`;

    // Group results by category
    const categories = {
      'Health Checks': [],
      'Authentication': [],
      'Categories': [],
      'Questions': [],
      'Quiz Management': [],
      'Error Handling': [],
      'Performance': []
    };

    this.results.forEach(result => {
      if (result.testName.includes('Health')) {
        categories['Health Checks'].push(result);
      } else if (result.testName.includes('User') || result.testName.includes('Login') || result.testName.includes('Profile') || result.testName.includes('Auth')) {
        categories['Authentication'].push(result);
      } else if (result.testName.includes('Categor')) {
        categories['Categories'].push(result);
      } else if (result.testName.includes('Question')) {
        categories['Questions'].push(result);
      } else if (result.testName.includes('Quiz')) {
        categories['Quiz Management'].push(result);
      } else if (result.testName.includes('Error') || result.testName.includes('Not Found') || result.testName.includes('Malformed')) {
        categories['Error Handling'].push(result);
      } else if (result.testName.includes('Rate') || result.testName.includes('Performance')) {
        categories['Performance'].push(result);
      }
    });

    // Detailed results by category
    report += `## Detailed Results\n\n`;

    Object.keys(categories).forEach(category => {
      if (categories[category].length > 0) {
        report += `### ${category}\n\n`;
        
        categories[category].forEach(result => {
          const statusIcon = result.status === 'PASS' ? '✅' : '❌';
          const duration = result.duration < 1000 ? `${result.duration}ms` : `${(result.duration/1000).toFixed(2)}s`;
          
          report += `${statusIcon} **${result.testName}** (${duration})\n`;
          report += `   - ${result.description}\n`;
          
          if (result.status === 'PASS' && result.details) {
            report += `   - Status: ${result.details.statusCode || 'N/A'}\n`;
            Object.keys(result.details).forEach(key => {
              if (key !== 'statusCode') {
                report += `   - ${key}: ${JSON.stringify(result.details[key])}\n`;
              }
            });
          } else if (result.status === 'FAIL') {
            report += `   - **Error:** ${result.error.message}\n`;
            if (result.error.code) {
              report += `   - **Error Code:** ${result.error.code}\n`;
            }
            if (result.error.statusCode) {
              report += `   - **HTTP Status:** ${result.error.statusCode}\n`;
            }
          }
          report += `\n`;
        });
      }
    });

    // API Coverage
    report += `## API Coverage\n\n`;
    const testedEndpoints = new Set();
    this.results.forEach(result => {
      if (result.details?.statusCode) {
        testedEndpoints.add(result.testName);
      }
    });

    report += `### Tested Endpoints\n`;
    report += `- Health endpoints: /health/ready, /health/live\n`;
    report += `- Auth endpoints: /api/auth/register, /api/auth/login, /api/auth/profile\n`;
    report += `- Category endpoints: /api/categories, /api/categories/tree\n`;
    report += `- Question endpoints: /api/questions/search\n`;
    report += `- Quiz endpoints: /api/quiz/sessions, /api/quiz/sessions/:id/start, /api/quiz/sessions/:id/current-question, /api/quiz/sessions/:id/submit-answer\n\n`;

    // Recommendations
    report += `## Recommendations\n\n`;
    
    if (stats.failed > 0) {
      report += `### 🔴 Critical Issues\n`;
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        report += `- **${result.testName}:** ${result.error.message}\n`;
      });
      report += `\n`;
    }

    if (stats.passed === stats.total) {
      report += `### 🟢 All Systems Operational\n`;
      report += `All API endpoints are functioning correctly. The system is ready for production use.\n\n`;
    }

    // Performance insights
    const slowTests = this.results.filter(r => r.duration > 2000);
    if (slowTests.length > 0) {
      report += `### ⚡ Performance Considerations\n`;
      slowTests.forEach(test => {
        report += `- **${test.testName}:** ${(test.duration/1000).toFixed(2)}s (consider optimization)\n`;
      });
      report += `\n`;
    }

    return report;
  }

  async runAllTests() {
    this.log('Starting QuizMaster Pro API Test Suite', 'START');
    this.log(`Testing against: ${CONFIG.baseUrl}`, 'INFO');

    try {
      // Test in logical order
      await this.testHealthEndpoints();
      await this.testAuthEndpoints();
      await this.testCategoryEndpoints();
      await this.testQuestionEndpoints();
      await this.testQuizEndpoints();
      await this.testErrorHandling();
      await this.testPerformanceAndLimits();

    } catch (error) {
      this.log(`Test suite failed with error: ${error.message}`, 'ERROR');
    }

    // Generate and save report
    const report = this.generateReport();
    const reportPath = path.join(__dirname, '..', 'API_TEST_REPORT.md');
    
    try {
      fs.writeFileSync(reportPath, report);
      this.log(`Report generated: ${reportPath}`, 'SUCCESS');
    } catch (error) {
      this.log(`Failed to save report: ${error.message}`, 'ERROR');
      console.log('\n' + report); // Print to console if file save fails
    }

    // Summary
    const stats = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length
    };

    this.log(`Test suite completed: ${stats.passed}/${stats.total} passed`, 'COMPLETE');
    
    if (stats.failed > 0) {
      process.exit(1); // Exit with error code if any tests failed
    }
  }
}

// Run the test suite
const testSuite = new APITestSuite();
testSuite.runAllTests().catch(error => {
  console.error('Test suite execution failed:', error);
  process.exit(1);
});
