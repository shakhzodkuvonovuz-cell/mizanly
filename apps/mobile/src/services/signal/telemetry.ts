/**
 * E2E encryption telemetry — operational metrics for debugging.
 *
 * STRICT POLICY: NEVER log key material, session state, plaintext, or nonces.
 * Only log: operation name, success/failure, duration, error type.
 *
 * These metrics help diagnose production issues:
 * - How many sessions fail to establish?
 * - What's the average X3DH latency?
 * - How many decrypt errors per day?
 * - Which error types are most common?
 */

/** Telemetry event types */
type E2EEvent =
  | 'session_established'
  | 'session_establishment_failed'
  | 'session_reset'
  | 'message_encrypted'
  | 'message_encrypt_failed' // F08-#8 FIX: Added — used by offline-queue.ts markMessageFailed
  | 'message_decrypted'
  | 'message_decrypt_failed'
  | 'group_message_encrypted'
  | 'group_message_decrypted'
  | 'group_message_decrypt_failed'
  | 'media_encrypted'
  | 'media_decrypted'
  | 'media_decrypt_failed'
  | 'prekey_replenished'
  | 'signed_prekey_rotated'
  | 'sender_key_distributed'
  | 'sender_key_rotated'
  | 'identity_key_changed'
  | 'safety_number_computed'
  | 'bundle_fetch_failed'
  | 'bundle_fetch_rate_limited'
  | 'pqxdh_fallback_classical'; // #496: PQXDH encapsulation failed, fell back to classical X3DH

interface E2ETelemetryData {
  event: E2EEvent;
  durationMs?: number;
  errorType?: string;
  metadata?: Record<string, string | number | boolean>;
}

/** In-memory counters for aggregation (flushed periodically) */
const counters = new Map<E2EEvent, number>();
const durations = new Map<E2EEvent, number[]>();

/**
 * Record an E2E telemetry event.
 * Safe to call from any signal/ module — never logs sensitive data.
 */
export function recordE2EEvent(data: E2ETelemetryData): void {
  // Increment counter
  counters.set(data.event, (counters.get(data.event) ?? 0) + 1);

  // Track duration
  if (data.durationMs !== undefined) {
    const list = durations.get(data.event) ?? [];
    list.push(data.durationMs);
    if (list.length > 100) list.shift(); // Keep last 100 for avg
    durations.set(data.event, list);
  }

  // Log errors — sanitized. NEVER log user IDs, conversation IDs,
  // key IDs, counter values, or any protocol state details.
  // Map specific error messages to generic codes.
  if (data.event.endsWith('_failed') || data.event === 'identity_key_changed') {
    const sanitizedType = sanitizeErrorType(data.errorType);
    console.warn(`[E2E] ${data.event}: ${sanitizedType}`);
    // Do NOT log metadata — it may contain PII (userIds, conversationIds)
  }
}

/**
 * Helper to measure async operation duration.
 */
export async function withTelemetry<T>(
  event: E2EEvent,
  fn: () => Promise<T>,
  metadata?: Record<string, string | number | boolean>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordE2EEvent({ event, durationMs: Date.now() - start, metadata });
    return result;
  } catch (err) {
    const failEvent = (event + '_failed') as E2EEvent;
    recordE2EEvent({
      event: event.endsWith('_failed') ? event : failEvent,
      durationMs: Date.now() - start,
      errorType: err instanceof Error ? err.message : 'unknown',
      metadata,
    });
    throw err;
  }
}

/**
 * Get aggregated telemetry snapshot (for Sentry breadcrumbs or analytics).
 * Returns only counts and averages — no sensitive data.
 */
export function getE2ETelemetrySnapshot(): Record<string, { count: number; avgDurationMs?: number }> {
  const snapshot: Record<string, { count: number; avgDurationMs?: number }> = {};
  for (const [event, count] of counters) {
    const durs = durations.get(event);
    snapshot[event] = {
      count,
      avgDurationMs: durs?.length ? durs.reduce((a, b) => a + b, 0) / durs.length : undefined,
    };
  }
  return snapshot;
}

/**
 * Sanitize error messages — strip user IDs, key IDs, counters, and
 * any protocol state from error strings before logging.
 */
function sanitizeErrorType(errorType?: string): string {
  if (!errorType) return 'UNKNOWN';
  // Map known sensitive patterns to generic codes
  if (errorType.includes('not found')) return 'RESOURCE_NOT_FOUND';
  if (errorType.includes('signature')) return 'SIGNATURE_FAILURE';
  if (errorType.includes('behind') || errorType.includes('counter')) return 'CHAIN_DESYNC';
  if (errorType.includes('tampered') || errorType.includes('decryption failed')) return 'DECRYPT_FAILURE';
  if (errorType.includes('session')) return 'SESSION_ERROR';
  if (errorType.includes('rate limit')) return 'RATE_LIMITED';
  if (errorType.includes('timeout') || errorType.includes('network')) return 'NETWORK_ERROR';
  if (errorType.includes('too large') || errorType.includes('gap')) return 'MESSAGE_GAP';
  // Fallback: first 30 chars only, no IDs
  return errorType.replace(/[a-z0-9_-]{20,}/gi, '[REDACTED]').slice(0, 50);
}

/** Reset counters (for testing). */
export function resetE2ETelemetry(): void {
  counters.clear();
  durations.clear();
}
