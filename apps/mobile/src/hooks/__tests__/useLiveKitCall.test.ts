/**
 * Tests for useLiveKitCall utility functions.
 *
 * Tests the REAL exported functions, not local copies.
 * The hook itself requires native modules (tested on device).
 */

// Mock native modules that aren't available in Jest
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock('livekit-client', () => ({
  Room: jest.fn(),
  RoomEvent: {},
  Track: { Source: { Camera: 'camera' } },
  LocalParticipant: jest.fn(),
  RemoteParticipant: jest.fn(),
  DisconnectReason: {},
}));
jest.mock('@livekit/react-native', () => ({
  AudioSession: { startAudioSession: jest.fn(), stopAudioSession: jest.fn(), setAppleAudioConfiguration: jest.fn() },
  RNE2EEManager: jest.fn(),
  RNKeyProvider: jest.fn(),
}));
jest.mock('@/services/livekit', () => ({
  livekitApi: {
    createRoom: jest.fn(),
    getToken: jest.fn(),
    deleteRoom: jest.fn(),
    getActiveCall: jest.fn(),
  },
}));
jest.mock('@/services/callkit', () => ({
  generateCallUUID: jest.fn(() => 'mock-uuid'),
  reportOutgoingCall: jest.fn(),
  reportCallConnected: jest.fn(),
  endCall: jest.fn(),
}));
jest.mock('@livekit/react-native-krisp-noise-filter', () => ({
  KrispNoiseFilter: jest.fn(),
  isKrispNoiseFilterSupported: jest.fn(() => false),
}));
// activeRoomRegistry has zero native deps — use the REAL implementation for testing
import {
  registerActiveRoomCleanup,
  clearActiveRoomCleanup,
  disconnectActiveRoom,
} from '@/services/activeRoomRegistry';

import { base64ToBytes, deriveVerificationEmojis, SAS_EMOJIS } from '../useLiveKitCall';

describe('base64ToBytes', () => {
  it('decodes empty string', () => {
    const result = base64ToBytes('');
    expect(result.length).toBe(0);
  });

  it('decodes "SGVsbG8=" to "Hello"', () => {
    const result = base64ToBytes('SGVsbG8=');
    expect(String.fromCharCode(...result)).toBe('Hello');
  });

  it('decodes "TWl6YW5seQ==" to "Mizanly"', () => {
    const result = base64ToBytes('TWl6YW5seQ==');
    expect(String.fromCharCode(...result)).toBe('Mizanly');
  });

  it('handles base64 without padding', () => {
    const result = base64ToBytes('SGVsbG8');
    expect(String.fromCharCode(...result)).toBe('Hello');
  });

  it('decodes 32 zero bytes correctly', () => {
    const base64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const result = base64ToBytes(base64);
    expect(result.length).toBe(32);
    for (const b of result) {
      expect(b).toBe(0);
    }
  });

  it('decodes specific byte values', () => {
    const result = base64ToBytes('AQID'); // [1, 2, 3]
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(3);
  });

  it('decodes single byte', () => {
    const result = base64ToBytes('QQ=='); // 'A' = 65
    expect(result.length).toBe(1);
    expect(result[0]).toBe(65);
  });

  it('round-trips with Node Buffer (correctness check)', () => {
    const original = Buffer.from([0, 1, 127, 128, 254, 255]);
    const b64 = original.toString('base64');
    const decoded = base64ToBytes(b64);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('handles whitespace in input', () => {
    const result = base64ToBytes('SG Vs\nbG8=');
    expect(String.fromCharCode(...result)).toBe('Hello');
  });

  it('handles all 0xFF bytes', () => {
    const original = Buffer.alloc(32, 0xFF);
    const b64 = original.toString('base64');
    const decoded = base64ToBytes(b64);
    expect(decoded.length).toBe(32);
    for (const b of decoded) {
      expect(b).toBe(0xFF);
    }
  });
});

describe('SAS_EMOJIS', () => {
  it('has exactly 32 emojis', () => {
    expect(SAS_EMOJIS.length).toBe(32);
  });

  it('has no duplicates', () => {
    const unique = new Set(SAS_EMOJIS);
    expect(unique.size).toBe(SAS_EMOJIS.length);
  });

  it('all entries are non-empty strings', () => {
    for (const emoji of SAS_EMOJIS) {
      expect(typeof emoji).toBe('string');
      expect(emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveVerificationEmojis', () => {
  it('returns exactly 7 emojis', () => {
    const result = deriveVerificationEmojis('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(result.length).toBe(7);
  });

  it('all emojis are from SAS_EMOJIS set', () => {
    const result = deriveVerificationEmojis('dGVzdGtleTEyMzQ1Njc4OTAxMjM0NTY3ODkw');
    for (const emoji of result) {
      expect(SAS_EMOJIS).toContain(emoji);
    }
  });

  it('is deterministic — same key always produces same emojis', () => {
    const key = 'c2hhcmVkLWtleS0xMjM0NTY3ODkwMTIzNDU2Nzg5MA==';
    expect(deriveVerificationEmojis(key)).toEqual(deriveVerificationEmojis(key));
  });

  it('different keys produce different emojis', () => {
    const all_zeros = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const all_ones = '////////////////////////////////////w==';
    expect(deriveVerificationEmojis(all_zeros)).not.toEqual(deriveVerificationEmojis(all_ones));
  });

  it('handles 1-byte key', () => {
    const result = deriveVerificationEmojis('QQ==');
    expect(result.length).toBe(7);
    for (const emoji of result) {
      expect(SAS_EMOJIS).toContain(emoji);
    }
  });

  it('handles typical 32-byte random key', () => {
    // Simulate what the Go server generates
    const randomKey = Buffer.from(Array.from({ length: 32 }, (_, i) => i * 8 + 3)).toString('base64');
    const result = deriveVerificationEmojis(randomKey);
    expect(result.length).toBe(7);
  });

  it('uses full 16-bit values for better distribution', () => {
    // With 32 emojis and 16-bit values, distribution should be ~even
    // Generate 100 random keys and check emoji frequency
    const freq = new Map<string, number>();
    for (let trial = 0; trial < 100; trial++) {
      const key = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('base64');
      const emojis = deriveVerificationEmojis(key);
      for (const e of emojis) {
        freq.set(e, (freq.get(e) || 0) + 1);
      }
    }
    // With 700 emoji slots across 32 options, each should appear roughly 21 times
    // Allow wide tolerance since sample is small
    expect(freq.size).toBeGreaterThan(20); // At least 20 of 32 emojis used
  });
});

// [F5 fix validation] Key material zeroing
describe('F5: key material zeroing', () => {
  it('base64ToBytes returns a mutable Uint8Array that can be zeroed', () => {
    const key = base64ToBytes('dGVzdGtleTEyMzQ1Njc4OTAxMjM0NTY3ODkw');
    expect(key.length).toBeGreaterThan(0);
    const firstByte = key[0];
    expect(firstByte).not.toBe(0);

    // Zero it
    key.fill(0);
    for (const b of key) {
      expect(b).toBe(0);
    }
  });

  it('zeroing does not affect independently decoded copies', () => {
    const b64 = 'AQIDBAUG';
    const copy1 = base64ToBytes(b64);
    const copy2 = base64ToBytes(b64);
    copy1.fill(0);

    // copy2 should still have original data
    expect(copy2[0]).toBe(1);
    expect(copy2[1]).toBe(2);
  });
});

// [F33/F38 fix] Test the active room cleanup registry (zero-dependency module)
describe('activeRoomRegistry', () => {
  beforeEach(() => {
    clearActiveRoomCleanup();
  });

  it('disconnectActiveRoom calls registered cleanup', () => {
    const cleanup = jest.fn();
    registerActiveRoomCleanup(cleanup);
    disconnectActiveRoom();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('disconnectActiveRoom is no-op when no cleanup registered', () => {
    // Should not throw
    disconnectActiveRoom();
  });

  it('disconnectActiveRoom clears the cleanup after calling it', () => {
    const cleanup = jest.fn();
    registerActiveRoomCleanup(cleanup);
    disconnectActiveRoom();
    disconnectActiveRoom(); // second call should be no-op
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('clearActiveRoomCleanup prevents cleanup from firing', () => {
    const cleanup = jest.fn();
    registerActiveRoomCleanup(cleanup);
    clearActiveRoomCleanup();
    disconnectActiveRoom();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('registering a new cleanup replaces the old one', () => {
    const cleanup1 = jest.fn();
    const cleanup2 = jest.fn();
    registerActiveRoomCleanup(cleanup1);
    registerActiveRoomCleanup(cleanup2);
    disconnectActiveRoom();
    expect(cleanup1).not.toHaveBeenCalled();
    expect(cleanup2).toHaveBeenCalledTimes(1);
  });
});
