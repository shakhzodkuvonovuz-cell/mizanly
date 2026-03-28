/**
 * Tests for safety-numbers.ts — client-side safety number computation.
 */

import {
  computeSafetyNumberFromKeys,
  formatSafetyNumber,
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
