/**
 * K6 Performance Load Testing Script
 * 
 * This script provides comprehensive performance testing for the QuizMaster Pro API
 * using K6 load testing framework.
 * 
 * To run: k6 run k6LoadTest.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const failureRate = new Rate('failures');
const loginDuration = new Trend('login_duration');
const questionCreationDuration = new Trend('question_creation_duration');
const quizSessionDuration = new Trend('quiz_session_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users over 30s
    { duration: '1m', target: 10 },   // Stay at 10 users for 1 minute
    { duration: '2m', target: 20 },   // Ramp up to 20 users over 2 minutes
    { duration: '3m', target: 20 },   // Stay at 20 users for 3 minutes
    { duration: '1m', target: 50 },   // Ramp up to 50 users over 1 minute
    { duration: '2m', target: 50 },   // Stay at 50 users for 2 minutes
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests should be below 500ms
    'http_req_duration{name:auth}': ['p(95)<300'], // Auth requests should be faster
    'http_req_duration{name:questions}': ['p(95)<400'], // Question requests threshold
    'http_req_failed': ['rate<0.05'], // Less than 5% of requests should fail
    'failures': ['rate<0.1'], // Less than 10% business logic failures
  },
};

// Base URL configuration
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3001';

// Test data
const testUsers = [
  { email: 'loadtest1@example.com', password: 'LoadTest123!' },
  { email: 'loadtest2@example.com', password: 'LoadTest123!' },
  { email: 'loadtest3@example.com', password: 'LoadTest123!' },
  { email: 'loadtest4@example.com', password: 'LoadTest123!' },
  { email: 'loadtest5@example.com', password: 'LoadTest123!' },
];

/**
 * Setup function - runs once per VU before test execution
 */
export function setup() {
  console.log('Setting up performance test environment...');
  
  // Health check
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    throw new Error(`Health check failed: ${healthResponse.status}`);
  }
  
  console.log('Backend health check passed');
  return { baseUrl: BASE_URL };
}

/**
 * Main test function
 */
export default function(data) {
  const baseUrl = data.baseUrl;
  let authToken = null;
  let sessionId = null;
  
  group('Authentication Flow', () => {
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];
    
    // Try to register (might fail if user exists, that's OK)
    group('User Registration', () => {
      const registerPayload = {
        email: `k6test${__VU}_${Date.now()}@example.com`,
        username: `k6user${__VU}_${Date.now()}`,
        password: 'K6TestPassword123!',
        firstName: 'K6',
        lastName: 'Test',
      };
      
      const registerResponse = http.post(`${baseUrl}/api/auth/register`, 
        JSON.stringify(registerPayload), 
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      check(registerResponse, {
        'registration status is 201 or 409': (r) => r.status === 201 || r.status === 409,
        'registration response has data': (r) => r.json('success') !== undefined,
      }) || failureRate.add(1);
      
      if (registerResponse.status === 201) {
        const responseData = registerResponse.json();
        authToken = responseData.data.tokens.accessToken;
      }
    });
    
    // Login if we don't have a token from registration
    if (!authToken) {
      group('User Login', () => {
        const loginStart = Date.now();
        const loginPayload = {
          email: user.email,
          password: user.password,
        };
        
        const loginResponse = http.post(`${baseUrl}/api/auth/login`, 
          JSON.stringify(loginPayload), 
          { 
            headers: { 'Content-Type': 'application/json' },
            tags: { name: 'auth' }
          }
        );
        
        loginDuration.add(Date.now() - loginStart);
        
        check(loginResponse, {
          'login status is 200': (r) => r.status === 200,
          'login has access token': (r) => r.json('data.tokens.accessToken') !== undefined,
          'login response time < 300ms': (r) => r.timings.duration < 300,
        }) || failureRate.add(1);
        
        if (loginResponse.status === 200) {
          const responseData = loginResponse.json();
          authToken = responseData.data.tokens.accessToken;
        }
      });
    }
    
    // Test profile access
    if (authToken) {
      group('Profile Access', () => {
        const profileResponse = http.get(`${baseUrl}/api/auth/profile`, {
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          tags: { name: 'auth' }
        });
        
        check(profileResponse, {
          'profile status is 200': (r) => r.status === 200,
          'profile has user data': (r) => r.json('data.email') !== undefined,
        }) || failureRate.add(1);
      });
    }
  });
  
  // Question management tests
  if (authToken) {
    group('Question Management', () => {
      let questionId = null;
      
      // Create a question
      group('Create Question', () => {
        const createStart = Date.now();
        const questionPayload = {
          questionText: `K6 Load Test Question ${__VU}_${Date.now()}?`,
          questionType: 'MULTIPLE_CHOICE',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: Math.floor(Math.random() * 4),
          explanation: 'This is a K6 performance test question',
          difficultyLevel: Math.floor(Math.random() * 5) + 1,
          tags: ['k6test', 'performance'],
        };
        
        const createResponse = http.post(`${baseUrl}/api/questions`, 
          JSON.stringify(questionPayload), 
          { 
            headers: { 
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            tags: { name: 'questions' }
          }
        );
        
        questionCreationDuration.add(Date.now() - createStart);
        
        check(createResponse, {
          'question creation status is 201': (r) => r.status === 201,
          'question creation has ID': (r) => r.json('data.question.id') !== undefined,
          'question creation time < 400ms': (r) => r.timings.duration < 400,
        }) || failureRate.add(1);
        
        if (createResponse.status === 201) {
          questionId = createResponse.json('data.question.id');
        }
      });
      
      // List questions
      group('List Questions', () => {
        const listResponse = http.get(`${baseUrl}/api/questions?page=1&limit=10`, {
          headers: { 
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          tags: { name: 'questions' }
        });
        
        check(listResponse, {
          'question list status is 200': (r) => r.status === 200,
          'question list has data': (r) => r.json('data.questions') !== undefined,
          'question list has pagination': (r) => r.json('data.pagination') !== undefined,
        }) || failureRate.add(1);
      });
      
      // Get specific question
      if (questionId) {
        group('Get Question', () => {
          const getResponse = http.get(`${baseUrl}/api/questions/${questionId}`, {
            headers: { 
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            tags: { name: 'questions' }
          });
          
          check(getResponse, {
            'get question status is 200': (r) => r.status === 200,
            'get question has data': (r) => r.json('data.question') !== undefined,
          }) || failureRate.add(1);
        });
      }
      
      // Update question
      if (questionId) {
        group('Update Question', () => {
          const updatePayload = {
            explanation: `Updated explanation by K6 test ${Date.now()}`,
            tags: ['k6test', 'performance', 'updated'],
          };
          
          const updateResponse = http.put(`${baseUrl}/api/questions/${questionId}`, 
            JSON.stringify(updatePayload), 
            { 
              headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
              },
              tags: { name: 'questions' }
            }
          );
          
          check(updateResponse, {
            'question update status is 200': (r) => r.status === 200,
            'question update has data': (r) => r.json('data.question') !== undefined,
          }) || failureRate.add(1);
        });
      }
    });
  }
  
  // Quiz session tests
  if (authToken) {
    group('Quiz Session Management', () => {
      group('Create Quiz Session', () => {
        const sessionStart = Date.now();
        const sessionPayload = {
          totalQuestions: 5,
          timePerQuestion: 30,
          difficultyLevels: [1, 2, 3],
          questionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'],
          shuffleQuestions: true,
        };
        
        const sessionResponse = http.post(`${baseUrl}/api/quiz/sessions`, 
          JSON.stringify(sessionPayload), 
          { 
            headers: { 
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            tags: { name: 'quiz' }
          }
        );
        
        quizSessionDuration.add(Date.now() - sessionStart);
        
        check(sessionResponse, {
          'quiz session creation status is 201': (r) => r.status === 201,
          'quiz session has ID': (r) => r.json('data.session.id') !== undefined,
          'quiz session creation time < 500ms': (r) => r.timings.duration < 500,
        }) || failureRate.add(1);
        
        if (sessionResponse.status === 201) {
          sessionId = sessionResponse.json('data.session.id');
        }
      });
      
      // Test session operations
      if (sessionId) {
        group('Get Current Question', () => {
          const questionResponse = http.get(`${baseUrl}/api/quiz/sessions/${sessionId}/current-question`, {
            headers: { 
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            tags: { name: 'quiz' }
          });
          
          check(questionResponse, {
            'current question status is 200': (r) => r.status === 200,
            'current question has data': (r) => r.json('data.question') !== undefined,
          }) || failureRate.add(1);
        });
        
        group('Submit Answer', () => {
          const answerPayload = {
            questionIndex: 0,
            userAnswer: Math.floor(Math.random() * 4),
            timeTaken: Math.floor(Math.random() * 25) + 5,
          };
          
          const answerResponse = http.post(`${baseUrl}/api/quiz/sessions/${sessionId}/answers`, 
            JSON.stringify(answerPayload), 
            { 
              headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
              },
              tags: { name: 'quiz' }
            }
          );
          
          check(answerResponse, {
            'answer submission status is 201': (r) => r.status === 201,
            'answer submission has data': (r) => r.json('data') !== undefined,
          }) || failureRate.add(1);
        });
      }
    });
  }
  
  // Small delay between iterations
  sleep(1);
}

/**
 * Teardown function - runs once after all VUs complete
 */
export function teardown(data) {
  console.log('Performance test completed');
  console.log(`Test ran against: ${data.baseUrl}`);
}

/**
 * Handle summary - custom results processing
 */
export function handleSummary(data) {
  return {
    'performance-report.json': JSON.stringify(data),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = '\n';
  summary += `${indent}Performance Test Summary\n`;
  summary += `${indent}========================\n\n`;
  
  // HTTP metrics
  if (data.metrics.http_req_duration) {
    summary += `${indent}HTTP Request Duration:\n`;
    summary += `${indent}  Average: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n\n`;
  }
  
  // Request rate
  if (data.metrics.http_reqs) {
    summary += `${indent}HTTP Requests: ${data.metrics.http_reqs.values.count} total\n`;
    summary += `${indent}Request Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s\n\n`;
  }
  
  // Success rate
  if (data.metrics.http_req_failed) {
    const successRate = ((1 - data.metrics.http_req_failed.values.rate) * 100).toFixed(2);
    summary += `${indent}Success Rate: ${successRate}%\n`;
    summary += `${indent}Failed Requests: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n\n`;
  }
  
  // Custom metrics
  if (data.metrics.failures) {
    summary += `${indent}Business Logic Failures: ${(data.metrics.failures.values.rate * 100).toFixed(2)}%\n`;
  }
  
  return summary;
}
