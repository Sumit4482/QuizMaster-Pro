#!/usr/bin/env node
/**
 * Comprehensive Scoring System Test
 * Tests the complete scoring flow from answer submission to UI updates
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const WS_BASE = process.env.WS_BASE || 'ws://localhost:3001';

class ScoringSystemTest {
  constructor() {
    this.testResults = [];
    this.sockets = [];
    this.authTokens = [];
  }

  async runTests() {
    console.log('🧪 Starting Comprehensive Scoring System Tests');
    console.log('='.repeat(50));

    try {
      await this.test1_BasicScoring();
      await this.test2_RealtimeUpdates();  
      await this.test3_LeaderboardUpdates();
      await this.test4_OneVsOneScoring();
      await this.test5_MultiplayerScoring();
      
      this.printResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async test1_BasicScoring() {
    console.log('\n📊 Test 1: Basic Score Calculation');
    
    try {
      // Create test user and quiz session
      const user = await this.createTestUser();
      const session = await this.createQuizSession(user.token);
      
      console.log(`Created session: ${session.id}`);
      
      // Submit correct answer
      const correctAnswer = await this.submitAnswer(user.token, session.id, {
        questionId: session.currentQuestion.id,
        answer: session.currentQuestion.correctAnswer,
        timeTaken: 5000 // 5 seconds
      });
      
      console.log('✅ Correct answer response:', correctAnswer);
      
      // Verify score was calculated
      const updatedSession = await this.getQuizSession(user.token, session.id);
      console.log('📈 Updated score:', updatedSession.totalScore);
      
      if (updatedSession.totalScore > 0) {
        this.testResults.push({ test: 'Basic Scoring', status: 'PASS', score: updatedSession.totalScore });
      } else {
        this.testResults.push({ test: 'Basic Scoring', status: 'FAIL', error: 'Score was not updated' });
      }
      
    } catch (error) {
      console.error('❌ Basic scoring test failed:', error.message);
      this.testResults.push({ test: 'Basic Scoring', status: 'FAIL', error: error.message });
    }
  }

  async test2_RealtimeUpdates() {
    console.log('\n🔄 Test 2: Real-time Score Updates via WebSocket');
    
    try {
      const user = await this.createTestUser();
      const room = await this.createRoom(user.token);
      
      // Connect WebSocket
      const ws = await this.connectWebSocket(user.token);
      let scoreUpdateReceived = false;
      
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        console.log('📨 WebSocket message:', message.type);
        
        if (message.type === 'score_update' || (message.type === 'game_event' && message.data?.type === 'score_update')) {
          scoreUpdateReceived = true;
          console.log('✅ Score update received via WebSocket:', message);
        }
      });
      
      // Start game and submit answer
      const game = await this.startRoomGame(user.token, room.code);
      
      // Wait for score update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (scoreUpdateReceived) {
        this.testResults.push({ test: 'Real-time Updates', status: 'PASS' });
      } else {
        this.testResults.push({ test: 'Real-time Updates', status: 'FAIL', error: 'No score update received' });
      }
      
    } catch (error) {
      console.error('❌ Real-time updates test failed:', error.message);
      this.testResults.push({ test: 'Real-time Updates', status: 'FAIL', error: error.message });
    }
  }

  async test3_LeaderboardUpdates() {
    console.log('\n🏆 Test 3: Leaderboard Score Updates');
    
    try {
      const user1 = await this.createTestUser();
      const user2 = await this.createTestUser();
      
      const room = await this.createRoom(user1.token);
      await this.joinRoom(user2.token, room.code);
      
      // Start multiplayer game
      const game = await this.startRoomGame(user1.token, room.code);
      
      // Submit answers for both users
      const ws1 = await this.connectWebSocket(user1.token);
      const ws2 = await this.connectWebSocket(user2.token);
      
      let leaderboardUpdates = 0;
      
      const handleLeaderboard = (data) => {
        const message = JSON.parse(data);
        if (message.type === 'leaderboard_update' || message.type === 'leaderboard_personal') {
          leaderboardUpdates++;
          console.log('📊 Leaderboard update received');
        }
      };
      
      ws1.on('message', handleLeaderboard);
      ws2.on('message', handleLeaderboard);
      
      // Wait for leaderboard updates
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (leaderboardUpdates >= 2) {
        this.testResults.push({ test: 'Leaderboard Updates', status: 'PASS', updates: leaderboardUpdates });
      } else {
        this.testResults.push({ test: 'Leaderboard Updates', status: 'FAIL', error: `Only ${leaderboardUpdates} updates received` });
      }
      
    } catch (error) {
      console.error('❌ Leaderboard test failed:', error.message);
      this.testResults.push({ test: 'Leaderboard Updates', status: 'FAIL', error: error.message });
    }
  }

  async test4_OneVsOneScoring() {
    console.log('\n⚔️ Test 4: 1vs1 Game Scoring');
    
    try {
      const user1 = await this.createTestUser();
      const user2 = await this.createTestUser();
      
      const ws1 = await this.connectWebSocket(user1.token);
      const ws2 = await this.connectWebSocket(user2.token);
      
      let roundResultReceived = false;
      
      const handleRoundResult = (data) => {
        const message = JSON.parse(data);
        if (message.type === 'onevsone:round_result') {
          roundResultReceived = true;
          console.log('⚔️ 1vs1 round result received:', message.currentScores);
        }
      };
      
      ws1.on('message', handleRoundResult);
      ws2.on('message', handleRoundResult);
      
      // Start 1vs1 matchmaking
      ws1.send(JSON.stringify({ type: 'onevsone:find_match' }));
      ws2.send(JSON.stringify({ type: 'onevsone:find_match' }));
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      if (roundResultReceived) {
        this.testResults.push({ test: '1vs1 Scoring', status: 'PASS' });
      } else {
        this.testResults.push({ test: '1vs1 Scoring', status: 'FAIL', error: 'No round result received' });
      }
      
    } catch (error) {
      console.error('❌ 1vs1 scoring test failed:', error.message);
      this.testResults.push({ test: '1vs1 Scoring', status: 'FAIL', error: error.message });
    }
  }

  async test5_MultiplayerScoring() {
    console.log('\n👥 Test 5: Multiplayer Game Scoring');
    
    try {
      // Create 3 test users
      const users = await Promise.all([
        this.createTestUser(),
        this.createTestUser(), 
        this.createTestUser()
      ]);
      
      const room = await this.createRoom(users[0].token);
      
      // Join all users to room
      await Promise.all([
        this.joinRoom(users[1].token, room.code),
        this.joinRoom(users[2].token, room.code)
      ]);
      
      // Set all players ready
      await Promise.all(users.map(user => this.setPlayerReady(user.token, room.code)));
      
      // Start game
      const game = await this.startRoomGame(users[0].token, room.code);
      console.log('🎮 Multiplayer game started');
      
      // Connect WebSockets and monitor scores
      const sockets = await Promise.all(users.map(user => this.connectWebSocket(user.token)));
      
      let totalScoreUpdates = 0;
      const handleScoreUpdates = (data) => {
        const message = JSON.parse(data);
        if (message.type === 'score_update' || (message.type === 'game_event' && message.data?.type === 'score_update')) {
          totalScoreUpdates++;
          console.log(`📈 Score update ${totalScoreUpdates} received`);
        }
      };
      
      sockets.forEach(socket => socket.on('message', handleScoreUpdates));
      
      // Wait for score updates
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      if (totalScoreUpdates >= 3) {
        this.testResults.push({ test: 'Multiplayer Scoring', status: 'PASS', updates: totalScoreUpdates });
      } else {
        this.testResults.push({ test: 'Multiplayer Scoring', status: 'FAIL', error: `Only ${totalScoreUpdates} updates received` });
      }
      
    } catch (error) {
      console.error('❌ Multiplayer scoring test failed:', error.message);
      this.testResults.push({ test: 'Multiplayer Scoring', status: 'FAIL', error: error.message });
    }
  }

  // Helper methods
  async createTestUser() {
    const username = `testuser_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const email = `${username}@test.com`;
    
    const response = await axios.post(`${API_BASE}/api/auth/register`, {
      username,
      email,
      password: 'testpass123'
    });
    
    return { 
      ...response.data.user, 
      token: response.data.token 
    };
  }

  async createQuizSession(token) {
    const response = await axios.post(`${API_BASE}/api/quiz/start`, {
      categoryIds: [],
      difficultyLevels: [1, 2, 3],
      totalQuestions: 5
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data;
  }

  async submitAnswer(token, sessionId, answerData) {
    const response = await axios.post(`${API_BASE}/api/quiz/answer`, {
      sessionId,
      ...answerData
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data;
  }

  async getQuizSession(token, sessionId) {
    const response = await axios.get(`${API_BASE}/api/quiz/session/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data;
  }

  async createRoom(token) {
    const response = await axios.post(`${API_BASE}/api/rooms`, {
      name: `Test Room ${Date.now()}`,
      maxPlayers: 10,
      quizConfig: {
        totalQuestions: 5,
        timePerQuestion: 30
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data;
  }

  async joinRoom(token, roomCode) {
    const response = await axios.post(`${API_BASE}/api/rooms/${roomCode}/join`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data;
  }

  async setPlayerReady(token, roomCode) {
    const response = await axios.post(`${API_BASE}/api/rooms/${roomCode}/ready`, {
      isReady: true
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data;
  }

  async startRoomGame(token, roomCode) {
    const response = await axios.post(`${API_BASE}/api/rooms/${roomCode}/start`, {
      quizConfig: {
        totalQuestions: 5,
        timePerQuestion: 30
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    return response.data;
  }

  async connectWebSocket(token) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE}?token=${token}`);
      
      ws.on('open', () => {
        console.log('🔗 WebSocket connected');
        this.sockets.push(ws);
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        console.error('🔗 WebSocket error:', error.message);
        reject(error);
      });
      
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  }

  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('📋 SCORING SYSTEM TEST RESULTS');
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.status}`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.score) {
        console.log(`   Score: ${result.score}`);
      }
      if (result.updates) {
        console.log(`   Updates: ${result.updates}`);
      }
    });
    
    console.log('\n📊 Summary:');
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total:  ${this.testResults.length}`);
    
    if (failed === 0) {
      console.log('\n🎉 All scoring tests passed!');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Check the logs above.`);
      process.exit(1);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up resources...');
    
    // Close all WebSocket connections
    this.sockets.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    });
    
    console.log('✅ Cleanup completed');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ScoringSystemTest();
  tester.runTests().catch(console.error);
}

module.exports = ScoringSystemTest;
