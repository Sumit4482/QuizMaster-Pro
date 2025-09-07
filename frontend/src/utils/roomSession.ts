/**
 * Room Session Management
 * Handles storing and retrieving room session data for reconnection after page refresh
 */

interface RoomSessionData {
  roomId: string;
  roomCode: string;
  roomName: string;
  joinedAt: number;
  lastActivity: number;
}

const STORAGE_KEY = 'quizmaster_room_session';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Store current room session
 */
export function storeRoomSession(room: {
  id: string;
  code: string;
  name: string;
}): void {
  try {
    const sessionData: RoomSessionData = {
      roomId: room.id,
      roomCode: room.code,
      roomName: room.name,
      joinedAt: Date.now(),
      lastActivity: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.warn('Failed to store room session:', error);
  }
}

/**
 * Get stored room session
 */
export function getRoomSession(): RoomSessionData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const sessionData: RoomSessionData = JSON.parse(stored);
    
    // Check if session has expired
    if (Date.now() - sessionData.lastActivity > SESSION_TIMEOUT) {
      clearRoomSession();
      return null;
    }

    return sessionData;
  } catch (error) {
    console.warn('Failed to get room session:', error);
    clearRoomSession();
    return null;
  }
}

/**
 * Update last activity timestamp
 */
export function updateRoomActivity(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const sessionData: RoomSessionData = JSON.parse(stored);
    sessionData.lastActivity = Date.now();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.warn('Failed to update room activity:', error);
  }
}

/**
 * Clear room session
 */
export function clearRoomSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear room session:', error);
  }
}

/**
 * Check if currently in a room session
 */
export function isInRoomSession(): boolean {
  return getRoomSession() !== null;
}

/**
 * Check if the current page matches the stored room session
 */
export function isCurrentRoomSession(roomCode: string): boolean {
  const session = getRoomSession();
  return session?.roomCode === roomCode;
}
