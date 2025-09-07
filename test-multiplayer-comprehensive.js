#!/usr/bin/env node

/**
 * COMPREHENSIVE MULTIPLAYER GAME TESTING SUITE
 * Tests all happy path, edge cases, and real-world scenarios
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const BASE_URL = 'http://localhost:3001/api';
const FRONTEND_URL = 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
  USERS: [
    { email: 'player1@test.com', username: 'Player1', password: 'password123' },
    { email: 'player2@test.com', username: 'Player2', password: 'password123' },
    { email: 'player3@test.com', username: 'Player3', password: 'password123' },
    { email: 'host@test.com', username: 'Host', password: 'password123' }
  ],
  ROOM_CONFIGS: [
    { name: 'Test Room 1', maxPlayers: 2, isPrivate: false },
    { name: 'Large Room', maxPlayers: 10, isPrivate: false },
    { name: 'Private Room', maxPlayers: 4, isPrivate: true }
  ]
};

class MultplayerGameTester {
  constructor() {
    this.tokens = new Map();
    this.rooms = [];
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📝',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      test: '🧪'
    }[type] || '📝';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MultplayerGameTester/1.0'
      }
    };

    try {
      const curlOptions = [];
      curlOptions.push('-s'); // Silent
      curlOptions.push('-X', options.method || 'GET');
      
      if (options.headers) {
        Object.entries({...defaultOptions.headers, ...options.headers}).forEach(([key, value]) => {
          curlOptions.push('-H', `${key}: ${value}`);
        });
      } else {
        Object.entries(defaultOptions.headers).forEach(([key, value]) => {
          curlOptions.push('-H', `${key}: ${value}`);
        });
      }

      if (options.body) {
        curlOptions.push('-d', JSON.stringify(options.body));
      }

      curlOptions.push(url);

      const { stdout, stderr } = await execAsync(`curl ${curlOptions.join(' ')}`);
      
      if (stderr) {
        throw new Error(`Request failed: ${stderr}`);
      }

      return JSON.parse(stdout || '{}');
    } catch (error) {
      this.log(`Request to ${endpoint} failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async test(description, testFn) {
    this.log(`${description}`, 'test');
    try {
      await testFn();
      this.testResults.passed++;
      this.log(`PASSED: ${description}`, 'success');
      return true;
    } catch (error) {
      this.testResults.failed++;
      this.testResults.errors.push({ test: description, error: error.message });
      this.log(`FAILED: ${description} - ${error.message}`, 'error');
      return false;
    }
  }

  async setupTestUsers() {
    this.log('Setting up test users...', 'info');
    
    for (const user of TEST_CONFIG.USERS) {
      try {
        // Try to register user (might already exist)
        await this.makeRequest('/auth/register', {
          method: 'POST',
          body: user
        });
      } catch (error) {
        // User might already exist, continue
      }

      // Login to get token
      try {
        const response = await this.makeRequest('/auth/login', {
          method: 'POST',
          body: {
            email: user.email,
            password: user.password
          }
        });

        if (response.success && response.data.token) {
          this.tokens.set(user.username, response.data.token);
          this.log(`User ${user.username} authenticated`, 'success');
        }
      } catch (error) {
        throw new Error(`Failed to authenticate user ${user.username}: ${error.message}`);
      }
    }
  }

  async runHappyPathTests() {
    this.log('🎯 RUNNING HAPPY PATH TESTS', 'info');
    
    await this.test('Create room successfully', async () => {
      const hostToken = this.tokens.get('Host');
      const response = await this.makeRequest('/rooms/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hostToken}` },
        body: TEST_CONFIG.ROOM_CONFIGS[0]
      });

      if (!response.success || !response.data.room) {
        throw new Error('Room creation failed');
      }

      this.rooms.push(response.data.room);
      this.log(`Room created: ${response.data.room.code}`, 'info');
    });

    await this.test('Join room successfully', async () => {
      if (this.rooms.length === 0) throw new Error('No room to join');
      
      const playerToken = this.tokens.get('Player1');
      const roomCode = this.rooms[0].code;
      
      const response = await this.makeRequest(`/rooms/join/${roomCode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${playerToken}` }
      });

      if (!response.success) {
        throw new Error('Room join failed');
      }
    });

    await this.test('Get room details', async () => {
      if (this.rooms.length === 0) throw new Error('No room available');
      
      const hostToken = this.tokens.get('Host');
      const roomId = this.rooms[0].id;
      
      const response = await this.makeRequest(`/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${hostToken}` }
      });

      if (!response.success || !response.data.participants) {
        throw new Error('Failed to get room details');
      }

      this.log(`Room has ${response.data.participants.length} participants`, 'info');
    });

    await this.test('Get available categories', async () => {
      const response = await this.makeRequest('/categories');
      
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error('Failed to get categories');
      }

      this.log(`Found ${response.data.length} categories`, 'info');
    });
  }

  async runEdgeCaseTests() {
    this.log('⚡ RUNNING EDGE CASE TESTS', 'info');

    await this.test('Create room with invalid data', async () => {
      const hostToken = this.tokens.get('Host');
      
      try {
        await this.makeRequest('/rooms/create', {
          method: 'POST',
          headers: { Authorization: `Bearer ${hostToken}` },
          body: { name: '', maxPlayers: -1 } // Invalid data
        });
        throw new Error('Should have failed with invalid data');
      } catch (error) {
        // Expected to fail
        if (error.message.includes('Should have failed')) {
          throw error;
        }
      }
    });

    await this.test('Join non-existent room', async () => {
      const playerToken = this.tokens.get('Player1');
      
      try {
        await this.makeRequest('/rooms/join/INVALID', {
          method: 'POST',
          headers: { Authorization: `Bearer ${playerToken}` }
        });
        throw new Error('Should have failed with invalid room code');
      } catch (error) {
        // Expected to fail
        if (error.message.includes('Should have failed')) {
          throw error;
        }
      }
    });

    await this.test('Access room without authentication', async () => {
      if (this.rooms.length === 0) throw new Error('No room available');
      
      const roomId = this.rooms[0].id;
      
      try {
        await this.makeRequest(`/rooms/${roomId}`);
        throw new Error('Should have failed without authentication');
      } catch (error) {
        // Expected to fail
        if (error.message.includes('Should have failed')) {
          throw error;
        }
      }
    });

    await this.test('Create multiple rooms simultaneously', async () => {
      const hostToken = this.tokens.get('Host');
      const promises = [];

      for (let i = 0; i < 3; i++) {
        promises.push(
          this.makeRequest('/rooms/create', {
            method: 'POST',
            headers: { Authorization: `Bearer ${hostToken}` },
            body: { ...TEST_CONFIG.ROOM_CONFIGS[0], name: `Concurrent Room ${i}` }
          })
        );
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      this.log(`${successful}/3 concurrent room creations successful`, 'info');
      
      if (successful === 0) {
        throw new Error('No concurrent room creation succeeded');
      }
    });
  }

  async runRealWorldTests() {
    this.log('🌍 RUNNING REAL-WORLD SCENARIO TESTS', 'info');

    await this.test('Multiple players join same room quickly', async () => {
      // Create a room for this test
      const hostToken = this.tokens.get('Host');
      const roomResponse = await this.makeRequest('/rooms/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hostToken}` },
        body: { ...TEST_CONFIG.ROOM_CONFIGS[1], name: 'Concurrent Join Test' }
      });

      if (!roomResponse.success) {
        throw new Error('Failed to create test room');
      }

      const roomCode = roomResponse.data.room.code;
      const joinPromises = [];

      // Multiple players try to join simultaneously
      for (const user of TEST_CONFIG.USERS.slice(0, 3)) {
        if (user.username === 'Host') continue;
        
        const token = this.tokens.get(user.username);
        joinPromises.push(
          this.makeRequest(`/rooms/join/${roomCode}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          })
        );
      }

      const results = await Promise.allSettled(joinPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      this.log(`${successful} players joined simultaneously`, 'info');
    });

    await this.test('Room capacity limits', async () => {
      const hostToken = this.tokens.get('Host');
      const smallRoomResponse = await this.makeRequest('/rooms/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hostToken}` },
        body: { name: 'Small Room', maxPlayers: 1, isPrivate: false }
      });

      if (!smallRoomResponse.success) {
        throw new Error('Failed to create small room');
      }

      const roomCode = smallRoomResponse.data.room.code;

      // Try to join with multiple players (should fail for excess)
      const player1Token = this.tokens.get('Player1');
      const player2Token = this.tokens.get('Player2');

      // First join should succeed
      const join1 = await this.makeRequest(`/rooms/join/${roomCode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${player1Token}` }
      });

      if (!join1.success) {
        throw new Error('First player join should succeed');
      }

      // Second join should fail (room full)
      try {
        await this.makeRequest(`/rooms/join/${roomCode}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${player2Token}` }
        });
        throw new Error('Second player join should have failed (room full)');
      } catch (error) {
        // Expected to fail
        if (error.message.includes('should have failed')) {
          throw error;
        }
      }
    });

    await this.test('Invalid authentication tokens', async () => {
      try {
        await this.makeRequest('/rooms/create', {
          method: 'POST',
          headers: { Authorization: 'Bearer invalid_token_here' },
          body: TEST_CONFIG.ROOM_CONFIGS[0]
        });
        throw new Error('Should have failed with invalid token');
      } catch (error) {
        // Expected to fail
        if (error.message.includes('Should have failed')) {
          throw error;
        }
      }
    });
  }

  async runSystemHealthTests() {
    this.log('🔍 RUNNING SYSTEM HEALTH TESTS', 'info');

    await this.test('Backend health check', async () => {
      const { stdout } = await execAsync('curl -s http://localhost:3001/health/ready');
      const response = JSON.parse(stdout);
      
      if (!response.success || !response.data.ready) {
        throw new Error('Backend health check failed');
      }
    });

    await this.test('Frontend accessibility', async () => {
      const { stdout } = await execAsync('curl -s -I http://localhost:3000');
      
      if (!stdout.includes('200 OK')) {
        throw new Error('Frontend not accessible');
      }
    });

    await this.test('Database connectivity', async () => {
      // Test through API that requires DB
      const response = await this.makeRequest('/categories');
      
      if (!response.success) {
        throw new Error('Database connectivity issue');
      }
    });

    await this.test('Socket.IO endpoint', async () => {
      const { stdout } = await execAsync('curl -s http://localhost:3001/socket.io/');
      
      if (!stdout.includes('socket.io') && !stdout.includes('polling')) {
        throw new Error('Socket.IO endpoint not responding');
      }
    });
  }

  async runPerformanceTests() {
    this.log('⚡ RUNNING PERFORMANCE TESTS', 'info');

    await this.test('API response time under load', async () => {
      const startTime = Date.now();
      const promises = [];

      // Make 10 concurrent requests
      for (let i = 0; i < 10; i++) {
        promises.push(this.makeRequest('/categories'));
      }

      await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      this.log(`10 concurrent requests completed in ${totalTime}ms`, 'info');
      
      if (totalTime > 5000) { // 5 seconds
        throw new Error(`Performance issue: ${totalTime}ms for 10 requests`);
      }
    });

    await this.test('Room creation under load', async () => {
      const hostToken = this.tokens.get('Host');
      const startTime = Date.now();
      const promises = [];

      // Create 5 rooms simultaneously
      for (let i = 0; i < 5; i++) {
        promises.push(
          this.makeRequest('/rooms/create', {
            method: 'POST',
            headers: { Authorization: `Bearer ${hostToken}` },
            body: { ...TEST_CONFIG.ROOM_CONFIGS[0], name: `Load Test Room ${i}` }
          })
        );
      }

      const results = await Promise.allSettled(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const successful = results.filter(r => r.status === 'fulfilled').length;

      this.log(`${successful}/5 rooms created in ${totalTime}ms`, 'info');
      
      if (successful < 3) {
        throw new Error('Too many room creation failures under load');
      }
    });
  }

  async runAllTests() {
    this.log('🚀 STARTING COMPREHENSIVE MULTIPLAYER GAME TESTING', 'info');
    
    try {
      await this.setupTestUsers();
      
      await this.runHappyPathTests();
      await this.runEdgeCaseTests();
      await this.runRealWorldTests();
      await this.runSystemHealthTests();
      await this.runPerformanceTests();
      
    } catch (error) {
      this.log(`Test setup failed: ${error.message}`, 'error');
    }

    // Print final results
    this.printResults();
  }

  printResults() {
    this.log('📊 TEST RESULTS SUMMARY', 'info');
    console.log('='.repeat(50));
    console.log(`✅ PASSED: ${this.testResults.passed}`);
    console.log(`❌ FAILED: ${this.testResults.failed}`);
    console.log(`📈 SUCCESS RATE: ${((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1)}%`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}`);
        console.log(`   Error: ${error.error}`);
      });
    }
    
    console.log('='.repeat(50));
  }
}

// Run the tests
if (require.main === module) {
  const tester = new MultplayerGameTester();
  tester.runAllTests().catch(console.error);
}

module.exports = MultplayerGameTester;
