/**
 * Performance Load Testing with Artillery.js
 * 
 * This script tests the performance of key API endpoints under load.
 * 
 * To run: npm install artillery -g && artillery run loadTest.js
 */

// Load test configuration for Artillery
const loadTestConfig = {
  config: {
    target: process.env.API_BASE_URL || 'http://localhost:3001',
    phases: [
      {
        name: 'Warm up',
        duration: 30,
        arrivalRate: 2,
      },
      {
        name: 'Ramp up load',
        duration: 60,
        arrivalRate: 2,
        rampTo: 20,
      },
      {
        name: 'Sustained load',
        duration: 120,
        arrivalRate: 20,
      },
      {
        name: 'Peak load',
        duration: 60,
        arrivalRate: 20,
        rampTo: 50,
      },
    ],
    defaults: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
    variables: {
      testUsers: [
        'test1@example.com',
        'test2@example.com',
        'test3@example.com',
        'test4@example.com',
        'test5@example.com',
      ],
      passwords: [
        'TestPassword123!',
        'SecurePass456@',
        'StrongPwd789#',
        'ComplexKey000$',
        'SafeAccess111%',
      ],
    },
  },
  scenarios: [
    {
      name: 'Health Check Load Test',
      weight: 10,
      flow: [
        {
          get: {
            url: '/health',
            capture: {
              status: 'statusCode',
            },
          },
        },
        {
          think: 1,
        },
      ],
    },
    {
      name: 'Authentication Flow Load Test',
      weight: 30,
      flow: [
        // Register user
        {
          post: {
            url: '/api/auth/register',
            json: {
              email: '{{ $randomString() }}@example.com',
              username: '{{ $randomString() }}',
              password: 'TestPassword123!',
              firstName: 'Load',
              lastName: 'Test',
            },
            capture: {
              accessToken: 'json.$.data.tokens.accessToken',
            },
          },
        },
        {
          think: 2,
        },
        // Login with same credentials
        {
          post: {
            url: '/api/auth/login',
            json: {
              email: '{{ email }}',
              password: 'TestPassword123!',
            },
            capture: {
              loginToken: 'json.$.data.tokens.accessToken',
            },
          },
        },
        {
          think: 1,
        },
        // Access protected profile endpoint
        {
          get: {
            url: '/api/auth/profile',
            headers: {
              Authorization: 'Bearer {{ loginToken }}',
            },
          },
        },
        {
          think: 2,
        },
        // Logout
        {
          post: {
            url: '/api/auth/logout',
            headers: {
              Authorization: 'Bearer {{ loginToken }}',
            },
          },
        },
      ],
    },
    {
      name: 'Question Management Load Test',
      weight: 40,
      flow: [
        // First authenticate
        {
          post: {
            url: '/api/auth/login',
            json: {
              email: '{{ $pick(testUsers) }}',
              password: '{{ $pick(passwords) }}',
            },
            capture: {
              token: 'json.$.data.tokens.accessToken',
            },
          },
        },
        {
          think: 1,
        },
        // Get questions list
        {
          get: {
            url: '/api/questions?page=1&limit=10',
            headers: {
              Authorization: 'Bearer {{ token }}',
            },
          },
        },
        {
          think: 2,
        },
        // Create a new question
        {
          post: {
            url: '/api/questions',
            headers: {
              Authorization: 'Bearer {{ token }}',
            },
            json: {
              questionText: 'Load test question: What is {{ $randomInt(1, 1000) }}?',
              questionType: 'MULTIPLE_CHOICE',
              options: ['Option A', 'Option B', 'Option C', 'Option D'],
              correctAnswer: '{{ $randomInt(0, 3) }}',
              explanation: 'This is a load test question',
              difficultyLevel: '{{ $randomInt(1, 5) }}',
              tags: ['loadtest', 'performance'],
            },
            capture: {
              questionId: 'json.$.data.question.id',
            },
          },
        },
        {
          think: 1,
        },
        // Retrieve the created question
        {
          get: {
            url: '/api/questions/{{ questionId }}',
            headers: {
              Authorization: 'Bearer {{ token }}',
            },
          },
        },
        {
          think: 2,
        },
        // Update the question
        {
          put: {
            url: '/api/questions/{{ questionId }}',
            headers: {
              Authorization: 'Bearer {{ token }}',
            },
            json: {
              explanation: 'Updated explanation for load test',
              tags: ['loadtest', 'performance', 'updated'],
            },
          },
        },
        {
          think: 1,
        },
      ],
    },
    {
      name: 'Quiz Session Load Test',
      weight: 20,
      flow: [
        // Login first
        {
          post: {
            url: '/api/auth/login',
            json: {
              email: '{{ $pick(testUsers) }}',
              password: '{{ $pick(passwords) }}',
            },
            capture: {
              authToken: 'json.$.data.tokens.accessToken',
            },
          },
        },
        {
          think: 1,
        },
        // Start a quiz session
        {
          post: {
            url: '/api/quiz/sessions',
            headers: {
              Authorization: 'Bearer {{ authToken }}',
            },
            json: {
              totalQuestions: 5,
              timePerQuestion: 30,
              difficultyLevels: [1, 2, 3],
              questionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'],
              shuffleQuestions: true,
            },
            capture: {
              sessionId: 'json.$.data.session.id',
            },
          },
        },
        {
          think: 2,
        },
        // Get current question
        {
          get: {
            url: '/api/quiz/sessions/{{ sessionId }}/current-question',
            headers: {
              Authorization: 'Bearer {{ authToken }}',
            },
            capture: {
              currentQuestion: 'json.$.data.question',
            },
          },
        },
        {
          think: 3,
        },
        // Submit answer
        {
          post: {
            url: '/api/quiz/sessions/{{ sessionId }}/answers',
            headers: {
              Authorization: 'Bearer {{ authToken }}',
            },
            json: {
              questionIndex: 0,
              userAnswer: '{{ $randomInt(0, 3) }}',
              timeTaken: '{{ $randomInt(5, 25) }}',
            },
          },
        },
        {
          think: 1,
        },
        // Get session status
        {
          get: {
            url: '/api/quiz/sessions/{{ sessionId }}',
            headers: {
              Authorization: 'Bearer {{ authToken }}',
            },
          },
        },
      ],
    },
  ],
};

// Performance thresholds
const performanceThresholds = {
  'http.response_time.p95': 500, // 95% of requests should complete within 500ms
  'http.response_time.p99': 1000, // 99% of requests should complete within 1s
  'http.request_rate': 40, // Should handle at least 40 requests/second
  'http.codes.200': 0.95, // 95% success rate minimum
  'http.codes.201': 0.9, // 90% success rate for create operations
};

// Export for Artillery
module.exports = loadTestConfig;

console.log('Performance Load Test Configuration Loaded');
console.log('Target:', loadTestConfig.config.target);
console.log('Expected thresholds:', performanceThresholds);
console.log('\nTo run this test:');
console.log('1. npm install -g artillery');
console.log('2. artillery run loadTest.js');
console.log('3. artillery report --output report.html');
