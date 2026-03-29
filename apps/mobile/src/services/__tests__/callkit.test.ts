/**
 * Tests for CallKit service.
 *
 * react-native-callkeep requires native modules, so we mock it
 * and test the service's state management and logic.
 */

// Mock react-native-callkeep
const mockSetup = jest.fn().mockResolvedValue(undefined);
const mockDisplayIncomingCall = jest.fn();
const mockStartCall = jest.fn();
const mockEndCall = jest.fn();
const mockEndAllCalls = jest.fn();
const mockSetCurrentCallActive = jest.fn();
const mockSetMutedCall = jest.fn();
const mockSetAvailable = jest.fn();
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();

jest.mock('react-native-callkeep', () => ({
  __esModule: true,
  default: {
    setup: mockSetup,
    displayIncomingCall: mockDisplayIncomingCall,
    startCall: mockStartCall,
    endCall: mockEndCall,
    endAllCalls: mockEndAllCalls,
    setCurrentCallActive: mockSetCurrentCallActive,
    setMutedCall: mockSetMutedCall,
    setAvailable: mockSetAvailable,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('@/services/livekit', () => ({
  livekitApi: {
    deleteRoom: jest.fn().mockResolvedValue({ success: true }),
    leaveRoom: jest.fn().mockResolvedValue({ success: true }),
  },
}));

const mockDisconnectActiveRoom = jest.fn();
jest.mock('@/services/activeRoomRegistry', () => ({
  disconnectActiveRoom: (...args: unknown[]) => mockDisconnectActiveRoom(...args),
}));

import {
  initCallKit,
  displayIncomingCall,
  reportOutgoingCall,
  reportCallConnected,
  endCall,
  endAllCalls,
  setMuted,
  getCallInfo,
  hasActiveCall,
  generateCallUUID,
  handleIncomingCallPush,
  setCallKitHandlers,
  setNavigationReady,
  teardownCallKit,
} from '../callkit';

beforeEach(() => {
  jest.clearAllMocks();
  teardownCallKit(); // Reset state
});

describe('initCallKit', () => {
  it('calls RNCallKeep.setup', () => {
    initCallKit();
    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(mockSetup).toHaveBeenCalledWith(expect.objectContaining({
      ios: expect.objectContaining({ appName: 'Mizanly' }),
    }));
  });

  it('registers event listeners', () => {
    initCallKit();
    expect(mockAddEventListener).toHaveBeenCalledWith('answerCall', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith('endCall', expect.any(Function));
    expect(mockAddEventListener).toHaveBeenCalledWith('didPerformSetMutedCallAction', expect.any(Function));
  });

  it('only initializes once', () => {
    initCallKit();
    initCallKit();
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });
});

describe('displayIncomingCall', () => {
  it('displays incoming call via RNCallKeep', () => {
    initCallKit();
    displayIncomingCall({
      callUUID: 'uuid-1',
      roomName: 'room-1',
      sessionId: 'session-1',
      callType: 'VOICE',
      callerName: 'Alice',
      callerHandle: 'alice@example.com',
    });

    expect(mockDisplayIncomingCall).toHaveBeenCalledWith(
      'uuid-1', 'alice@example.com', 'Alice', 'generic', false,
    );
  });

  it('passes hasVideo=true for VIDEO calls', () => {
    initCallKit();
    displayIncomingCall({
      callUUID: 'uuid-2',
      roomName: 'room-2',
      sessionId: 'session-2',
      callType: 'VIDEO',
      callerName: 'Bob',
      callerHandle: 'bob',
    });

    expect(mockDisplayIncomingCall).toHaveBeenCalledWith(
      'uuid-2', 'bob', 'Bob', 'generic', true,
    );
  });

  it('stores call info', () => {
    initCallKit();
    displayIncomingCall({
      callUUID: 'uuid-3',
      roomName: 'room-3',
      sessionId: 'session-3',
      callType: 'VOICE',
      callerName: 'Charlie',
      callerHandle: 'charlie',
    });

    const info = getCallInfo('uuid-3');
    expect(info).toBeDefined();
    expect(info?.roomName).toBe('room-3');
    expect(info?.sessionId).toBe('session-3');
    expect(info?.callerName).toBe('Charlie');
    expect(info?.role).toBe('callee'); // [F7] Incoming = callee
  });
});

describe('reportOutgoingCall', () => {
  it('calls RNCallKeep.startCall', () => {
    initCallKit();
    reportOutgoingCall({
      callUUID: 'uuid-out',
      roomName: 'room-out',
      sessionId: 'session-out',
      callType: 'VOICE',
      calleeName: 'Dave',
      calleeHandle: 'dave',
    });

    expect(mockStartCall).toHaveBeenCalledWith(
      'uuid-out', 'dave', 'Dave', 'generic', false,
    );
  });

  it('stores outgoing call info', () => {
    initCallKit();
    reportOutgoingCall({
      callUUID: 'uuid-out2',
      roomName: 'room-out2',
      sessionId: 'session-out2',
      callType: 'VIDEO',
      calleeName: 'Eve',
      calleeHandle: 'eve',
    });

    expect(hasActiveCall()).toBe(true);
    expect(getCallInfo('uuid-out2')?.roomName).toBe('room-out2');
    expect(getCallInfo('uuid-out2')?.role).toBe('caller'); // [F7] Outgoing = caller
  });
});

describe('reportCallConnected', () => {
  it('calls setCurrentCallActive', () => {
    initCallKit();
    reportCallConnected('uuid-active');
    expect(mockSetCurrentCallActive).toHaveBeenCalledWith('uuid-active');
  });
});

describe('endCall', () => {
  it('calls RNCallKeep.endCall and removes from active', () => {
    initCallKit();
    displayIncomingCall({
      callUUID: 'uuid-end',
      roomName: 'room-end',
      sessionId: 'session-end',
      callType: 'VOICE',
      callerName: 'Test',
      callerHandle: 'test',
    });

    expect(hasActiveCall()).toBe(true);
    endCall('uuid-end');
    expect(mockEndCall).toHaveBeenCalledWith('uuid-end');
    expect(hasActiveCall()).toBe(false);
  });
});

describe('endAllCalls', () => {
  it('clears all active calls', () => {
    initCallKit();
    displayIncomingCall({
      callUUID: 'uuid-a',
      roomName: 'room-a',
      sessionId: 's-a',
      callType: 'VOICE',
      callerName: 'A',
      callerHandle: 'a',
    });

    expect(hasActiveCall()).toBe(true);
    endAllCalls();
    expect(mockEndAllCalls).toHaveBeenCalled();
    expect(hasActiveCall()).toBe(false);
  });
});

describe('setMuted', () => {
  it('calls setMutedCall on iOS', () => {
    initCallKit();
    setMuted('uuid-mute', true);
    expect(mockSetMutedCall).toHaveBeenCalledWith('uuid-mute', true);
  });
});

describe('generateCallUUID', () => {
  it('generates valid UUID v4 format', () => {
    const uuid = generateCallUUID();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique UUIDs', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      uuids.add(generateCallUUID());
    }
    expect(uuids.size).toBe(100);
  });
});

describe('handleIncomingCallPush', () => {
  it('displays incoming call from push payload', () => {
    initCallKit();
    handleIncomingCallPush({
      type: 'incoming_call',
      roomName: 'push-room',
      sessionId: 'push-session',
      callType: 'VIDEO',
      callerName: 'Push Caller',
      callerHandle: 'push-handle',
    });

    expect(mockDisplayIncomingCall).toHaveBeenCalledTimes(1);
    expect(hasActiveCall()).toBe(true);
  });

  it('ignores non-call push types', () => {
    initCallKit();
    handleIncomingCallPush({
      type: 'message',
      roomName: 'room',
      sessionId: 'session',
      callType: 'VOICE',
      callerName: 'Test',
      callerHandle: 'test',
    });

    expect(mockDisplayIncomingCall).not.toHaveBeenCalled();
    expect(hasActiveCall()).toBe(false);
  });
});

describe('getCallInfo', () => {
  it('returns undefined for unknown UUID', () => {
    expect(getCallInfo('nonexistent')).toBeUndefined();
  });
});

describe('teardownCallKit', () => {
  it('removes all event listeners', () => {
    initCallKit();
    teardownCallKit();
    expect(mockRemoveEventListener).toHaveBeenCalledWith('answerCall');
    expect(mockRemoveEventListener).toHaveBeenCalledWith('endCall');
    expect(hasActiveCall()).toBe(false);
  });

  it('allows re-initialization after teardown', () => {
    initCallKit();
    teardownCallKit();
    initCallKit();
    expect(mockSetup).toHaveBeenCalledTimes(2);
  });
});

describe('setCallKitHandlers', () => {
  it('onAnswerCall handler is invoked when navigation is ready', () => {
    const onAnswer = jest.fn();
    initCallKit();
    setNavigationReady(); // [F12] Navigation is ready in this test
    setCallKitHandlers({ onAnswerCall: onAnswer });

    // Simulate incoming call
    displayIncomingCall({
      callUUID: 'uuid-answer',
      roomName: 'room-answer',
      sessionId: 'session-answer',
      callType: 'VOICE',
      callerName: 'Caller',
      callerHandle: 'caller',
    });

    // Find the answerCall handler and invoke it
    const answerHandler = mockAddEventListener.mock.calls.find(
      (c: [string, unknown]) => c[0] === 'answerCall'
    )?.[1] as ((data: { callUUID: string }) => void) | undefined;
    expect(answerHandler).toBeDefined();
    answerHandler!({ callUUID: 'uuid-answer' });

    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({
      callUUID: 'uuid-answer',
      roomName: 'room-answer',
    }));
  });

  // [F12 fix validation] Cold start: answer event queued until navigation ready
  it('onAnswerCall is queued and replayed on cold start', () => {
    const onAnswer = jest.fn();
    initCallKit();
    // DO NOT call setNavigationReady — simulating cold start where nav isn't mounted yet
    setCallKitHandlers({ onAnswerCall: onAnswer });

    displayIncomingCall({
      callUUID: 'uuid-cold',
      roomName: 'room-cold',
      sessionId: 'session-cold',
      callType: 'VOICE',
      callerName: 'ColdCaller',
      callerHandle: 'cold',
    });

    // Trigger answer before navigation is ready
    const answerHandler = mockAddEventListener.mock.calls.find(
      (c: [string, unknown]) => c[0] === 'answerCall'
    )?.[1] as ((data: { callUUID: string }) => void) | undefined;
    answerHandler!({ callUUID: 'uuid-cold' });

    // Handler should NOT have been called yet (navigation not ready)
    expect(onAnswer).not.toHaveBeenCalled();

    // Now navigation becomes ready — queued event should replay
    setNavigationReady();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({
      callUUID: 'uuid-cold',
      roomName: 'room-cold',
    }));
  });

  it('onEndCall handler is invoked when call is ended', () => {
    const onEnd = jest.fn();
    initCallKit();
    setCallKitHandlers({ onEndCall: onEnd });

    displayIncomingCall({
      callUUID: 'uuid-end-handler',
      roomName: 'room-end',
      sessionId: 'session-end',
      callType: 'VOICE',
      callerName: 'Test',
      callerHandle: 'test',
    });

    const endHandler = mockAddEventListener.mock.calls.find(
      (c: [string, unknown]) => c[0] === 'endCall'
    )?.[1] as ((data: { callUUID: string }) => void) | undefined;
    expect(endHandler).toBeDefined();
    endHandler!({ callUUID: 'uuid-end-handler' });

    expect(onEnd).toHaveBeenCalledWith('uuid-end-handler');
  });
});
