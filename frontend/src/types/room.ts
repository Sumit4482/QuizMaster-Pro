// Room types for frontend

export type RoomStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'PAUSED';

export type ParticipantRole = 'HOST' | 'PLAYER' | 'SPECTATOR';

export interface RoomParticipant {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: Date;
  role: ParticipantRole;
  isOnline: boolean;
  isReady?: boolean;
  score?: number;
  answers?: Map<number, string>;
  lastActivity: Date;
}

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

export interface Room {
  id: string;
  code: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  maxPlayers: number;
  currentPlayers: number;
  isPrivate: boolean;
  password?: string;
  status: RoomStatus;
  settings: RoomSettings;
  participants: Map<string, RoomParticipant>;
  lastActivity: Date;
  quizId?: string;
  currentQuestionIndex?: number;
}

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

export interface CreateRoomPayload {
  name: string;
  maxPlayers?: number;
  isPrivate?: boolean;
  password?: string;
  settings?: Partial<RoomSettings>;
}

export interface JoinRoomPayload {
  roomCode: string;
  password?: string;
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
