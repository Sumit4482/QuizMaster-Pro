#!/usr/bin/env node

/**
 * WebSocket Functionality Test
 * Tests the WebSocket connection and events
 */

const io = require('socket.io-client');
const http = require('http');

// Configuration
const API_BASE = 'http://localhost:3001';
const WS_BASE = 'ws://localhost:3001';
const TEST_USER = {
  email: 'admin@quizmaster.pro',
  password: 'Admin123!'
};

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
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

async function getAuthToken() {
  console.log('🔐 Getting authentication token...');
  
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, TEST_USER);
    
    if (response.data?.success) {
      const token = response.data.data.tokens.accessToken;
      console.log(`✅ Token obtained: ${token.substring(0, 20)}...`);
      return token;
    } else {
      console.log(`❌ Login failed: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (error) {
    console.error('❌ Token request failed:', error.message);
    return null;
  }
}

function testWebSocketConnection(token) {
  return new Promise((resolve) => {
    console.log('\n🔌 Testing WebSocket Connection...');
    
    const socket = io(WS_BASE, {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling']
    });
    
    const timeout = setTimeout(() => {
      socket.disconnect();
      console.log('❌ WebSocket connection timeout');
      resolve({ success: false, reason: 'timeout' });
    }, 10000);
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      console.log(`✅ WebSocket connected: ${socket.id}`);
      
      // Test basic events
      testBasicEvents(socket, resolve);
    });
    
    socket.on('connection:confirmed', (data) => {
      console.log('✅ Connection confirmed:', {
        socketId: data.socketId,
        user: data.user.username,
        timestamp: data.timestamp
      });
    });
    
    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      console.log(`❌ WebSocket connection error: ${error.message}`);
      resolve({ success: false, reason: error.message });
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`🔌 WebSocket disconnected: ${reason}`);
    });
  });
}

function testBasicEvents(socket, resolve) {
  console.log('\n🧪 Testing WebSocket Events...');
  
  let testsCompleted = 0;
  const totalTests = 3;
  const results = [];
  
  const checkComplete = () => {
    testsCompleted++;
    if (testsCompleted >= totalTests) {
      socket.disconnect();
      resolve({ 
        success: true, 
        results,
        totalTests,
        passedTests: results.filter(r => r.success).length 
      });
    }
  };
  
  // Test 1: Ping-Pong
  console.log('1️⃣ Testing ping-pong...');
  socket.emit('ping', { timestamp: Date.now() });
  
  socket.on('pong', (data) => {
    console.log('✅ Ping-pong successful');
    results.push({ test: 'ping-pong', success: true });
    checkComplete();
  });
  
  // Test 2: User presence
  console.log('2️⃣ Testing user presence...');
  socket.emit('user:get_presence');
  
  socket.on('user:presence_update', (data) => {
    console.log('✅ User presence received:', data);
    results.push({ test: 'user-presence', success: true });
    checkComplete();
  });
  
  // Test 3: Room discovery (if available)
  console.log('3️⃣ Testing room discovery...');
  socket.emit('room:discover', { limit: 5 });
  
  const roomTimeout = setTimeout(() => {
    console.log('⚠️ Room discovery timeout (may not be implemented)');
    results.push({ test: 'room-discovery', success: false, reason: 'timeout' });
    checkComplete();
  }, 3000);
  
  socket.on('room:discovery_result', (data) => {
    clearTimeout(roomTimeout);
    console.log('✅ Room discovery successful:', data);
    results.push({ test: 'room-discovery', success: true });
    checkComplete();
  });
  
  socket.on('room:error', (error) => {
    clearTimeout(roomTimeout);
    console.log('⚠️ Room discovery error (expected if not implemented):', error.message);
    results.push({ test: 'room-discovery', success: false, reason: error.message });
    checkComplete();
  });
  
  // Fallback for missing events
  setTimeout(() => {
    if (testsCompleted < 2) {
      console.log('⚠️ Some WebSocket events may not be implemented yet');
      while (testsCompleted < totalTests) {
        results.push({ test: `test-${testsCompleted + 1}`, success: false, reason: 'not-implemented' });
        testsCompleted++;
      }
      socket.disconnect();
      resolve({ 
        success: true, 
        results,
        totalTests,
        passedTests: results.filter(r => r.success).length 
      });
    }
  }, 5000);
}

async function test1vs1Functionality(token) {
  console.log('\n🥊 Testing 1vs1 API Integration...');
  
  try {
    // Test creating 1vs1 battle request
    const battleResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/1vs1/create',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      topic: 'JavaScript Programming',
      difficulty: 2,
      questionCount: 10,
      useAI: true
    });
    
    if (battleResponse.data?.success) {
      console.log('✅ 1vs1 battle creation API working');
      
      // Test getting stats
      const statsResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: '/api/1vs1/stats',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (statsResponse.data?.success) {
        console.log('✅ 1vs1 stats API working');
        return { success: true, apis: 2 };
      } else {
        console.log('❌ 1vs1 stats API failed');
        return { success: false, apis: 1, reason: 'stats-failed' };
      }
    } else {
      console.log('❌ 1vs1 battle creation failed:', battleResponse.data);
      return { success: false, apis: 0, reason: 'creation-failed' };
    }
  } catch (error) {
    console.log('❌ 1vs1 API test failed:', error.message);
    return { success: false, apis: 0, reason: error.message };
  }
}

async function testRoomFunctionality(token) {
  console.log('\n🏠 Testing Room API Integration...');
  
  try {
    // Test creating room
    const roomResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/rooms/create',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      name: 'WebSocket Test Room',
      description: 'Testing room creation API',
      maxPlayers: 6,
      isPrivate: false,
      quizConfig: {
        totalQuestions: 10,
        timePerQuestion: 30,
        categories: ['general']
      }
    });
    
    if (roomResponse.data?.success) {
      console.log('✅ Room creation API working');
      
      // Test listing rooms
      const listResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: '/api/rooms/list?limit=3',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (listResponse.data?.success) {
        console.log('✅ Room listing API working');
        return { success: true, apis: 2 };
      } else {
        console.log('❌ Room listing API failed');
        return { success: false, apis: 1, reason: 'listing-failed' };
      }
    } else {
      console.log('❌ Room creation failed:', roomResponse.data);
      return { success: false, apis: 0, reason: 'creation-failed' };
    }
  } catch (error) {
    console.log('❌ Room API test failed:', error.message);
    return { success: false, apis: 0, reason: error.message };
  }
}

// Main test runner
async function runWebSocketTests() {
  console.log('🚀 Starting WebSocket and Advanced Features Tests');
  console.log('=' .repeat(60));
  
  const results = {
    auth: false,
    websocket: false,
    oneVsOne: false,
    rooms: false
  };
  
  // Get authentication token
  const token = await getAuthToken();
  if (!token) {
    console.log('\n❌ Cannot proceed without authentication token');
    return results;
  }
  results.auth = true;
  
  // Test WebSocket connection
  try {
    const wsResult = await testWebSocketConnection(token);
    results.websocket = wsResult.success;
    
    if (wsResult.success) {
      console.log(`✅ WebSocket tests: ${wsResult.passedTests}/${wsResult.totalTests} passed`);
    } else {
      console.log(`❌ WebSocket connection failed: ${wsResult.reason}`);
    }
  } catch (error) {
    console.log(`❌ WebSocket test error: ${error.message}`);
  }
  
  // Test 1vs1 functionality
  try {
    const oneVsOneResult = await test1vs1Functionality(token);
    results.oneVsOne = oneVsOneResult.success;
    
    if (oneVsOneResult.success) {
      console.log(`✅ 1vs1 APIs working: ${oneVsOneResult.apis}/2 endpoints`);
    } else {
      console.log(`❌ 1vs1 test failed: ${oneVsOneResult.reason}`);
    }
  } catch (error) {
    console.log(`❌ 1vs1 test error: ${error.message}`);
  }
  
  // Test room functionality
  try {
    const roomResult = await testRoomFunctionality(token);
    results.rooms = roomResult.success;
    
    if (roomResult.success) {
      console.log(`✅ Room APIs working: ${roomResult.apis}/2 endpoints`);
    } else {
      console.log(`❌ Room test failed: ${roomResult.reason}`);
    }
  } catch (error) {
    console.log(`❌ Room test error: ${error.message}`);
  }
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 WEBSOCKET & ADVANCED FEATURES TEST SUMMARY');
  console.log('=' .repeat(60));
  
  const testNames = {
    auth: 'Authentication',
    websocket: 'WebSocket Connection',
    oneVsOne: '1vs1 Battle APIs',
    rooms: 'Room Management APIs'
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
    console.log('🎉 All WebSocket and advanced features working!');
  } else {
    console.log('⚠️  Some features need attention. Check individual test results.');
  }
  
  return results;
}

// Check if WebSocket client is available
function checkDependencies() {
  try {
    require('socket.io-client');
    return true;
  } catch (error) {
    console.log('❌ socket.io-client not available. WebSocket tests will be skipped.');
    return false;
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  if (checkDependencies()) {
    runWebSocketTests().catch(console.error);
  } else {
    console.log('📝 WebSocket tests require socket.io-client package.');
    console.log('   Install with: npm install socket.io-client');
    console.log('   For now, running basic API tests...');
    
    // Run basic API tests without WebSocket
    const { runAllTests } = require('./test-all-flows.js');
    runAllTests().catch(console.error);
  }
}

module.exports = { runWebSocketTests };
