/**
 * CallKit (iOS) + ConnectionService (Android) integration via react-native-callkeep.
 *
 * Handles:
 * - Displaying native incoming call UI
 * - Reporting outgoing calls to the system
 * - Answering/ending calls through the native call UI
 * - Audio session management
 * - PushKit VoIP push (iOS) — triggers displayIncomingCall from push payload
 */
import { Platform } from 'react-native';
import RNCallKeep, { type EventsPayload } from 'react-native-callkeep';
import { livekitApi } from '@/services/livekit';
import { disconnectActiveRoom } from '@/services/activeRoomRegistry';

// ── Types ──

interface CallInfo {
  callUUID: string;
  roomName: string;
  sessionId: string;
  callType: 'VOICE' | 'VIDEO';
  callerName: string;
  callerAvatarUrl?: string;
  handle: string;
  role: 'caller' | 'callee'; // [F7] Track role for leave vs delete on end
}

type CallKitEventHandler = {
  onAnswerCall?: (callInfo: CallInfo) => void;
  onEndCall?: (callUUID: string) => void;
  onMuteToggle?: (callUUID: string, muted: boolean) => void;
  onAudioRouteChange?: (output: string) => void;
};

// ── State ──

const activeCalls = new Map<string, CallInfo>();
let eventHandlers: CallKitEventHandler = {};
let isInitialized = false;
let callKitSetupFailed = false;

// [F12 fix] Queue for events that arrive before navigation is ready (cold start).
// When the app is killed and a VoIP push wakes it, handleDidLoadWithEvents fires
// BEFORE the React tree renders and the NavigationContainer mounts. If we call
// navigate() immediately, it crashes or silently fails (no navigation ref yet).
// We queue events here and replay them once setNavigationReady() is called.
let navigationReady = false;
const pendingEvents: Array<() => void> = [];

/**
 * Called once the navigation container is mounted and ready.
 * Replays any queued call events (answer/end) from cold start.
 */
export function setNavigationReady(): void {
  navigationReady = true;
  // Replay queued events in order
  while (pendingEvents.length > 0) {
    const event = pendingEvents.shift();
    if (event) event();
  }
}

/**
 * Execute a callback immediately if navigation is ready, otherwise queue it.
 */
function whenNavigationReady(fn: () => void): void {
  if (navigationReady) {
    fn();
  } else {
    pendingEvents.push(fn);
  }
}

// ── Setup ──

/**
 * Initialize CallKit/ConnectionService. Call once at app startup.
 */
export function initCallKit(): void {
  if (isInitialized) return;

  const options: Parameters<typeof RNCallKeep.setup>[0] = {
    ios: {
      appName: 'Mizanly',
      supportsVideo: true,
      maximumCallGroups: '1',
      maximumCallsPerCallGroup: '1',
      includesCallsInRecents: true,
    },
    android: {
      alertTitle: 'Permissions Required',
      alertDescription: 'Mizanly needs phone account access for call features',
      cancelButton: 'Cancel',
      okButton: 'OK',
      additionalPermissions: [],
      selfManaged: true,
      foregroundService: {
        channelId: 'mizanly_calls',
        channelName: 'Mizanly Calls',
        notificationTitle: 'Mizanly Call',
        notificationIcon: 'ic_notification',
      },
    },
  };

  RNCallKeep.setup(options).catch((err: Error) => {
    if (__DEV__) console.error('[CallKit] Setup failed:', err);
    callKitSetupFailed = true;
  });

  // Register event listeners
  RNCallKeep.addEventListener('answerCall', handleAnswerCall);
  RNCallKeep.addEventListener('endCall', handleEndCall);
  RNCallKeep.addEventListener('didPerformSetMutedCallAction', handleMuteToggle);
  RNCallKeep.addEventListener('didActivateAudioSession', handleAudioSessionActivated);
  RNCallKeep.addEventListener('didDeactivateAudioSession', handleAudioSessionDeactivated);
  RNCallKeep.addEventListener('didChangeAudioRoute', handleAudioRouteChange);
  RNCallKeep.addEventListener('didDisplayIncomingCall', handleDidDisplayIncomingCall);
  RNCallKeep.addEventListener('didLoadWithEvents', handleDidLoadWithEvents);

  if (Platform.OS === 'android') {
    RNCallKeep.setAvailable(true);
  }

  isInitialized = true;
}

/**
 * Register event handlers for call events.
 */
export function setCallKitHandlers(handlers: CallKitEventHandler): void {
  eventHandlers = handlers;
}

// ── Incoming Calls ──

/**
 * Display native incoming call UI.
 * Called when a push notification arrives for an incoming call.
 */
export function displayIncomingCall(params: {
  callUUID: string;
  roomName: string;
  sessionId: string;
  callType: 'VOICE' | 'VIDEO';
  callerName: string;
  callerHandle: string;
  callerAvatarUrl?: string;
}): void {
  const callInfo: CallInfo = {
    callUUID: params.callUUID,
    roomName: params.roomName,
    sessionId: params.sessionId,
    callType: params.callType,
    callerName: params.callerName,
    callerAvatarUrl: params.callerAvatarUrl,
    handle: params.callerHandle,
    role: 'callee', // [F7] Incoming calls = we are the callee
  };

  activeCalls.set(params.callUUID, callInfo);

  RNCallKeep.displayIncomingCall(
    params.callUUID,
    params.callerHandle,
    params.callerName,
    'generic',
    params.callType === 'VIDEO',
  );
}

// ── Outgoing Calls ──

/**
 * Report an outgoing call to the system.
 * Called when the user initiates a call.
 */
export function reportOutgoingCall(params: {
  callUUID: string;
  roomName: string;
  sessionId: string;
  callType: 'VOICE' | 'VIDEO';
  calleeName: string;
  calleeHandle: string;
}): void {
  const callInfo: CallInfo = {
    callUUID: params.callUUID,
    roomName: params.roomName,
    sessionId: params.sessionId,
    callType: params.callType,
    callerName: params.calleeName,
    handle: params.calleeHandle,
    role: 'caller', // [F7] Outgoing calls = we are the caller
  };

  activeCalls.set(params.callUUID, callInfo);

  RNCallKeep.startCall(
    params.callUUID,
    params.calleeHandle,
    params.calleeName,
    'generic',
    params.callType === 'VIDEO',
  );
}

/**
 * Report that the outgoing call has connected.
 */
export function reportCallConnected(callUUID: string): void {
  RNCallKeep.setCurrentCallActive(callUUID);
}

// ── Call Management ──

/**
 * End a call from the app side (not from native UI).
 */
export function endCall(callUUID: string): void {
  RNCallKeep.endCall(callUUID);
  activeCalls.delete(callUUID);
}

/**
 * End all active calls.
 */
export function endAllCalls(): void {
  RNCallKeep.endAllCalls();
  activeCalls.clear();
}

/**
 * Update muted state in the system.
 */
export function setMuted(callUUID: string, muted: boolean): void {
  if (Platform.OS === 'ios') {
    RNCallKeep.setMutedCall(callUUID, muted);
  }
}

/**
 * Get active call info by UUID.
 */
export function getCallInfo(callUUID: string): CallInfo | undefined {
  return activeCalls.get(callUUID);
}

/**
 * Check if there's an active call.
 */
export function hasActiveCall(): boolean {
  return activeCalls.size > 0;
}

/**
 * Generate a UUID for a new call.
 */
export function generateCallUUID(): string {
  // UUID v4 via CSPRNG — no Math.random() fallback per standing rules
  const bytes = new Uint8Array(16);
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('crypto.getRandomValues not available — cannot generate secure UUID');
  }
  crypto.getRandomValues(bytes);
  // Set version 4 and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── Event Handlers ──

function handleAnswerCall(data: EventsPayload['answerCall']): void {
  const callInfo = activeCalls.get(data.callUUID);
  if (callInfo && eventHandlers.onAnswerCall) {
    // [F12 fix] Queue the answer if navigation isn't ready yet (cold start)
    const handler = eventHandlers.onAnswerCall;
    const info = callInfo;
    whenNavigationReady(() => handler(info));
  }
}

function handleEndCall(data: EventsPayload['endCall']): void {
  const callUUID = data.callUUID;
  const callInfo = activeCalls.get(callUUID);
  activeCalls.delete(callUUID);

  // [F38 fix] Disconnect the LiveKit Room IMMEDIATELY — stops mic/camera streaming.
  // Without this, ending a call from the lock screen / notification center would leave
  // the Room connected and the microphone live. This was a CRITICAL privacy bug.
  disconnectActiveRoom();

  if (callInfo) {
    // [F7 fix] Callers end the room for everyone; callees leave gracefully.
    const apiCall = callInfo.role === 'caller'
      ? livekitApi.deleteRoom(callInfo.roomName)
      : livekitApi.leaveRoom(callInfo.roomName);
    apiCall.catch((err) => {
      if (__DEV__) console.warn('[CallKit] End call API failed:', err);
      // Room may already be closed — server cleanup via webhook
    });
  }

  if (eventHandlers.onEndCall) {
    eventHandlers.onEndCall(callUUID);
  }
}

function handleMuteToggle(data: EventsPayload['didPerformSetMutedCallAction']): void {
  if (eventHandlers.onMuteToggle) {
    eventHandlers.onMuteToggle(data.callUUID, data.muted);
  }
}

function handleAudioSessionActivated(): void {
  if (__DEV__) console.log('[CallKit] Audio session activated');
}

function handleAudioSessionDeactivated(): void {
  if (__DEV__) console.log('[CallKit] Audio session deactivated');
}

function handleAudioRouteChange(data: EventsPayload['didChangeAudioRoute']): void {
  if (eventHandlers.onAudioRouteChange) {
    eventHandlers.onAudioRouteChange(data.output);
  }
}

function handleDidDisplayIncomingCall(data: EventsPayload['didDisplayIncomingCall']): void {
  if (data.error) {
    if (__DEV__) console.error('[CallKit] Display incoming call error:', data.error, data.errorCode);
    // Remove the call from active list if display failed
    activeCalls.delete(data.callUUID);
  }
}

function handleDidLoadWithEvents(events: EventsPayload['didLoadWithEvents']): void {
  // Handle events that occurred while the app was killed
  // This is important for calls answered from the lock screen
  if (!events || events.length === 0) return;

  // [F19] Replay all queued events, including mute toggle
  for (const event of events) {
    if (event.name === 'RNCallKeepPerformAnswerCallAction') {
      handleAnswerCall(event.data as EventsPayload['answerCall']);
    } else if (event.name === 'RNCallKeepPerformEndCallAction') {
      handleEndCall(event.data as EventsPayload['endCall']);
    } else if (event.name === 'RNCallKeepDidPerformSetMutedCallAction') {
      handleMuteToggle(event.data as EventsPayload['didPerformSetMutedCallAction']);
    }
  }
}

// ── PushKit VoIP Push Handler ──

/**
 * Handle an incoming VoIP push notification payload.
 * Call this from the push notification handler when a call push arrives.
 *
 * Expected payload format:
 * {
 *   type: 'incoming_call',
 *   roomName: string,
 *   sessionId: string,
 *   callType: 'VOICE' | 'VIDEO',
 *   callerName: string,
 *   callerAvatarUrl?: string,
 * }
 */
export function handleIncomingCallPush(payload: Record<string, string>): void {
  if (payload.type !== 'incoming_call') return;

  const callUUID = generateCallUUID();

  // [F17 fix] callerHandle no longer sent in push payload (was PII leak).
  // Use callerName as the handle for CallKit display.
  displayIncomingCall({
    callUUID,
    roomName: payload.roomName,
    sessionId: payload.sessionId,
    callType: (payload.callType as 'VOICE' | 'VIDEO') || 'VOICE',
    callerName: payload.callerName || 'Unknown',
    callerHandle: payload.callerName || 'unknown',
    callerAvatarUrl: payload.callerAvatarUrl,
  });
}

// ── Cleanup ──

/**
 * Remove all event listeners. Call on app termination.
 */
export function teardownCallKit(): void {
  RNCallKeep.removeEventListener('answerCall');
  RNCallKeep.removeEventListener('endCall');
  RNCallKeep.removeEventListener('didPerformSetMutedCallAction');
  RNCallKeep.removeEventListener('didActivateAudioSession');
  RNCallKeep.removeEventListener('didDeactivateAudioSession');
  RNCallKeep.removeEventListener('didChangeAudioRoute');
  RNCallKeep.removeEventListener('didDisplayIncomingCall');
  RNCallKeep.removeEventListener('didLoadWithEvents');
  activeCalls.clear();
  isInitialized = false;
  navigationReady = false;
  pendingEvents.length = 0;
}
