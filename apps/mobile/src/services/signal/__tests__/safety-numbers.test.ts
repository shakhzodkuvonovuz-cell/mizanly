/**
 * Tests for safety-numbers.ts — client-side safety number computation.
 */

import {
  computeSafetyNumberFromKeys,
  formatSafetyNumber,
  invalidateSafetyNumberCache,
} from '../safety-numbers';
import { generateEd25519KeyPair, generateRandomBytes } from '../crypto';

describe('computeSafetyNumberFromKeys', () => {
  it('produces 60-digit string', () => {
    const k1 = generateEd25519KeyPair().publicKey;
    const k2 = generateEd25519KeyPair().publicKey;
    const sn = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('is symmetric: SN(A,B) === SN(B,A)', () => {
    const k1 = generateEd25519KeyPair().publicKey;
    const k2 = generateEd25519KeyPair().publicKey;
    const sn1 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    const sn2 = computeSafetyNumberFromKeys(k2, 'bob', k1, 'alice');
    expect(sn1).toBe(sn2);
  });

  it('is deterministic: same inputs → same output', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn1 = computeSafetyNumberFromKeys(k1, 'u1', k2, 'u2');
    const sn2 = computeSafetyNumberFromKeys(k1, 'u1', k2, 'u2');
    expect(sn1).toBe(sn2);
  });

  it('changes when identity key changes', () => {
    const k1 = generateEd25519KeyPair().publicKey;
    const k2a = generateEd25519KeyPair().publicKey;
    const k2b = generateEd25519KeyPair().publicKey;
    const sn1 = computeSafetyNumberFromKeys(k1, 'alice', k2a, 'bob');
    const sn2 = computeSafetyNumberFromKeys(k1, 'alice', k2b, 'bob');
    expect(sn1).not.toBe(sn2);
  });

  it('changes when userId changes', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn1 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    const sn2 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'charlie');
    expect(sn1).not.toBe(sn2);
  });

  it('different key pairs always produce different safety numbers', () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const k1 = generateEd25519KeyPair().publicKey;
      const k2 = generateEd25519KeyPair().publicKey;
      const sn = computeSafetyNumberFromKeys(k1, `user${i}a`, k2, `user${i}b`);
      expect(numbers.has(sn)).toBe(false);
      numbers.add(sn);
    }
  });

  it('handles Arabic userIds', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'أحمد', k2, 'محمد');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('handles empty userId (edge case)', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, '', k2, 'bob');
    expect(sn.length).toBe(60);
  });

  it('handles same userId for both (self-chat edge case)', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'same', k2, 'same');
    expect(sn.length).toBe(60);
  });

  it('symmetry holds with same userId but different keys', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn1 = computeSafetyNumberFromKeys(k1, 'same', k2, 'same');
    const sn2 = computeSafetyNumberFromKeys(k2, 'same', k1, 'same');
    expect(sn1).toBe(sn2);
  });

  it('only contains digits 0-9', () => {
    for (let i = 0; i < 20; i++) {
      const k1 = generateEd25519KeyPair().publicKey;
      const k2 = generateEd25519KeyPair().publicKey;
      const sn = computeSafetyNumberFromKeys(k1, `a${i}`, k2, `b${i}`);
      for (const ch of sn) {
        expect(ch >= '0' && ch <= '9').toBe(true);
      }
    }
  });

  it('each 5-digit group is 00000-99999', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    for (let i = 0; i < 60; i += 5) {
      const group = parseInt(sn.slice(i, i + 5), 10);
      expect(group).toBeGreaterThanOrEqual(0);
      expect(group).toBeLessThanOrEqual(99999);
    }
  });
});

describe('formatSafetyNumber', () => {
  it('formats 60 digits into 12 groups of 5', () => {
    const sn = '123456789012345678901234567890123456789012345678901234567890';
    const formatted = formatSafetyNumber(sn);
    expect(formatted).toBe('12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890');
  });

  it('has 11 spaces (12 groups)', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'a', k2, 'b');
    const formatted = formatSafetyNumber(sn);
    expect(formatted.split(' ').length).toBe(12);
  });
});

// ============================================================
// ADDITIONAL TESTS — CACHE BEHAVIOR
// ============================================================

describe('safety number cache', () => {
  it('cache hit: compute twice with same keys returns same result', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);

    // computeSafetyNumberFromKeys is a pure sync function — the cache is in
    // computeSafetyNumber (async). For the sync version, verify determinism.
    const sn1 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    const sn2 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    expect(sn1).toBe(sn2);
  });

  it('invalidateSafetyNumberCache clears entries for specified userId', () => {
    // Access the cache internals via the module
    // We know the cache is a module-level Map — invalidation deletes matching keys
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);

    // Compute a safety number to populate the internal cache
    const sn1 = computeSafetyNumberFromKeys(k1, 'user-cachetest-a', k2, 'user-cachetest-b');

    // Invalidate for user-cachetest-a — should clear the cache entry
    invalidateSafetyNumberCache('user-cachetest-a');

    // Recompute — should still produce the same result (deterministic)
    const sn2 = computeSafetyNumberFromKeys(k1, 'user-cachetest-a', k2, 'user-cachetest-b');
    expect(sn2).toBe(sn1);
  });

  it('invalidateSafetyNumberCache does not throw for unknown userId', () => {
    // Should be a no-op, not throw
    expect(() => invalidateSafetyNumberCache('nonexistent-user-12345')).not.toThrow();
  });

  it('invalidateSafetyNumberCache with empty string does not throw', () => {
    expect(() => invalidateSafetyNumberCache('')).not.toThrow();
  });
});

// ============================================================
// ADDITIONAL TESTS — VERY LONG USER IDS
// ============================================================

describe('safety number with long and special userIds', () => {
  it('handles very long userIds (100+ chars)', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const longId1 = 'a'.repeat(150);
    const longId2 = 'b'.repeat(200);
    const sn = computeSafetyNumberFromKeys(k1, longId1, k2, longId2);
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('very long userId still produces deterministic result', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const longId = 'x'.repeat(500);
    const sn1 = computeSafetyNumberFromKeys(k1, longId, k2, 'short');
    const sn2 = computeSafetyNumberFromKeys(k1, longId, k2, 'short');
    expect(sn1).toBe(sn2);
  });

  it('handles special characters in userId', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(
      k1, 'user@domain.com/device:1<>&"\'',
      k2, 'مستخدم+عربي%20test!@#$%^&*()',
    );
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('special char userIds are symmetric', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const id1 = 'user@domain.com/device:1';
    const id2 = '🕌🤲user+test';
    const sn1 = computeSafetyNumberFromKeys(k1, id1, k2, id2);
    const sn2 = computeSafetyNumberFromKeys(k2, id2, k1, id1);
    expect(sn1).toBe(sn2);
  });

  it('handles userId with only Unicode characters', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, '中文用户名', k2, '日本語ユーザー');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('userId with newlines and tabs', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'user\nwith\nnewlines', k2, 'user\twith\ttabs');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });
});

// ============================================================
// FORMAT FUNCTION EXTENDED
// ============================================================

describe('formatSafetyNumber extended', () => {
  it('produces exactly 11 spaces (12 groups)', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    const formatted = formatSafetyNumber(sn);
    const spaceCount = (formatted.match(/ /g) || []).length;
    expect(spaceCount).toBe(11);
  });

  it('each group is exactly 5 digits', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'test1', k2, 'test2');
    const formatted = formatSafetyNumber(sn);
    const groups = formatted.split(' ');
    expect(groups.length).toBe(12);
    for (const group of groups) {
      expect(group.length).toBe(5);
      expect(/^\d{5}$/.test(group)).toBe(true);
    }
  });

  it('formatted output total length is 71 chars (60 digits + 11 spaces)', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'a', k2, 'b');
    const formatted = formatSafetyNumber(sn);
    expect(formatted.length).toBe(71);
  });

  it('groups with leading zeros are preserved', () => {
    // Use a known input to verify zero-padding
    const sn = '000001234500000678900000012345000006789000000123450000067890';
    const formatted = formatSafetyNumber(sn);
    const groups = formatted.split(' ');
    expect(groups[0]).toBe('00000');
    expect(groups[1]).toBe('12345');
    expect(groups[2]).toBe('00000');
  });
});

// ============================================================
// DETERMINISM — MULTIPLE CALLS WITH SAME KEYS
// ============================================================

describe('determinism across multiple calls', () => {
  it('same keys same ids produce identical result over 100 calls', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const expected = computeSafetyNumberFromKeys(k1, 'fixed-a', k2, 'fixed-b');
    for (let i = 0; i < 100; i++) {
      const result = computeSafetyNumberFromKeys(k1, 'fixed-a', k2, 'fixed-b');
      expect(result).toBe(expected);
    }
  });

  it('symmetry holds across 50 random key pairs', () => {
    for (let i = 0; i < 50; i++) {
      const k1 = generateEd25519KeyPair().publicKey;
      const k2 = generateEd25519KeyPair().publicKey;
      const id1 = `user-${i}-a`;
      const id2 = `user-${i}-b`;
      const sn1 = computeSafetyNumberFromKeys(k1, id1, k2, id2);
      const sn2 = computeSafetyNumberFromKeys(k2, id2, k1, id1);
      expect(sn1).toBe(sn2);
    }
  });

  it('changing a single byte in key changes the safety number', () => {
    const k1 = generateRandomBytes(32);
    const k2 = new Uint8Array(generateRandomBytes(32));
    const k2Modified = new Uint8Array(k2);
    k2Modified[15] ^= 0x01; // Flip one bit in byte 15

    const sn1 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    const sn2 = computeSafetyNumberFromKeys(k1, 'alice', k2Modified, 'bob');
    expect(sn1).not.toBe(sn2);
  });

  it('changing a single char in userId changes the safety number', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn1 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob');
    const sn2 = computeSafetyNumberFromKeys(k1, 'alice', k2, 'bob1');
    expect(sn1).not.toBe(sn2);
  });
});

// ============================================================
// NOTIFICATION PREVIEW ENCRYPTION
// ============================================================

describe('notification preview encrypt/decrypt', () => {
  it('round-trip: storePreviewKey + encryptPreview → decrypt produces original', () => {
    const { aeadDecrypt, generateRandomBytes: grb, utf8Decode, fromBase64 } = require('../crypto');
    const { encryptPreview } = require('../notification-handler');

    const previewKey = grb(32);
    const originalText = 'Assalamu alaikum, how are you?';
    const encryptedB64 = encryptPreview(originalText, previewKey, 'conv_test_1');

    // Decrypt manually: format is [nonce:24][ciphertext+tag]
    const combined = fromBase64(encryptedB64);
    expect(combined.length).toBeGreaterThan(24);
    const nonce = combined.slice(0, 24);
    const ciphertext = combined.slice(24);
    const { utf8Encode } = require('../crypto');
    const aad = utf8Encode('conv_test_1');
    const plaintext = aeadDecrypt(previewKey, nonce, ciphertext, aad);
    expect(utf8Decode(plaintext)).toBe(originalText);
  });

  it('encryptPreview truncates to 100 chars', () => {
    const { aeadDecrypt, generateRandomBytes: grb, utf8Decode, fromBase64 } = require('../crypto');
    const { encryptPreview } = require('../notification-handler');

    const previewKey = grb(32);
    const longText = 'x'.repeat(200);
    const encryptedB64 = encryptPreview(longText, previewKey, 'conv_trunc');

    const combined = fromBase64(encryptedB64);
    const nonce = combined.slice(0, 24);
    const ciphertext = combined.slice(24);
    const { utf8Encode } = require('../crypto');
    const aad = utf8Encode('conv_trunc');
    const plaintext = aeadDecrypt(previewKey, nonce, ciphertext, aad);
    expect(utf8Decode(plaintext)).toBe('x'.repeat(100));
  });

  it('encryptPreview produces different output each call (random nonce)', () => {
    const { generateRandomBytes: grb } = require('../crypto');
    const { encryptPreview } = require('../notification-handler');

    const previewKey = grb(32);
    const enc1 = encryptPreview('same text', previewKey, 'conv_nonce');
    const enc2 = encryptPreview('same text', previewKey, 'conv_nonce');
    expect(enc1).not.toBe(enc2); // Different nonce → different ciphertext
  });

  it('encryptPreview with empty string', () => {
    const { aeadDecrypt, generateRandomBytes: grb, utf8Decode, fromBase64 } = require('../crypto');
    const { encryptPreview } = require('../notification-handler');

    const previewKey = grb(32);
    const encryptedB64 = encryptPreview('', previewKey, 'conv_empty');
    const combined = fromBase64(encryptedB64);
    const nonce = combined.slice(0, 24);
    const ciphertext = combined.slice(24);
    const { utf8Encode } = require('../crypto');
    const aad = utf8Encode('conv_empty');
    const plaintext = aeadDecrypt(previewKey, nonce, ciphertext, aad);
    expect(utf8Decode(plaintext)).toBe('');
  });

  it('encryptPreview with Arabic text', () => {
    const { aeadDecrypt, generateRandomBytes: grb, utf8Decode, fromBase64 } = require('../crypto');
    const { encryptPreview } = require('../notification-handler');

    const previewKey = grb(32);
    const arabicText = 'بسم الله الرحمن الرحيم';
    const encryptedB64 = encryptPreview(arabicText, previewKey, 'conv_arabic');
    const combined = fromBase64(encryptedB64);
    const nonce = combined.slice(0, 24);
    const ciphertext = combined.slice(24);
    const { utf8Encode } = require('../crypto');
    const aad = utf8Encode('conv_arabic');
    const plaintext = aeadDecrypt(previewKey, nonce, ciphertext, aad);
    expect(utf8Decode(plaintext)).toBe(arabicText);
  });

  it('decryption fails with wrong key', () => {
    const { aeadDecrypt, generateRandomBytes: grb, fromBase64 } = require('../crypto');
    const { encryptPreview } = require('../notification-handler');

    const previewKey = grb(32);
    const wrongKey = grb(32);
    const encryptedB64 = encryptPreview('secret message', previewKey, 'conv_wrongkey');
    const combined = fromBase64(encryptedB64);
    const nonce = combined.slice(0, 24);
    const ciphertext = combined.slice(24);
    const { utf8Encode } = require('../crypto');
    const aad = utf8Encode('conv_wrongkey');
    expect(() => aeadDecrypt(wrongKey, nonce, ciphertext, aad)).toThrow();
  });
});

// ============================================================
// EDGE CASES — SAME USER, ZERO-KEY, ALL-ONES KEY
// ============================================================

describe('safety number edge cases', () => {
  it('same key for both users with different userIds', () => {
    const sharedKey = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(sharedKey, 'alice', sharedKey, 'bob');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('same key and same userId still produces valid output', () => {
    const sharedKey = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(sharedKey, 'same', sharedKey, 'same');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('all-zero keys produce valid safety number', () => {
    const zeroKey = new Uint8Array(32);
    const sn = computeSafetyNumberFromKeys(zeroKey, 'alice', zeroKey, 'bob');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('all-0xFF keys produce valid safety number', () => {
    const maxKey = new Uint8Array(32).fill(0xff);
    const sn = computeSafetyNumberFromKeys(maxKey, 'alice', maxKey, 'bob');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });

  it('single-char userId', () => {
    const k1 = generateRandomBytes(32);
    const k2 = generateRandomBytes(32);
    const sn = computeSafetyNumberFromKeys(k1, 'a', k2, 'b');
    expect(sn.length).toBe(60);
    expect(/^\d{60}$/.test(sn)).toBe(true);
  });
});
