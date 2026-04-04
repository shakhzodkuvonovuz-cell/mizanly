/**
 * Field-level encryption utilities for sensitive database fields.
 *
 * - AES-256-GCM: reversible encryption for fields that need to be read back
 *   (e.g. webhook secrets, API keys, TOTP secrets)
 * - SHA-256 hashing: one-way hash for fields used as lookup tokens
 *   (e.g. webhook execution tokens — store hash, compare hash)
 *
 * Environment variable: FIELD_ENCRYPTION_KEY (32 bytes as 64-char hex)
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

// ── AES-256-GCM Encryption ────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns format: `enc:iv:authTag:ciphertext` (all hex-encoded).
 *
 * If no encryption key is provided, returns `plain:${plaintext}` for
 * graceful degradation (logged as warning at service init).
 */
export function encryptField(plaintext: string, encryptionKey: string | undefined): string {
  if (!encryptionKey) {
    return `plain:${plaintext}`;
  }
  const key = Buffer.from(encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars)');
  }
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted field.
 * Handles three stored formats:
 *   - `enc:iv:authTag:ciphertext` — AES-256-GCM encrypted
 *   - `plain:value` — unencrypted with prefix (graceful degradation)
 *   - raw value (no prefix) — legacy unencrypted, returned as-is
 *
 * Returns null if decryption fails (wrong key, corrupt data).
 */
export function decryptField(stored: string, encryptionKey: string | undefined): string | null {
  if (stored.startsWith('plain:')) {
    return stored.slice(6);
  }
  if (!stored.startsWith('enc:')) {
    // Legacy unencrypted value — return as-is
    return stored;
  }
  if (!encryptionKey) {
    return null;
  }
  try {
    const parts = stored.split(':');
    if (parts.length < 4) return null;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const key = Buffer.from(encryptionKey, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

// ── SHA-256 Token Hashing ──────────────────────────────────

/**
 * Hash a token with SHA-256 for storage.
 * Used for one-way fields where we only need to verify, not read back
 * (e.g. webhook execution tokens).
 *
 * Returns hex-encoded SHA-256 hash.
 */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Verify a plaintext token against a stored SHA-256 hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyToken(plaintext: string, storedHash: string): boolean {
  const computed = createHash('sha256').update(plaintext).digest();
  const stored = Buffer.from(storedHash, 'hex');
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}
