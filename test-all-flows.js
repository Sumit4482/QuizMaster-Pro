#!/usr/bin/env node

/**
 * Comprehensive API Flow Testing Script
 * Tests all QuizMaster Pro application flows
 */

const https = require('https');
const http = require('http');

// Configuration
const API_BASE = 'http://localhost:3001';
const TEST_USER = {
  email: 'admin@quizmaster.pro',
  password: 'Admin123!'
};

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.port === 443 ? https : http;
    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
            data: body ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
            data: null,
            parseError: e.message
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Test functions
async function testHealthCheck() {
  console.log('\n=== 1. Health Check ===');
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/health/ready',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);
    return response.data?.success === true;
  } catch (error) {
    console.error('Health check failed:', error.message);
    return false;
  }
}

async function testLogin() {
  console.log('\n=== 2. Authentication Test ===');
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, TEST_USER);
    
    console.log(`Status: ${response.statusCode}`);
    if (response.data?.success) {
      const token = response.data.data.tokens.accessToken;
      console.log(`✅ Login successful - Token length: ${token.length}`);
      return token;
    } else {
      console.log(`❌ Login failed: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (error) {
    console.error('Login failed:', error.message);
    return null;
  }
}

async function testCategories(token) {
  console.log('\n=== 3. Categories Test ===');
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/categories',
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    if (response.data?.success) {
      console.log(`✅ Found ${response.data.data.length} categories`);
      return response.data.data;
    } else {
      console.log(`❌ Categories failed: ${JSON.stringify(response.data)}`);
      return [];
    }
  } catch (error) {
    console.error('Categories test failed:', error.message);
    return [];
  }
}

async function testQuestionsSearch(token) {
  console.log('\n=== 4. Questions Search Test ===');
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/questions/search?page=1&limit=5',
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    if (response.data?.success) {
      const questions = response.data.data.questions || response.data.data;
      console.log(`✅ Found ${questions?.length || 0} questions`);
      return questions;
    } else {
      console.log(`❌ Questions search failed: ${JSON.stringify(response.data)}`);
      return [];
    }
  } catch (error) {
    console.error('Questions search test failed:', error.message);
    return [];
  }
}

async function testSoloLibraryQuiz(token, categories) {
  console.log('\n=== 5. Solo Library Quiz Flow Test ===');
  
  if (!categories || categories.length === 0) {
    console.log('❌ No categories available for quiz creation');
    return null;
  }
  
  try {
    // Create quiz session
    const createResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/quiz/sessions',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      totalQuestions: 5,
      categoryIds: [categories[0].id],
      difficultyLevels: [1, 2],
      questionTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'],
      shuffleQuestions: true,
      allowPause: true,
      showExplanations: true,
      timePerQuestion: 30,
      title: 'Test Solo Library Quiz'
    });
    
    console.log(`Create Session Status: ${createResponse.statusCode}`);
    
    if (createResponse.data?.success) {
      const sessionId = createResponse.data.data.id;
      console.log(`✅ Quiz session created: ${sessionId}`);
      
      // Start the session
      const startResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/quiz/sessions/${sessionId}/start`,
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`Start Session Status: ${startResponse.statusCode}`);
      if (startResponse.data?.success) {
        console.log(`✅ Quiz session started successfully`);
      } else {
        console.log(`⚠️ Quiz session start failed: ${JSON.stringify(startResponse.data)}`);
      }
      
      return sessionId;
    } else {
      console.log(`❌ Quiz session creation failed: ${JSON.stringify(createResponse.data)}`);
      return null;
    }
  } catch (error) {
    console.error('Solo library quiz test failed:', error.message);
    return null;
  }
}

async function testSoloAIQuiz(token) {
  console.log('\n=== 6. Solo AI Quiz Flow Test ===');
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/ai/generate/questions',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      topic: 'JavaScript Programming',
      difficulty: 2,
      questionType: 'MULTIPLE_CHOICE',
      count: 5,
      subject: 'Computer Science'
    });
    
    console.log(`Status: ${response.statusCode}`);
    if (response.data?.success) {
      console.log(`✅ Generated ${response.data.data.questions.length} AI questions`);
      return response.data.data.questions;
    } else {
      console.log(`❌ AI question generation failed: ${JSON.stringify(response.data)}`);
      return [];
    }
  } catch (error) {
    console.error('Solo AI quiz test failed:', error.message);
    return [];
  }
}

async function testOneVsOneFlow(token) {
  console.log('\n=== 7. 1 vs 1 Flow Test ===');
  try {
    // Check if 1v1 endpoints exist
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/1vs1/create',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      topic: 'General Knowledge',
      difficulty: 2,
      questionCount: 10
    });
    
    console.log(`Status: ${response.statusCode}`);
    if (response.data?.success) {
      console.log(`✅ 1vs1 game created successfully`);
      return response.data.data;
    } else {
      console.log(`⚠️ 1vs1 endpoint not available or failed: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (error) {
    console.error('1vs1 test failed:', error.message);
    return null;
  }
}

async function testMultiplayerRoomFlow(token) {
  console.log('\n=== 8. Multiplayer Room Flow Test ===');
  try {
    // Check if room endpoints exist
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/rooms/create',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      name: 'Test Quiz Room',
      maxPlayers: 6,
      isPrivate: false,
      quizConfig: {
        totalQuestions: 10,
        timePerQuestion: 30,
        categories: ['general']
      }
    });
    
    console.log(`Status: ${response.statusCode}`);
    if (response.data?.success) {
      console.log(`✅ Multiplayer room created successfully`);
      return response.data.data;
    } else {
      console.log(`⚠️ Room endpoint not available or failed: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (error) {
    console.error('Multiplayer room test failed:', error.message);
    return null;
  }
}

async function testWebSocketConnection() {
  console.log('\n=== 9. WebSocket Connection Test ===');
  try {
    // Simple WebSocket connection test
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://localhost:3001');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        console.log('⚠️ WebSocket connection timeout');
        resolve(false);
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ WebSocket connection established');
        ws.close();
        resolve(true);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        console.log(`❌ WebSocket connection failed: ${error.message}`);
        resolve(false);
      });
    });
  } catch (error) {
    console.error('WebSocket test failed:', error.message);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Comprehensive QuizMaster Pro API Tests');
  console.log('=' .repeat(60));
  
  const results = {
    health: false,
    auth: false,
    categories: false,
    questions: false,
    soloLibrary: false,
    soloAI: false,
    oneVsOne: false,
    multiplayer: false,
    websocket: false
  };
  
  // Test 1: Health Check
  results.health = await testHealthCheck();
  
  // Test 2: Authentication
  const token = await testLogin();
  results.auth = !!token;
  
  if (!token) {
    console.log('\n❌ Cannot proceed without authentication token');
    return results;
  }
  
  // Test 3: Categories
  const categories = await testCategories(token);
  results.categories = categories.length > 0;
  
  // Test 4: Questions
  const questions = await testQuestionsSearch(token);
  results.questions = questions.length > 0;
  
  // Test 5: Solo Library Quiz
  const sessionId = await testSoloLibraryQuiz(token, categories);
  results.soloLibrary = !!sessionId;
  
  // Test 6: Solo AI Quiz
  const aiQuestions = await testSoloAIQuiz(token);
  results.soloAI = aiQuestions.length > 0;
  
  // Test 7: 1 vs 1 Flow
  const oneVsOneGame = await testOneVsOneFlow(token);
  results.oneVsOne = !!oneVsOneGame;
  
  // Test 8: Multiplayer Room Flow
  const room = await testMultiplayerRoomFlow(token);
  results.multiplayer = !!room;
  
  // Test 9: WebSocket Connection
  try {
    results.websocket = await testWebSocketConnection();
  } catch (e) {
    console.log('⚠️ WebSocket test skipped - ws module not available');
    results.websocket = false;
  }
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  
  const testNames = {
    health: 'Health Check',
    auth: 'Authentication',
    categories: 'Categories API',
    questions: 'Questions Search',
    soloLibrary: 'Solo Library Quiz',
    soloAI: 'Solo AI Quiz',
    oneVsOne: '1 vs 1 Flow',
    multiplayer: 'Multiplayer Rooms',
    websocket: 'WebSocket Connection'
  };
  
  let passCount = 0;
  for (const [key, value] of Object.entries(results)) {
    const status = value ? '✅ PASS' : '❌ FAIL';
    console.log(`${testNames[key]}: ${status}`);
    if (value) passCount++;
  }
  
  console.log('=' .repeat(60));
  console.log(`Overall: ${passCount}/${Object.keys(results).length} tests passed`);
  
  if (passCount === Object.keys(results).length) {
    console.log('🎉 All tests passed! QuizMaster Pro is fully operational.');
  } else {
    console.log('⚠️  Some tests failed. Check the individual test results above.');
  }
  
  return results;
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };


