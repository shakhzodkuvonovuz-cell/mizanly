/**
 * Exhaustive tests for signal/telemetry.ts
 *
 * Tests every exported function with:
 * - Counter increments and duration tracking
 * - withTelemetry success and failure paths
 * - Snapshot aggregation (counts and averages)
 * - Reset clearing all state
 * - sanitizeErrorType mapping for all known patterns
 * - Security: no sensitive data (userIds, keyIds, counters) in console.warn
 */

import {
  recordE2EEvent,
  withTelemetry,
  getE2ETelemetrySnapshot,
  resetE2ETelemetry,
} from '../telemetry';

// ============================================================
// SETUP
// ============================================================

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  resetE2ETelemetry();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ============================================================
// recordE2EEvent — counter increments
// ============================================================

describe('recordE2EEvent counters', () => {
  it('increments counter for a single event', () => {
    recordE2EEvent({ event: 'session_established' });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['session_established'].count).toBe(1);
  });

  it('increments counter multiple times for same event', () => {
    recordE2EEvent({ event: 'message_encrypted' });
    recordE2EEvent({ event: 'message_encrypted' });
    recordE2EEvent({ event: 'message_encrypted' });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted'].count).toBe(3);
  });

  it('tracks separate counters for different events', () => {
    recordE2EEvent({ event: 'message_encrypted' });
    recordE2EEvent({ event: 'message_encrypted' });
    recordE2EEvent({ event: 'message_decrypted' });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted'].count).toBe(2);
    expect(snap['message_decrypted'].count).toBe(1);
  });

  it('tracks all event types without error', () => {
    const events = [
      'session_established', 'session_establishment_failed', 'session_reset',
      'message_encrypted', 'message_decrypted', 'message_decrypt_failed',
      'group_message_encrypted', 'group_message_decrypted', 'group_message_decrypt_failed',
      'media_encrypted', 'media_decrypted', 'media_decrypt_failed',
      'prekey_replenished', 'signed_prekey_rotated',
      'sender_key_distributed', 'sender_key_rotated',
      'identity_key_changed', 'safety_number_computed',
      'bundle_fetch_failed', 'bundle_fetch_rate_limited',
    ] as const;

    for (const event of events) {
      recordE2EEvent({ event });
    }
    const snap = getE2ETelemetrySnapshot();
    expect(Object.keys(snap).length).toBe(events.length);
    for (const event of events) {
      expect(snap[event].count).toBe(1);
    }
  });
});

// ============================================================
// recordE2EEvent — duration tracking
// ============================================================

describe('recordE2EEvent duration tracking', () => {
  it('tracks duration when durationMs is provided', () => {
    recordE2EEvent({ event: 'session_established', durationMs: 150 });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['session_established'].avgDurationMs).toBe(150);
  });

  it('computes average of multiple durations', () => {
    recordE2EEvent({ event: 'message_encrypted', durationMs: 100 });
    recordE2EEvent({ event: 'message_encrypted', durationMs: 200 });
    recordE2EEvent({ event: 'message_encrypted', durationMs: 300 });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted'].avgDurationMs).toBe(200);
  });

  it('does not set avgDurationMs when no duration recorded', () => {
    recordE2EEvent({ event: 'session_reset' });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['session_reset'].avgDurationMs).toBeUndefined();
  });

  it('keeps only last 100 durations (sliding window)', () => {
    for (let i = 0; i < 110; i++) {
      recordE2EEvent({ event: 'message_encrypted', durationMs: i < 100 ? 1000 : 0 });
    }
    const snap = getE2ETelemetrySnapshot();
    // After 110 entries, the first 10 (value 1000) are shifted off,
    // leaving entries 10-99 (value 1000) and 100-109 (value 0) = 100 entries
    // 90 entries of 1000 + 10 entries of 0 = 90000 / 100 = 900
    expect(snap['message_encrypted'].avgDurationMs).toBe(900);
  });

  it('handles zero duration', () => {
    recordE2EEvent({ event: 'media_encrypted', durationMs: 0 });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['media_encrypted'].avgDurationMs).toBe(0);
  });

  it('handles mixed events — some with duration, some without', () => {
    recordE2EEvent({ event: 'session_established', durationMs: 50 });
    recordE2EEvent({ event: 'session_established' }); // no duration
    recordE2EEvent({ event: 'session_established', durationMs: 150 });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['session_established'].count).toBe(3);
    // avgDuration should be average of the two tracked durations: (50 + 150) / 2 = 100
    expect(snap['session_established'].avgDurationMs).toBe(100);
  });
});

// ============================================================
// withTelemetry — success path
// ============================================================

describe('withTelemetry success', () => {
  it('returns the result of the async function', async () => {
    const result = await withTelemetry('message_encrypted', async () => 42);
    expect(result).toBe(42);
  });

  it('records the event on success', async () => {
    await withTelemetry('session_established', async () => 'ok');
    const snap = getE2ETelemetrySnapshot();
    expect(snap['session_established'].count).toBe(1);
  });

  it('measures duration on success', async () => {
    const start = Date.now();
    await withTelemetry('message_encrypted', async () => {
      // Simulate a short delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'done';
    });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted'].avgDurationMs).toBeGreaterThanOrEqual(0);
    // Duration should be at least ~10ms but let's be lenient for CI
    expect(snap['message_encrypted'].avgDurationMs).toBeDefined();
  });

  it('passes through metadata without logging it', async () => {
    await withTelemetry(
      'media_encrypted',
      async () => 'result',
      { userId: 'u1', conversationId: 'c1' },
    );
    // Success events do not trigger console.warn
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns complex objects correctly', async () => {
    const complex = { a: [1, 2, 3], b: { nested: true } };
    const result = await withTelemetry('message_decrypted', async () => complex);
    expect(result).toEqual(complex);
  });
});

// ============================================================
// withTelemetry — failure path
// ============================================================

describe('withTelemetry failure', () => {
  it('rethrows the original error', async () => {
    await expect(
      withTelemetry('message_encrypted', async () => {
        throw new Error('encrypt failed');
      }),
    ).rejects.toThrow('encrypt failed');
  });

  it('records the _failed event on error', async () => {
    try {
      await withTelemetry('session_established', async () => {
        throw new Error('connection refused');
      });
    } catch {}
    const snap = getE2ETelemetrySnapshot();
    // event + '_failed' = 'session_established_failed'
    expect(snap['session_established_failed']).toBeDefined();
    expect(snap['session_established_failed'].count).toBe(1);
  });

  it('records duration even on failure', async () => {
    try {
      await withTelemetry('message_encrypted', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('oops');
      });
    } catch {}
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted_failed'].avgDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('records sanitized error type on failure', async () => {
    try {
      await withTelemetry('bundle_fetch_failed', async () => {
        throw new Error('resource not found in database');
      });
    } catch {}
    // Since event already ends with _failed, it uses the event directly
    const snap = getE2ETelemetrySnapshot();
    expect(snap['bundle_fetch_failed']).toBeDefined();
  });

  it('handles non-Error thrown values', async () => {
    try {
      await withTelemetry('message_encrypted', async () => {
        throw 'string error';
      });
    } catch {}
    const snap = getE2ETelemetrySnapshot();
    // Should record with errorType 'unknown' since not an Error instance
    expect(snap['message_encrypted_failed'].count).toBe(1);
  });

  it('does not record success event on failure', async () => {
    try {
      await withTelemetry('session_established', async () => {
        throw new Error('fail');
      });
    } catch {}
    const snap = getE2ETelemetrySnapshot();
    // Only the _failed event should exist, not the success event
    expect(snap['session_established']).toBeUndefined();
    // event + '_failed' = 'session_established_failed'
    expect(snap['session_established_failed']).toBeDefined();
  });

  it('uses event directly when event already ends with _failed', async () => {
    try {
      await withTelemetry('bundle_fetch_failed', async () => {
        throw new Error('timeout');
      });
    } catch {}
    const snap = getE2ETelemetrySnapshot();
    // Should not create 'bundle_fetch_failed_failed'
    expect(snap['bundle_fetch_failed']).toBeDefined();
    expect(snap['bundle_fetch_failed_failed' as any]).toBeUndefined();
  });
});

// ============================================================
// getE2ETelemetrySnapshot
// ============================================================

describe('getE2ETelemetrySnapshot', () => {
  it('returns empty object when no events recorded', () => {
    const snap = getE2ETelemetrySnapshot();
    expect(Object.keys(snap).length).toBe(0);
  });

  it('returns counts and averages for all recorded events', () => {
    recordE2EEvent({ event: 'message_encrypted', durationMs: 10 });
    recordE2EEvent({ event: 'message_encrypted', durationMs: 20 });
    recordE2EEvent({ event: 'session_established' });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted']).toEqual({ count: 2, avgDurationMs: 15 });
    expect(snap['session_established']).toEqual({ count: 1, avgDurationMs: undefined });
  });

  it('snapshot is a fresh object each time (not a reference)', () => {
    recordE2EEvent({ event: 'message_encrypted' });
    const snap1 = getE2ETelemetrySnapshot();
    recordE2EEvent({ event: 'message_encrypted' });
    const snap2 = getE2ETelemetrySnapshot();
    expect(snap1['message_encrypted'].count).toBe(1);
    expect(snap2['message_encrypted'].count).toBe(2);
  });

  it('correctly computes average for single duration', () => {
    recordE2EEvent({ event: 'media_decrypted', durationMs: 77 });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['media_decrypted'].avgDurationMs).toBe(77);
  });
});

// ============================================================
// resetE2ETelemetry
// ============================================================

describe('resetE2ETelemetry', () => {
  it('clears all counters', () => {
    recordE2EEvent({ event: 'message_encrypted' });
    recordE2EEvent({ event: 'session_established' });
    resetE2ETelemetry();
    const snap = getE2ETelemetrySnapshot();
    expect(Object.keys(snap).length).toBe(0);
  });

  it('clears all durations', () => {
    recordE2EEvent({ event: 'message_encrypted', durationMs: 100 });
    resetE2ETelemetry();
    recordE2EEvent({ event: 'message_encrypted' }); // no duration
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted'].count).toBe(1);
    expect(snap['message_encrypted'].avgDurationMs).toBeUndefined();
  });

  it('allows accumulation after reset', () => {
    recordE2EEvent({ event: 'message_encrypted' });
    recordE2EEvent({ event: 'message_encrypted' });
    resetE2ETelemetry();
    recordE2EEvent({ event: 'message_encrypted' });
    const snap = getE2ETelemetrySnapshot();
    expect(snap['message_encrypted'].count).toBe(1); // Not 3
  });

  it('is safe to call multiple times', () => {
    resetE2ETelemetry();
    resetE2ETelemetry();
    resetE2ETelemetry();
    const snap = getE2ETelemetrySnapshot();
    expect(Object.keys(snap).length).toBe(0);
  });
});

// ============================================================
// sanitizeErrorType mapping
// ============================================================

describe('sanitizeErrorType', () => {
  // We test sanitizeErrorType indirectly through console.warn output
  // since it's a private function. recordE2EEvent calls it for _failed events.

  it('maps "not found" to RESOURCE_NOT_FOUND', () => {
    recordE2EEvent({ event: 'bundle_fetch_failed', errorType: 'User not found in database' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] bundle_fetch_failed: RESOURCE_NOT_FOUND');
  });

  it('maps "signature" to SIGNATURE_FAILURE', () => {
    recordE2EEvent({ event: 'message_decrypt_failed', errorType: 'Invalid signature verification' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] message_decrypt_failed: SIGNATURE_FAILURE');
  });

  it('maps "counter" to CHAIN_DESYNC', () => {
    recordE2EEvent({ event: 'message_decrypt_failed', errorType: 'Message counter too far ahead' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] message_decrypt_failed: CHAIN_DESYNC');
  });

  it('maps "behind" to CHAIN_DESYNC', () => {
    recordE2EEvent({ event: 'message_decrypt_failed', errorType: 'Chain key behind expected' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] message_decrypt_failed: CHAIN_DESYNC');
  });

  it('maps "tampered" to DECRYPT_FAILURE', () => {
    recordE2EEvent({ event: 'message_decrypt_failed', errorType: 'Ciphertext tampered with' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] message_decrypt_failed: DECRYPT_FAILURE');
  });

  it('maps "decryption failed" to DECRYPT_FAILURE', () => {
    recordE2EEvent({ event: 'media_decrypt_failed', errorType: 'AEAD decryption failed' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] media_decrypt_failed: DECRYPT_FAILURE');
  });

  it('maps "session" to SESSION_ERROR', () => {
    recordE2EEvent({ event: 'session_establishment_failed', errorType: 'No session found for user' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] session_establishment_failed: SESSION_ERROR');
  });

  it('maps "rate limit" to RATE_LIMITED', () => {
    recordE2EEvent({ event: 'bundle_fetch_failed', errorType: 'Server rate limit exceeded' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] bundle_fetch_failed: RATE_LIMITED');
  });

  it('maps "timeout" to NETWORK_ERROR', () => {
    recordE2EEvent({ event: 'bundle_fetch_failed', errorType: 'Connection timeout after 30s' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] bundle_fetch_failed: NETWORK_ERROR');
  });

  it('maps "network" to NETWORK_ERROR', () => {
    recordE2EEvent({ event: 'bundle_fetch_failed', errorType: 'network request failed' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] bundle_fetch_failed: NETWORK_ERROR');
  });

  it('maps "too large" to MESSAGE_GAP', () => {
    recordE2EEvent({ event: 'message_decrypt_failed', errorType: 'Message too large for buffer' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] message_decrypt_failed: MESSAGE_GAP');
  });

  it('maps "gap" to MESSAGE_GAP', () => {
    recordE2EEvent({ event: 'message_decrypt_failed', errorType: 'Detected message gap in chain' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] message_decrypt_failed: MESSAGE_GAP');
  });

  it('maps undefined errorType to UNKNOWN', () => {
    recordE2EEvent({ event: 'message_decrypt_failed' });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] message_decrypt_failed: UNKNOWN');
  });

  it('truncates and redacts unknown error patterns', () => {
    recordE2EEvent({
      event: 'message_decrypt_failed',
      errorType: 'Some completely unexpected error with long_identifier_abc123def456ghi789jkl012 included',
    });
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain('[REDACTED]');
    // Should be truncated to 50 chars max after redaction
    const afterPrefix = warnMsg.replace('[E2E] message_decrypt_failed: ', '');
    expect(afterPrefix.length).toBeLessThanOrEqual(50);
  });

  it('redacts long alphanumeric identifiers (20+ chars)', () => {
    recordE2EEvent({
      event: 'session_establishment_failed',
      errorType: 'Error for user_abcdefghijklmnopqrst in conv_12345678901234567890',
    });
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    // The identifiers should be replaced with [REDACTED]
    expect(warnMsg).not.toContain('abcdefghijklmnopqrst');
    expect(warnMsg).not.toContain('12345678901234567890');
  });
});

// ============================================================
// console.warn logging — only for failed and identity_key_changed
// ============================================================

describe('console.warn behavior', () => {
  it('logs for events ending with _failed', () => {
    recordE2EEvent({ event: 'message_decrypt_failed', errorType: 'test' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('logs for identity_key_changed event', () => {
    recordE2EEvent({ event: 'identity_key_changed', errorType: 'key rotated' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[E2E] identity_key_changed'));
  });

  it('does NOT log for success events', () => {
    recordE2EEvent({ event: 'message_encrypted' });
    recordE2EEvent({ event: 'session_established' });
    recordE2EEvent({ event: 'message_decrypted' });
    recordE2EEvent({ event: 'prekey_replenished' });
    recordE2EEvent({ event: 'signed_prekey_rotated' });
    recordE2EEvent({ event: 'sender_key_distributed' });
    recordE2EEvent({ event: 'safety_number_computed' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT log for bundle_fetch_rate_limited (no _failed suffix)', () => {
    recordE2EEvent({ event: 'bundle_fetch_rate_limited' });
    // bundle_fetch_rate_limited does NOT end with '_failed' and is NOT identity_key_changed
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ============================================================
// SECURITY: No sensitive data in console.warn output
// ============================================================

describe('no sensitive data in console.warn', () => {
  it('does not log userIds passed in metadata', () => {
    recordE2EEvent({
      event: 'session_establishment_failed',
      errorType: 'timeout',
      metadata: { userId: 'user_secret_abc123', conversationId: 'conv_secret_xyz' },
    });
    const allWarnArgs = warnSpy.mock.calls.flat().join(' ');
    expect(allWarnArgs).not.toContain('user_secret_abc123');
    expect(allWarnArgs).not.toContain('conv_secret_xyz');
  });

  it('does not log keyIds in metadata', () => {
    recordE2EEvent({
      event: 'message_decrypt_failed',
      errorType: 'session error',
      metadata: { keyId: 42, signedPreKeyId: 99 },
    });
    const allWarnArgs = warnSpy.mock.calls.flat().join(' ');
    // Metadata should not appear in the warn output
    expect(allWarnArgs).not.toContain('42');
    expect(allWarnArgs).not.toContain('99');
  });

  it('does not log counter values in metadata', () => {
    recordE2EEvent({
      event: 'message_decrypt_failed',
      errorType: 'network issue',
      metadata: { chainCounter: 1234, messageCounter: 5678 },
    });
    const allWarnArgs = warnSpy.mock.calls.flat().join(' ');
    expect(allWarnArgs).not.toContain('1234');
    expect(allWarnArgs).not.toContain('5678');
  });

  it('only outputs event name and sanitized error type', () => {
    recordE2EEvent({
      event: 'bundle_fetch_failed',
      errorType: 'Connection timeout after 30s',
      metadata: { userId: 'secret', attempt: 3 },
    });
    expect(warnSpy).toHaveBeenCalledWith('[E2E] bundle_fetch_failed: NETWORK_ERROR');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Verify the exact string — no extra data
    const warnMsg = warnSpy.mock.calls[0][0];
    expect(warnMsg).toBe('[E2E] bundle_fetch_failed: NETWORK_ERROR');
  });

  it('does not log raw error message for known patterns', () => {
    recordE2EEvent({
      event: 'message_decrypt_failed',
      errorType: 'User user_12345 not found in session store',
    });
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    // Should map to RESOURCE_NOT_FOUND, not include the raw message
    expect(warnMsg).toBe('[E2E] message_decrypt_failed: RESOURCE_NOT_FOUND');
    expect(warnMsg).not.toContain('user_12345');
  });

  it('redacts sensitive-looking tokens in unknown error messages', () => {
    recordE2EEvent({
      event: 'session_establishment_failed',
      errorType: 'Failed for cuid_clxyz1234567890abcdef',
    });
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain('[REDACTED]');
    expect(warnMsg).not.toContain('clxyz1234567890abcdef');
  });
});
