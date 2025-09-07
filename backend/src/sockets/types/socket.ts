import { UserRole } from '@prisma/client';
import { Socket } from 'socket.io';

// Base socket user interface
export interface SocketUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  jti: string;
}

// Extended socket interface with custom data
export interface ExtendedSocket extends Socket {
  data: {
    user: SocketUser;
    connectedAt: number;
    rateLimitWindow?: number;
    eventCount?: number;
    currentRooms: Set<string>;
    lastActivity: number;
  };
}

// Connection info for tracking
export interface ConnectionInfo {
  socketId: string;
  userId: string;
  username: string;
  connectedAt: number;
  lastActivity: number;
  ip: string;
  userAgent?: string;
  rooms: Set<string>;
}

// Room state interface
export interface RoomState {
  id: string;
  code: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  maxPlayers: number;
  currentPlayers: number;
  isPrivate: boolean;
  password?: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'PAUSED';
  settings: RoomSettings;
  participants: Map<string, RoomParticipant>;
  lastActivity: Date;
  quizId?: string;
  currentQuestionIndex?: number;
}

// Room settings
export interface RoomSettings {
  allowSpectators: boolean;
  allowReconnection: boolean;
  autoStart: boolean;
  questionTimeLimit: number;
  showCorrectAnswers: boolean;
  allowHints: boolean;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  requireApproval: boolean;
}

// Room participant info
export interface RoomParticipant {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: Date;
  role: 'HOST' | 'PLAYER' | 'SPECTATOR';
  isOnline: boolean;
  isReady?: boolean;
  score?: number;
  answers?: Map<number, string>;
  lastActivity: Date;
}

// Event payload types
export interface JoinRoomPayload {
  roomCode: string;
  password?: string;
}

export interface CreateRoomPayload {
  name: string;
  maxPlayers?: number;
  isPrivate?: boolean;
  password?: string;
  settings?: Partial<RoomSettings>;
}

export interface SendMessagePayload {
  roomId: string;
  message: string;
  type?: 'CHAT' | 'SYSTEM' | 'QUIZ';
}

export interface RoomMessagePayload {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  type: 'CHAT' | 'SYSTEM' | 'QUIZ';
  timestamp: Date;
}

// Event response types
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export type EventResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// Event validation schemas
export interface EventValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  custom?: (value: any) => boolean | string;
}

export interface EventSchema {
  [key: string]: EventValidationRule;
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  maxEvents: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (socket: ExtendedSocket) => string;
}

// Connection statistics
export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  totalRooms: number;
  activeRooms: number;
  messagesPerSecond: number;
  averageLatency: number;
  uptime: number;
}

// Room discovery
export interface RoomListEntry {
  id: string;
  code: string;
  name: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  hasPassword: boolean;
  status: string;
  createdAt: Date;
  gameType?: string;
}

// Presence tracking
export interface UserPresence {
  userId: string;
  username: string;
  isOnline: boolean;
  lastSeen: Date;
  currentRoom?: string;
  status: 'ONLINE' | 'IDLE' | 'OFFLINE';
}

// Error types
export class SocketError extends Error {
  public code: string;
  public details?: any;
  
  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'SocketError';
  }
}

// Event handler type
export type EventHandler<T = any> = (
  socket: ExtendedSocket,
  payload: T,
  callback?: (response: EventResponse) => void
) => Promise<void> | void;

// Event middleware type
export type EventMiddleware = (
  socket: ExtendedSocket,
  eventName: string,
  payload: any,
  next: (error?: Error) => void
) => void;
