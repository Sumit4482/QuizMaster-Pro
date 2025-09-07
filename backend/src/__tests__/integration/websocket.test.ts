import { Server } from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../app';
import { initializeSocketServer } from '../../sockets/socketServer';
import { generateAccessToken } from '../../utils/auth';
import { prisma } from '../../config/database';
import { UserRole } from '@prisma/client';

describe('WebSocket Integration', () => {
  let httpServer: Server;
  let serverSocket: any;
  let clientSocket: ClientSocket;
  let testUser: any;
  let accessToken: string;

  beforeAll(async () => {
    // Create test user
    testUser = await prisma.user.create({
      data: {
        username: 'websocket_test_user',
        email: 'websocket@test.com',
        password: 'hashedpassword',
        role: UserRole.USER,
        isActive: true,
      },
    });

    // Generate access token
    const tokenData = generateAccessToken({
      userId: testUser.id,
      email: testUser.email,
      username: testUser.username,
      role: testUser.role,
    });

    accessToken = tokenData.token;

    // Create session in database
    await prisma.userSession.create({
      data: {
        userId: testUser.id,
        tokenJti: tokenData.jti,
        expiresAt: tokenData.expiresAt,
        userAgent: 'test',
        ipAddress: '127.0.0.1',
      },
    });
  });

  afterAll(async () => {
    // Cleanup test user and sessions
    await prisma.userSession.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.user.delete({
      where: { id: testUser.id },
    });
  });

  beforeEach((done) => {
    // Create HTTP server
    const app = createApp();
    httpServer = new Server(app);
    
    // Initialize Socket.io server
    serverSocket = initializeSocketServer(httpServer);

    httpServer.listen(() => {
      const port = (httpServer.address() as any)?.port;
      
      // Create client socket
      clientSocket = Client(`http://localhost:${port}`, {
        auth: {
          token: accessToken,
        },
        transports: ['websocket'],
      });

      clientSocket.on('connect', done);
    });
  });

  afterEach(() => {
    if (httpServer) {
      httpServer.close();
    }
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  describe('Connection', () => {
    test('should connect with valid token', (done) => {
      expect(clientSocket.connected).toBe(true);
      done();
    });

    test('should receive connection confirmation', (done) => {
      clientSocket.on('connection:confirmed', (data) => {
        expect(data).toHaveProperty('socketId');
        expect(data).toHaveProperty('user');
        expect(data.user.id).toBe(testUser.id);
        done();
      });
    });

    test('should handle ping/pong', (done) => {
      clientSocket.emit('ping', { timestamp: Date.now() }, (response: any) => {
        expect(response.success).toBe(true);
        expect(response.data).toHaveProperty('pong', true);
        expect(response.data).toHaveProperty('timestamp');
        done();
      });
    });
  });

  describe('Room Management', () => {
    test('should create a room', (done) => {
      const roomData = {
        name: 'Test Room',
        maxPlayers: 5,
        isPrivate: false,
      };

      clientSocket.emit('room:create', roomData, (response: any) => {
        expect(response.success).toBe(true);
        expect(response.data).toHaveProperty('id');
        expect(response.data).toHaveProperty('code');
        expect(response.data.name).toBe(roomData.name);
        expect(response.data.maxPlayers).toBe(roomData.maxPlayers);
        done();
      });
    });

    test('should join a room by code', (done) => {
      const roomData = {
        name: 'Test Room for Join',
        maxPlayers: 5,
        isPrivate: false,
      };

      // First create a room
      clientSocket.emit('room:create', roomData, (createResponse: any) => {
        expect(createResponse.success).toBe(true);
        const roomCode = createResponse.data.code;

        // Then try to join it
        clientSocket.emit('room:join', { roomCode }, (joinResponse: any) => {
          expect(joinResponse.success).toBe(true);
          expect(joinResponse.data.code).toBe(roomCode);
          done();
        });
      });
    });

    test('should get public rooms list', (done) => {
      clientSocket.emit('rooms:list', { limit: 10 }, (response: any) => {
        expect(response.success).toBe(true);
        expect(Array.isArray(response.data)).toBe(true);
        done();
      });
    });

    test('should send and receive room messages', (done) => {
      const roomData = {
        name: 'Message Test Room',
        maxPlayers: 5,
        isPrivate: false,
      };

      // Create room first
      clientSocket.emit('room:create', roomData, (createResponse: any) => {
        expect(createResponse.success).toBe(true);
        const roomId = createResponse.data.id;

        // Listen for message
        clientSocket.on('message:received', (messageData: any) => {
          expect(messageData).toHaveProperty('id');
          expect(messageData).toHaveProperty('message', 'Hello, room!');
          expect(messageData).toHaveProperty('username', testUser.username);
          done();
        });

        // Send message
        clientSocket.emit('message:send', {
          roomId,
          message: 'Hello, room!',
        }, (sendResponse: any) => {
          expect(sendResponse.success).toBe(true);
        });
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid room code', (done) => {
      clientSocket.emit('room:join', { roomCode: 'INVALID' }, (response: any) => {
        expect(response.success).toBe(false);
        expect(response.error).toHaveProperty('code', 'ROOM_NOT_FOUND');
        done();
      });
    });

    test('should validate room creation data', (done) => {
      const invalidRoomData = {
        name: '', // Empty name should fail validation
        maxPlayers: 5,
      };

      clientSocket.emit('room:create', invalidRoomData, (response: any) => {
        expect(response.success).toBe(false);
        expect(response.error).toHaveProperty('code', 'VALIDATION_ERROR');
        done();
      });
    });
  });

  describe('Rate Limiting', () => {
    test('should allow normal request rates', (done) => {
      let completedRequests = 0;
      const totalRequests = 3;

      for (let i = 0; i < totalRequests; i++) {
        clientSocket.emit('rooms:list', { limit: 10 }, (response: any) => {
          expect(response.success).toBe(true);
          completedRequests++;
          
          if (completedRequests === totalRequests) {
            done();
          }
        });
      }
    });
  });
});
