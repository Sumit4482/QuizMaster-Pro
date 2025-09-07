#!/usr/bin/env node

/**
 * QuizMaster Pro COMPLETE API Test Suite
 * Tests ALL 55 endpoints - 100% coverage
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
  timeout: 15000,
  testUser: {
    email: `test-complete-${Date.now()}@example.com`,
    username: `testcomplete${Date.now()}`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'Complete'
  },
  existingAdmin: {
    email: 'admin@quizmaster.pro',
    username: 'admin',
    password: 'Admin123!'
  }
};

class CompleteAPITester {
  constructor() {
    this.results = [];
    this.tokens = {};
    this.createdResources = {
      sessions: [],
      users: [],
      categories: [],
      questions: []
    };
    this.startTime = new Date();
    
    this.api = axios.create({
      baseURL: CONFIG.baseUrl,
      timeout: CONFIG.timeout,
      headers: { 'Content-Type': 'application/json' }
    });
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

  // HEALTH ENDPOINTS (6 total)
  async testAllHealthEndpoints() {
    await this.runTest(
      'Health',
      'Basic Health Check',
      'GET /health/ - Basic health endpoint',
      async () => {
        const response = await this.api.get('/health/');
        return {
          statusCode: response.status,
          uptime: response.data.data.uptime,
          version: response.data.data.version
        };
      }
    );

    await this.runTest(
      'Health',
      'Readiness Probe',
      'GET /health/ready - Kubernetes readiness probe',
      async () => {
        const response = await this.api.get('/health/ready');
        return {
          statusCode: response.status,
          ready: response.data.data.ready,
          database: response.data.data.services.database,
          redis: response.data.data.services.redis
        };
      }
    );

    await this.runTest(
      'Health',
      'Liveness Probe', 
      'GET /health/live - Kubernetes liveness probe',
      async () => {
        const response = await this.api.get('/health/live');
        return {
          statusCode: response.status,
          alive: response.data.data.alive
        };
      }
    );

    await this.runTest(
      'Health',
      'Detailed Health Check',
      'GET /health/detailed - Detailed system health',
      async () => {
        const response = await this.api.get('/health/detailed');
        return {
          statusCode: response.status,
          healthy: response.data.data.status === 'healthy',
          hasMemoryStats: !!response.data.data.memory
        };
      }
    );

    await this.runTest(
      'Health',
      'Test Log Endpoint',
      'GET /health/test-log - Test logging functionality',
      async () => {
        const response = await this.api.get('/health/test-log');
        return {
          statusCode: response.status,
          hasMessage: !!response.data.message
        };
      }
    );

    await this.runTest(
      'Health',
      'Room Debug Endpoint',
      'GET /health/room/:code - Debug room state',
      async () => {
        try {
          await this.api.get('/health/room/TESTROOM');
          return { statusCode: 200, foundRoom: true };
        } catch (error) {
          if (error.response?.status === 404) {
            return { 
              statusCode: 404, 
              foundRoom: false,
              correctlyHandledMissingRoom: true
            };
          }
          throw error;
        }
      },
      [404, 200]
    );
  }

  // AUTHENTICATION ENDPOINTS (13 total)
  async testAllAuthEndpoints() {
    // Test user registration
    await this.runTest(
      'Authentication',
      'User Registration',
      'POST /api/auth/register - Register new user',
      async () => {
        const response = await this.api.post('/api/auth/register', CONFIG.testUser);
        this.tokens.testUser = response.data.data.tokens.accessToken;
        this.createdResources.users.push(response.data.data.user.id);
        
        return {
          statusCode: response.status,
          userId: response.data.data.user.id,
          hasTokens: !!response.data.data.tokens.accessToken
        };
      },
      [201]
    );

    // Test admin login
    await this.runTest(
      'Authentication',
      'Admin Login',
      'POST /api/auth/login - Login with admin credentials',
      async () => {
        const response = await this.api.post('/api/auth/login', {
          email: CONFIG.existingAdmin.email,
          password: CONFIG.existingAdmin.password
        });
        this.tokens.admin = response.data.data.tokens.accessToken;
        this.tokens.refreshToken = response.data.data.tokens.refreshToken;
        
        return {
          statusCode: response.status,
          userId: response.data.data.user.id,
          role: response.data.data.user.role,
          hasTokens: !!response.data.data.tokens.accessToken
        };
      }
    );

    // Test token refresh
    if (this.tokens.refreshToken) {
      await this.runTest(
        'Authentication',
        'Token Refresh',
        'POST /api/auth/refresh - Refresh access token',
        async () => {
          const response = await this.api.post('/api/auth/refresh', {
            refreshToken: this.tokens.refreshToken
          });
          
          return {
            statusCode: response.status,
            hasNewTokens: !!response.data.data.accessToken
          };
        }
      );
    }

    // Test email availability check
    await this.runTest(
      'Authentication',
      'Email Availability Check',
      'GET /api/auth/check-email - Check if email is available',
      async () => {
        const response = await this.api.get('/api/auth/check-email?email=newuser@example.com');
        return {
          statusCode: response.status,
          available: response.data.data.available
        };
      }
    );

    // Test forgot password (will not actually send email in test)
    await this.runTest(
      'Authentication',
      'Forgot Password',
      'POST /api/auth/forgot-password - Request password reset',
      async () => {
        const response = await this.api.post('/api/auth/forgot-password', {
          email: CONFIG.existingAdmin.email
        });
        return {
          statusCode: response.status,
          message: response.data.message
        };
      }
    );

    // Test user profile retrieval
    if (this.tokens.admin) {
      await this.runTest(
        'Authentication',
        'Get User Profile',
        'GET /api/auth/profile - Get authenticated user profile',
        async () => {
          const response = await this.api.get('/api/auth/profile', {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          return {
            statusCode: response.status,
            userId: response.data.data.id,
            role: response.data.data.role
          };
        }
      );

      // Test profile update
      await this.runTest(
        'Authentication',
        'Update User Profile',
        'PUT /api/auth/profile - Update user profile',
        async () => {
          const updateData = {
            firstName: 'Updated',
            lastName: 'Admin'
          };
          
          const response = await this.api.put('/api/auth/profile', updateData, {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          return {
            statusCode: response.status,
            updatedFirstName: response.data.data.firstName === 'Updated'
          };
        }
      );

      // Test change password (this invalidates the token)
      await this.runTest(
        'Authentication',
        'Change Password',
        'PUT /api/auth/change-password - Change user password',
        async () => {
          const newPassword = 'NewPassword123!';
          const response = await this.api.put('/api/auth/change-password', {
            currentPassword: CONFIG.existingAdmin.password,
            newPassword: newPassword,
            confirmPassword: newPassword
          }, {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          // Password change invalidates current token, need to login with new password
          const loginResponse = await this.api.post('/api/auth/login', {
            email: CONFIG.existingAdmin.email,
            password: newPassword
          });
          this.tokens.admin = loginResponse.data.data.tokens.accessToken;
          
          // Change password back to original
          await this.api.put('/api/auth/change-password', {
            currentPassword: newPassword,
            newPassword: CONFIG.existingAdmin.password,
            confirmPassword: CONFIG.existingAdmin.password
          }, {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          // Login again with original password for remaining tests
          const finalLoginResponse = await this.api.post('/api/auth/login', {
            email: CONFIG.existingAdmin.email,
            password: CONFIG.existingAdmin.password
          });
          this.tokens.admin = finalLoginResponse.data.data.tokens.accessToken;
          
          return {
            statusCode: response.status,
            passwordChanged: true
          };
        }
      );

      // Test get sessions
      await this.runTest(
        'Authentication',
        'Get Active Sessions',
        'GET /api/auth/sessions - Get user active sessions',
        async () => {
          const response = await this.api.get('/api/auth/sessions', {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          return {
            statusCode: response.status,
            hasActiveSessions: Array.isArray(response.data.data)
          };
        }
      );

      // Test logout
      await this.runTest(
        'Authentication',
        'User Logout',
        'POST /api/auth/logout - Logout current session',
        async () => {
          const response = await this.api.post('/api/auth/logout', {
            refreshToken: this.tokens.refreshToken
          }, {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          return {
            statusCode: response.status,
            loggedOut: true
          };
        }
      );

      // Get new token for remaining tests
      const loginResponse = await this.api.post('/api/auth/login', {
        email: CONFIG.existingAdmin.email,
        password: CONFIG.existingAdmin.password
      });
      this.tokens.admin = loginResponse.data.data.tokens.accessToken;

      // Test reset password (with invalid token - should fail gracefully)
      await this.runTest(
        'Authentication',
        'Reset Password',
        'POST /api/auth/reset-password - Reset password with token',
        async () => {
          try {
            const response = await this.api.post('/api/auth/reset-password', {
              token: 'invalid-reset-token-for-testing',
              password: 'NewTestPassword123!',
              confirmPassword: 'NewTestPassword123!'
            });
            return {
              statusCode: response.status,
              reset: true
            };
          } catch (error) {
            if (error.response?.status === 400 || error.response?.status === 401 || error.response?.status === 404) {
              return {
                statusCode: error.response.status,
                correctlyRejectedInvalidToken: true
              };
            }
            throw error;
          }
        },
        [200, 400, 401, 404]
      );

      // Test logout all sessions
      await this.runTest(
        'Authentication',
        'Logout All Sessions',
        'POST /api/auth/logout-all - Logout from all active sessions',
        async () => {
          const response = await this.api.post('/api/auth/logout-all', {}, {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          return {
            statusCode: response.status,
            loggedOutAll: true
          };
        }
      );

      // Get new token again for session deletion test
      const newLoginResponse = await this.api.post('/api/auth/login', {
        email: CONFIG.existingAdmin.email,
        password: CONFIG.existingAdmin.password
      });
      this.tokens.admin = newLoginResponse.data.data.tokens.accessToken;

      // Test delete specific session
      await this.runTest(
        'Authentication',
        'Delete Specific Session',
        'DELETE /api/auth/sessions/:sessionId - Delete specific user session',
        async () => {
          // Get active sessions first
          const sessionsResponse = await this.api.get('/api/auth/sessions', {
            headers: { Authorization: `Bearer ${this.tokens.admin}` }
          });
          
          if (sessionsResponse.data.data && sessionsResponse.data.data.length > 0) {
            const sessionId = sessionsResponse.data.data[0].id;
            const response = await this.api.delete(`/api/auth/sessions/${sessionId}`, {
              headers: { Authorization: `Bearer ${this.tokens.admin}` }
            });
            return {
              statusCode: response.status,
              sessionDeleted: true
            };
          } else {
            return {
              statusCode: 200,
              noActiveSessionsFound: true
            };
          }
        }
      );
    }
  }

  // CATEGORY ENDPOINTS (11 total) 
  async testAllCategoryEndpoints() {
    // Get fresh token after auth tests (logout operations invalidate tokens)
    const loginResponse = await this.api.post('/api/auth/login', {
      email: CONFIG.existingAdmin.email,
      password: CONFIG.existingAdmin.password
    });
    this.tokens.admin = loginResponse.data.data.tokens.accessToken;
    
    const authHeaders = { Authorization: `Bearer ${this.tokens.admin}` };

    // Basic category endpoints
    await this.runTest(
      'Categories',
      'Get All Categories',
      'GET /api/categories/ - Retrieve all categories',
      async () => {
        const response = await this.api.get('/api/categories', { headers: authHeaders });
        return {
          statusCode: response.status,
          categoryCount: response.data.data.length
        };
      }
    );

    await this.runTest(
      'Categories',
      'Get Category Tree',
      'GET /api/categories/tree - Get hierarchical structure',
      async () => {
        const response = await this.api.get('/api/categories/tree', { headers: authHeaders });
        return {
          statusCode: response.status,
          hasTree: Array.isArray(response.data.data)
        };
      }
    );

    await this.runTest(
      'Categories',
      'Get Root Categories',
      'GET /api/categories/root - Get root categories',
      async () => {
        const response = await this.api.get('/api/categories/root', { headers: authHeaders });
        return {
          statusCode: response.status,
          rootCount: response.data.data.length
        };
      }
    );

    // Search categories  
    await this.runTest(
      'Categories',
      'Search Categories',
      'GET /api/categories/search - Search categories',
      async () => {
        const response = await this.api.get('/api/categories/search?search=science', { headers: authHeaders });
        return {
          statusCode: response.status,
          foundResults: response.data.data?.length > 0
        };
      }
    );

    // Category statistics
    await this.runTest(
      'Categories',
      'Category Statistics',
      'GET /api/categories/statistics - Get category statistics',
      async () => {
        const response = await this.api.get('/api/categories/statistics', { headers: authHeaders });
        return {
          statusCode: response.status,
          hasStats: !!response.data.data
        };
      }
    );

    // Get category by ID (test with ID 1)
    await this.runTest(
      'Categories',
      'Get Category by ID',
      'GET /api/categories/:id - Get specific category',
      async () => {
        const response = await this.api.get('/api/categories/1', { headers: authHeaders });
        return {
          statusCode: response.status,
          categoryId: response.data.data.id,
          hasName: !!response.data.data.name
        };
      }
    );

    // Create new category
    let newCategoryId = null;
    await this.runTest(
      'Categories',
      'Create Category',
      'POST /api/categories/ - Create new category',
      async () => {
        const categoryData = {
          name: `Test Category ${Date.now()}`,
          description: 'Test category for API testing',
          color: '#FF5733'
        };
        
        const response = await this.api.post('/api/categories', categoryData, { headers: authHeaders });
        newCategoryId = response.data.data.id;
        this.createdResources.categories.push(newCategoryId);
        
        return {
          statusCode: response.status,
          categoryId: response.data.data.id,
          name: response.data.data.name
        };
      },
      [201]
    );

    // Update category
    if (newCategoryId) {
      await this.runTest(
        'Categories',
        'Update Category',
        'PUT /api/categories/:id - Update category',
        async () => {
          const updateData = {
            name: 'Updated Test Category',
            description: 'Updated description'
          };
          
          const response = await this.api.put(`/api/categories/${newCategoryId}`, updateData, { headers: authHeaders });
          return {
            statusCode: response.status,
            updated: response.data.data.name === 'Updated Test Category'
          };
        }
      );

      // Delete category
      await this.runTest(
        'Categories',
        'Delete Category',
        'DELETE /api/categories/:id - Delete category',
        async () => {
          const response = await this.api.delete(`/api/categories/${newCategoryId}`, { headers: authHeaders });
          return {
            statusCode: response.status,
            deleted: true
          };
        }
      );

      // Test get category by slug
      await this.runTest(
        'Categories',
        'Get Category by Slug',
        'GET /api/categories/slug/:slug - Get category by slug',
        async () => {
          // Use a common slug that should exist
          try {
            const response = await this.api.get('/api/categories/slug/science', { headers: authHeaders });
            return {
              statusCode: response.status,
              categoryFound: !!response.data.data
            };
          } catch (error) {
            if (error.response?.status === 404) {
              return {
                statusCode: 404,
                slugNotFound: true
              };
            }
            throw error;
          }
        },
        [200, 404]
      );

      // Test category reorder
      await this.runTest(
        'Categories',
        'Reorder Categories',
        'POST /api/categories/reorder - Reorder category positions',
        async () => {
          // Get some categories first to reorder
          const categoriesResponse = await this.api.get('/api/categories', { headers: authHeaders });
          const categories = categoriesResponse.data.data;
          
          if (categories && categories.length >= 2) {
            const reorderData = {
              categoryOrders: [
                { id: categories[0].id, sortOrder: 2 },
                { id: categories[1].id, sortOrder: 1 }
              ]
            };
            
            const response = await this.api.post('/api/categories/reorder', reorderData, { headers: authHeaders });
            return {
              statusCode: response.status,
              reordered: true
            };
          } else {
            return {
              statusCode: 200,
              notEnoughCategoriesToReorder: true
            };
          }
        }
      );
    }
  }

  // QUESTION ENDPOINTS (11 total)
  async testAllQuestionEndpoints() {
    // Get fresh token after auth tests (logout operations invalidate tokens)
    const loginResponse = await this.api.post('/api/auth/login', {
      email: CONFIG.existingAdmin.email,
      password: CONFIG.existingAdmin.password
    });
    this.tokens.admin = loginResponse.data.data.tokens.accessToken;
    
    const authHeaders = { Authorization: `Bearer ${this.tokens.admin}` };

    // Search questions
    await this.runTest(
      'Questions',
      'Search All Questions',
      'GET /api/questions/search - Search questions with filters',
      async () => {
        const response = await this.api.get('/api/questions/search', { headers: authHeaders });
        return {
          statusCode: response.status,
          totalQuestions: response.data.data.total,
          returnedQuestions: response.data.data.questions?.length || 0
        };
      }
    );

    // Question statistics
    await this.runTest(
      'Questions',
      'Question Statistics',
      'GET /api/questions/statistics - Get question statistics',
      async () => {
        const response = await this.api.get('/api/questions/statistics', { headers: authHeaders });
        return {
          statusCode: response.status,
          hasStats: !!response.data.data
        };
      }
    );

    // Get question by ID (use first available question)
    let questionId = null;
    await this.runTest(
      'Questions',
      'Get Question by ID',
      'GET /api/questions/:id - Get specific question',
      async () => {
        // First get a question ID from search
        const searchResponse = await this.api.get('/api/questions/search?limit=1', { headers: authHeaders });
        if (searchResponse.data.data.questions && searchResponse.data.data.questions.length > 0) {
          questionId = searchResponse.data.data.questions[0].id;
          
          const response = await this.api.get(`/api/questions/${questionId}`, { headers: authHeaders });
          return {
            statusCode: response.status,
            questionId: response.data.data.id,
            hasQuestionText: !!response.data.data.questionText
          };
        } else {
          throw new Error('No questions available for testing');
        }
      }
    );

    // Create question
    let createdQuestionId = null;
    await this.runTest(
      'Questions',
      'Create Question',
      'POST /api/questions/ - Create new question',
      async () => {
        const questionData = {
          questionText: `Test Question ${Date.now()}`,
          questionType: 'MULTIPLE_CHOICE',
          options: {
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            shuffle: true
          },
          correctAnswer: {
            type: 'single',
            indices: [0]  // Index 0 = "Option A"
          },
          difficultyLevel: 2,
          points: 10,
          categoryIds: [1]
        };
        
        const response = await this.api.post('/api/questions', questionData, { headers: authHeaders });
        createdQuestionId = response.data.data.id;
        this.createdResources.questions.push(createdQuestionId);
        
        return {
          statusCode: response.status,
          questionId: response.data.data.id,
          questionType: response.data.data.questionType
        };
      },
      [201]
    );

    // Update question
    if (createdQuestionId) {
      await this.runTest(
        'Questions',
        'Update Question',
        'PUT /api/questions/:id - Update question',
        async () => {
          const updateData = {
            questionText: 'Updated Test Question',
            difficultyLevel: 3
          };
          
          const response = await this.api.put(`/api/questions/${createdQuestionId}`, updateData, { headers: authHeaders });
          return {
            statusCode: response.status,
            updated: response.data.data.questionText === 'Updated Test Question'
          };
        }
      );

      // Publish question
      await this.runTest(
        'Questions',
        'Publish Question',
        'POST /api/questions/:id/publish - Publish question',
        async () => {
          const response = await this.api.post(`/api/questions/${createdQuestionId}/publish`, {}, { headers: authHeaders });
          return {
            statusCode: response.status,
            published: response.data.data.isPublished
          };
        }
      );

      // Unpublish question
      await this.runTest(
        'Questions',
        'Unpublish Question',
        'POST /api/questions/:id/unpublish - Unpublish question',
        async () => {
          const response = await this.api.post(`/api/questions/${createdQuestionId}/unpublish`, {}, { headers: authHeaders });
          return {
            statusCode: response.status,
            unpublished: !response.data.data.isPublished
          };
        }
      );

      // Delete question
      await this.runTest(
        'Questions',
        'Delete Question',
        'DELETE /api/questions/:id - Delete question',
        async () => {
          const response = await this.api.delete(`/api/questions/${createdQuestionId}`, { headers: authHeaders });
          return {
            statusCode: response.status,
            deleted: true
          };
        }
      );
    }

    // Test bulk operations
    await this.runTest(
      'Questions',
      'Bulk Question Operations',
      'POST /api/questions/bulk - Perform bulk operations',
      async () => {
        // This might fail if no questions available - that's OK
        try {
          const bulkData = {
            questionIds: [],
            operation: 'publish',
            data: {}
          };
          
          const response = await this.api.post('/api/questions/bulk', bulkData, { headers: authHeaders });
          return {
            statusCode: response.status,
            bulkProcessed: true
          };
        } catch (error) {
          if (error.response?.status === 400) {
            return {
              statusCode: 400,
              correctlyRejectedEmptyBulk: true
            };
          }
          throw error;
        }
      },
      [200, 400]
    );

    // Test import (will likely fail without proper data structure)
    await this.runTest(
      'Questions',
      'Import Questions',
      'POST /api/questions/import - Import questions',
      async () => {
        const importData = {
          questions: [],
          categories: []
        };
        
        try {
          const response = await this.api.post('/api/questions/import', importData, { headers: authHeaders });
          return {
            statusCode: response.status,
            imported: true
          };
        } catch (error) {
          if (error.response?.status === 400) {
            return {
              statusCode: 400,
              correctlyRejectedEmptyImport: true
            };
          }
          throw error;
        }
      },
      [200, 400]
    );

    // Test export
    await this.runTest(
      'Questions',
      'Export Questions',
      'GET /api/questions/export - Export questions',
      async () => {
        const response = await this.api.get('/api/questions/export', { headers: authHeaders });
        return {
          statusCode: response.status,
          hasExportData: !!response.data.questions
        };
      }
    );
  }

  // QUIZ ENDPOINTS (14 total)
  async testAllQuizEndpoints() {
    // Get fresh token after auth tests (logout operations invalidate tokens)
    const loginResponse = await this.api.post('/api/auth/login', {
      email: CONFIG.existingAdmin.email,
      password: CONFIG.existingAdmin.password
    });
    this.tokens.admin = loginResponse.data.data.tokens.accessToken;
    
    const authHeaders = { Authorization: `Bearer ${this.tokens.admin}` };

    // Quiz health check
    await this.runTest(
      'Quiz',
      'Quiz System Health',
      'GET /api/quiz/health - Quiz system health check',
      async () => {
        const response = await this.api.get('/api/quiz/health');
        return {
          statusCode: response.status,
          healthy: true
        };
      }
    );

    // Create quiz session
    let sessionId = null;
    await this.runTest(
      'Quiz',
      'Create Quiz Session',
      'POST /api/quiz/sessions - Create new quiz session',
      async () => {
        const sessionConfig = {
          totalQuestions: 2,
          categoryIds: [1],
          timePerQuestion: 60,
          difficultyLevels: [1, 2],
          questionTypes: ['MULTIPLE_CHOICE'],
          shuffleQuestions: true
        };

        const response = await this.api.post('/api/quiz/sessions', sessionConfig, { headers: authHeaders });
        sessionId = response.data.data.id;
        this.createdResources.sessions.push(sessionId);

        return {
          statusCode: response.status,
          sessionId: response.data.data.id,
          status: response.data.data.status
        };
      },
      [201]
    );

    // Get user sessions
    await this.runTest(
      'Quiz',
      'Get User Sessions',
      'GET /api/quiz/sessions - Get user quiz sessions',
      async () => {
        const response = await this.api.get('/api/quiz/sessions', { headers: authHeaders });
        return {
          statusCode: response.status,
          hasSessions: Array.isArray(response.data.data)
        };
      }
    );

    if (sessionId) {
      // Get session details
      await this.runTest(
        'Quiz',
        'Get Session Details',
        'GET /api/quiz/sessions/:sessionId - Get session details',
        async () => {
          const response = await this.api.get(`/api/quiz/sessions/${sessionId}`, { headers: authHeaders });
          return {
            statusCode: response.status,
            sessionId: response.data.data.id,
            status: response.data.data.status
          };
        }
      );

      // Start session
      await this.runTest(
        'Quiz',
        'Start Quiz Session',
        'POST /api/quiz/sessions/:sessionId/start - Start quiz session',
        async () => {
          const response = await this.api.post(`/api/quiz/sessions/${sessionId}/start`, {}, { headers: authHeaders });
          return {
            statusCode: response.status,
            status: response.data.data.status
          };
        }
      );

      // Pause session
      await this.runTest(
        'Quiz',
        'Pause Quiz Session',
        'POST /api/quiz/sessions/:sessionId/pause - Pause quiz session',
        async () => {
          const response = await this.api.post(`/api/quiz/sessions/${sessionId}/pause`, {}, { headers: authHeaders });
          return {
            statusCode: response.status,
            paused: true
          };
        }
      );

      // Resume session
      await this.runTest(
        'Quiz',
        'Resume Quiz Session',
        'POST /api/quiz/sessions/:sessionId/resume - Resume quiz session',
        async () => {
          const response = await this.api.post(`/api/quiz/sessions/${sessionId}/resume`, {}, { headers: authHeaders });
          return {
            statusCode: response.status,
            resumed: true
          };
        }
      );

      // Get current question
      await this.runTest(
        'Quiz',
        'Get Current Question',
        'GET /api/quiz/sessions/:sessionId/current-question - Get current question',
        async () => {
          const response = await this.api.get(`/api/quiz/sessions/${sessionId}/current-question`, { headers: authHeaders });
          return {
            statusCode: response.status,
            questionId: response.data.data.id,
            hasOptions: !!response.data.data.options
          };
        }
      );

      // Submit answer
      await this.runTest(
        'Quiz',
        'Submit Quiz Answer',
        'POST /api/quiz/sessions/:sessionId/submit-answer - Submit answer',
        async () => {
          const questionResponse = await this.api.get(`/api/quiz/sessions/${sessionId}/current-question`, { headers: authHeaders });
          const question = questionResponse.data.data;
          
          const answerData = {
            questionId: question.id,
            userAnswer: question.options?.options?.[0] || 'Test Answer',
            timeTaken: 15
          };

          const response = await this.api.post(`/api/quiz/sessions/${sessionId}/submit-answer`, answerData, { headers: authHeaders });
          return {
            statusCode: response.status,
            isCorrect: response.data.data.isCorrect,
            pointsEarned: response.data.data.pointsEarned
          };
        }
      );

      // Generate results first
      await this.runTest(
        'Quiz',
        'Generate Session Results',
        'POST /api/quiz/sessions/:sessionId/generate-results - Generate results',
        async () => {
          const response = await this.api.post(`/api/quiz/sessions/${sessionId}/generate-results`, {}, { headers: authHeaders });
          return {
            statusCode: response.status,
            generated: true
          };
        }
      );

      // Then get session results
      await this.runTest(
        'Quiz',
        'Get Session Results',
        'GET /api/quiz/sessions/:sessionId/results - Get quiz results',
        async () => {
          const response = await this.api.get(`/api/quiz/sessions/${sessionId}/results`, { headers: authHeaders });
          return {
            statusCode: response.status,
            hasResults: !!response.data.data
          };
        }
      );
    }

    // Get quiz history
    await this.runTest(
      'Quiz',
      'Get Quiz History',
      'GET /api/quiz/history - Get user quiz history',
      async () => {
        const response = await this.api.get('/api/quiz/history', { headers: authHeaders });
        return {
          statusCode: response.status,
          hasHistory: !!response.data.data
        };
      }
    );

    // Get user statistics
    await this.runTest(
      'Quiz',
      'Get User Statistics',
      'GET /api/quiz/statistics - Get user quiz statistics',
      async () => {
        const response = await this.api.get('/api/quiz/statistics', { headers: authHeaders });
        return {
          statusCode: response.status,
          hasStats: !!response.data.data
        };
      }
    );

    // Admin cleanup (admin only)
    await this.runTest(
      'Quiz',
      'Admin Session Cleanup',
      'POST /api/quiz/admin/cleanup-sessions - Cleanup expired sessions',
      async () => {
        const response = await this.api.post('/api/quiz/admin/cleanup-sessions', {}, { headers: authHeaders });
        return {
          statusCode: response.status,
          cleaned: true
        };
      }
    );
  }

  // Continue with remaining endpoints...
  async runAllTests() {
    this.log(`🚀 Starting COMPLETE API Test Suite - Testing ALL 55 Endpoints`, 'INFO');
    this.log(`🎯 Target: ${CONFIG.baseUrl}`, 'INFO');

    try {
      await this.testAllHealthEndpoints();           // 6 endpoints
    } catch (error) {
      this.log(`💥 Health endpoints error: ${error.message}`, 'FAIL');
    }

    try {
      await this.testAllAuthEndpoints();             // 13 endpoints  
    } catch (error) {
      this.log(`💥 Auth endpoints error: ${error.message}`, 'FAIL');
    }

    try {
      await this.testAllCategoryEndpoints();         // 11 endpoints
    } catch (error) {
      this.log(`💥 Category endpoints error: ${error.message}`, 'FAIL');
    }

    try {
      await this.testAllQuestionEndpoints();         // 11 endpoints
    } catch (error) {
      this.log(`💥 Question endpoints error: ${error.message}`, 'FAIL');
    }

    try {
      await this.testAllQuizEndpoints();             // 14 endpoints
    } catch (error) {
      this.log(`💥 Quiz endpoints error: ${error.message}`, 'FAIL');
    }

    // Generate report
    const report = this.generateCompleteReport();
    const reportPath = path.join(__dirname, '..', 'COMPLETE_API_COVERAGE_REPORT.md');
    
    try {
      fs.writeFileSync(reportPath, report);
      this.log(`📄 Complete coverage report: ${reportPath}`, 'INFO');
    } catch (error) {
      this.log(`⚠️ Failed to save report: ${error.message}`, 'WARN');
      console.log('\n' + report);
    }

    const stats = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length
    };

    this.log(`\n🎯 COMPLETE RESULTS: ${stats.passed}/${stats.total} tests passed (${((stats.passed/stats.total)*100).toFixed(1)}%)`, stats.failed === 0 ? 'PASS' : 'FAIL');
    
    if (stats.failed > 0) {
      process.exit(1);
    }
  }

  generateCompleteReport() {
    const endTime = new Date();
    const totalDuration = endTime - this.startTime;
    
    const stats = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      duration: totalDuration
    };

    const successRate = stats.total > 0 ? (stats.passed / stats.total * 100).toFixed(2) : 0;

    let report = `# 🏆 QuizMaster Pro - COMPLETE API COVERAGE REPORT\n\n`;
    report += `**Generated:** ${endTime.toISOString()}\n\n`;
    report += `**Target:** ALL 55 Backend Endpoints\n\n`;
    report += `**Coverage Goal:** 100% Complete Backend Testing\n\n`;

    report += `## 📊 Complete Coverage Summary\n\n`;
    report += `| 📈 Metric | Value |\n`;
    report += `|-----------|-------|\n`;
    report += `| **Total Endpoints Tested** | ${stats.total} |\n`;
    report += `| **✅ Passed** | ${stats.passed} |\n`;
    report += `| **❌ Failed** | ${stats.failed} |\n`;
    report += `| **🎯 Success Rate** | ${successRate}% |\n`;
    report += `| **⏱️ Duration** | ${(totalDuration / 1000).toFixed(2)}s |\n\n`;

    // Group results by category
    const categories = {};
    this.results.forEach(result => {
      if (!categories[result.category]) {
        categories[result.category] = [];
      }
      categories[result.category].push(result);
    });

    report += `## 📋 Detailed Results by Category\n\n`;

    Object.keys(categories).forEach(categoryName => {
      const categoryResults = categories[categoryName];
      const categoryPassed = categoryResults.filter(r => r.status === 'PASS').length;
      const categoryTotal = categoryResults.length;
      
      report += `### ${categoryName} (${categoryPassed}/${categoryTotal})\n\n`;

      categoryResults.forEach(result => {
        const statusIcon = result.status === 'PASS' ? '✅' : '❌';
        const duration = result.duration < 1000 ? `${result.duration}ms` : `${(result.duration/1000).toFixed(2)}s`;
        
        report += `${statusIcon} **${result.testName}** \`${duration}\`\n`;
        report += `   📋 ${result.description}\n`;
        
        if (result.status === 'PASS' && result.details) {
          if (result.details.statusCode) {
            report += `   📡 Status: \`${result.details.statusCode}\`\n`;
          }
        } else if (result.status === 'FAIL') {
          report += `   🚨 Error: ${result.error.message}\n`;
        }
        report += `\n`;
      });
    });

    return report;
  }
}

// Run the complete test suite
const tester = new CompleteAPITester();
tester.runAllTests().catch(error => {
  console.error('💥 Complete test suite crashed:', error);
  process.exit(1);
});
