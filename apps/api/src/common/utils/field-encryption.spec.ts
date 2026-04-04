import { randomBytes } from 'crypto';
import { encryptField, decryptField, hashToken, verifyToken } from './field-encryption';

describe('field-encryption', () => {
  const testKey = randomBytes(32).toString('hex'); // valid 32-byte key

  // ── AES-256-GCM Encryption ──────────────────────────────

  describe('encryptField', () => {
    it('should encrypt and produce enc: prefixed output', () => {
      const result = encryptField('my-secret-value', testKey);
      expect(result.startsWith('enc:')).toBe(true);
      const parts = result.split(':');
      expect(parts).toHaveLength(4);
      // parts: enc, iv(hex), authTag(hex), ciphertext(hex)
      expect(parts[1].length).toBe(24); // 12 bytes = 24 hex chars
      expect(parts[2].length).toBe(32); // 16 bytes = 32 hex chars
      expect(parts[3].length).toBeGreaterThan(0);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const a = encryptField('same-value', testKey);
      const b = encryptField('same-value', testKey);
      expect(a).not.toBe(b);
    });

    it('should return plain: prefix when no key provided', () => {
      const result = encryptField('my-secret', undefined);
      expect(result).toBe('plain:my-secret');
    });

    it('should throw on invalid key length', () => {
      expect(() => encryptField('value', 'tooshort')).toThrow('must be exactly 32 bytes');
    });

    it('should handle empty string plaintext', () => {
      const encrypted = encryptField('', testKey);
      const decrypted = decryptField(encrypted, testKey);
      expect(decrypted).toBe('');
    });

    it('should handle unicode plaintext', () => {
      const unicode = 'Hello! Arabic: \u0645\u0631\u062D\u0628\u0627 Emoji: \u{1F600}';
      const encrypted = encryptField(unicode, testKey);
      const decrypted = decryptField(encrypted, testKey);
      expect(decrypted).toBe(unicode);
    });
  });

  describe('decryptField', () => {
    it('should round-trip encrypt then decrypt', () => {
      const original = 'webhook-secret-abc123';
      const encrypted = encryptField(original, testKey);
      const decrypted = decryptField(encrypted, testKey);
      expect(decrypted).toBe(original);
    });

    it('should decrypt plain: prefixed values regardless of key', () => {
      expect(decryptField('plain:my-value', testKey)).toBe('my-value');
      expect(decryptField('plain:my-value', undefined)).toBe('my-value');
    });

    it('should return legacy unencrypted values as-is', () => {
      expect(decryptField('legacy-raw-secret', testKey)).toBe('legacy-raw-secret');
      expect(decryptField('legacy-raw-secret', undefined)).toBe('legacy-raw-secret');
    });

    it('should return null when enc: value but no key provided', () => {
      const encrypted = encryptField('value', testKey);
      expect(decryptField(encrypted, undefined)).toBeNull();
    });

    it('should return null when decrypting with wrong key', () => {
      const encrypted = encryptField('value', testKey);
      const wrongKey = randomBytes(32).toString('hex');
      expect(decryptField(encrypted, wrongKey)).toBeNull();
    });

    it('should return null for corrupted ciphertext', () => {
      expect(decryptField('enc:bad:data:here', testKey)).toBeNull();
    });

    it('should return null for enc: with insufficient parts', () => {
      expect(decryptField('enc:onlytwo', testKey)).toBeNull();
    });
  });

  // ── SHA-256 Token Hashing ────────────────────────────────

  describe('hashToken', () => {
    it('should produce consistent hex hash', () => {
      const hash = hashToken('my-token-123');
      expect(hash).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex
      expect(hashToken('my-token-123')).toBe(hash);
    });

    it('should produce different hashes for different inputs', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });
  });

  describe('verifyToken', () => {
    it('should verify matching token', () => {
      const hash = hashToken('my-token');
      expect(verifyToken('my-token', hash)).toBe(true);
    });

    it('should reject non-matching token', () => {
      const hash = hashToken('my-token');
      expect(verifyToken('wrong-token', hash)).toBe(false);
    });

    it('should reject when stored hash is invalid hex', () => {
      // Buffer.from with 'hex' silently drops invalid chars, so the lengths won't match
      expect(verifyToken('anything', 'not-hex')).toBe(false);
    });
  });
});
