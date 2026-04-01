import { api, withRetry } from './api';

const LIVEKIT_BASE = process.env.EXPO_PUBLIC_LIVEKIT_URL || 'https://livekit.mizanly.app/api/v1';

interface CreateRoomResponse {
  data: {
    id: string;
    callType: string;
    status: string;
    livekitRoomName: string;
    participants: Array<{ userId: string; role: string }>;
  };
  token: string;
  room: { name: string; sid: string };
  calleeIds: string[];
  e2eeKey: string;
  e2eeSalt: string; // [F1] Per-session ratchet salt (base64)
  success: boolean;
}

interface TokenResponse {
  token: string;
  e2eeKey: string;
  e2eeSalt: string; // [F1] Per-session ratchet salt (base64)
  success: boolean;
}

export const livekitApi = {
  // [F36 fix] No retry on room creation — it's a write operation.
  // If the first request succeeds but the response is lost (network timeout after server
  // processes), a retry would create a SECOND room. The user ends up with a phantom session.
  // The active-call check prevents the user from being in two calls, but the first session
  // would be orphaned until the stale-cleanup runs.
  createRoom: (data: {
    targetUserId?: string;
    participantIds?: string[];
    callType: 'VOICE' | 'VIDEO' | 'BROADCAST';
    conversationId?: string;
  }): Promise<CreateRoomResponse> =>
    api.post(`${LIVEKIT_BASE}/calls/rooms`, data),

  /** [H7] Critical path — callee needs token to join */
  getToken: (roomName: string, sessionId: string): Promise<TokenResponse> =>
    withRetry(() => api.post(`${LIVEKIT_BASE}/calls/token`, { roomName, sessionId }), 3, 300),

  deleteRoom: (roomId: string): Promise<{ success: boolean }> =>
    api.delete(`${LIVEKIT_BASE}/calls/rooms/${encodeURIComponent(roomId)}`),

  /** [F7] Leave a call without destroying it for other participants */
  leaveRoom: (roomId: string): Promise<{ success: boolean }> =>
    api.post(`${LIVEKIT_BASE}/calls/rooms/${encodeURIComponent(roomId)}/leave`, {}),

  getParticipants: (roomId: string) =>
    api.get<{ data: Array<{ identity: string; state: number; joinedAt: number }>; success: boolean }>(
      `${LIVEKIT_BASE}/calls/rooms/${encodeURIComponent(roomId)}/participants`
    ),

  getHistory: (cursor?: string) =>
    api.get<{ data: import('../types').CallSession[]; meta: { cursor: string | null; hasMore: boolean } }>(
      `${LIVEKIT_BASE}/calls/history${cursor ? `?cursor=${cursor}` : ''}`
    ),

  getActiveCall: () =>
    api.get<{ data: import('../types').CallSession | null; success: boolean }>(
      `${LIVEKIT_BASE}/calls/active`
    ),

  /** [F16] Get a specific session by ID — avoids returning wrong session in multi-call edge cases */
  getSession: (sessionId: string) =>
    api.get<{ data: import('../types').CallSession | null; success: boolean }>(
      `${LIVEKIT_BASE}/calls/sessions/${sessionId}`
    ),

  startRecording: (roomName: string, sessionId: string): Promise<{ egressId: string; success: boolean }> =>
    api.post(`${LIVEKIT_BASE}/calls/egress/start`, { roomName, sessionId }),

  stopRecording: (egressId: string, roomName: string): Promise<{ success: boolean }> =>
    api.post(`${LIVEKIT_BASE}/calls/egress/stop`, { egressId, roomName }),

  createIngress: (data: {
    roomName: string;
    sessionId: string;
    inputType: 'rtmp' | 'whip';
  }): Promise<{ ingressId: string; url: string; streamKey: string; success: boolean }> =>
    api.post(`${LIVEKIT_BASE}/calls/ingress/create`, data),

  deleteIngress: (ingressId: string, roomName: string): Promise<{ success: boolean }> =>
    api.delete(`${LIVEKIT_BASE}/calls/ingress/${ingressId}?roomName=${roomName}`),
};
