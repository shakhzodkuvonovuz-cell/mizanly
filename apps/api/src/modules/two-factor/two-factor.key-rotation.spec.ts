import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import {
  TwoFactorService,
  encryptSecret,
  tryDecryptSecret,
  decryptSecretWithFallback,
} from './two-factor.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

import * as Sentry from '@sentry/node';

// Two distinct 32-byte hex keys for testing rotation
const KEY_A = randomBytes(32).toString('hex');
const KEY_B = randomBytes(32).toString('hex');
const PLAINTEXT_SECRET = 'JBSWY3DPEHPK3PXP'; // valid base32 TOTP secret

describe('TOTP encryption helpers (pure functions)', () => {
  describe('encryptSecret', () => {
    it('should encrypt with key and produce enc: prefixed output', () => {
      const result = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      expect(result.startsWith('enc:')).toBe(true);
      const parts = result.split(':');
      expect(parts).toHaveLength(4); // enc, iv, authTag, ciphertext
    });

    it('should produce plain: prefix when no key is provided', () => {
      const result = encryptSecret(PLAINTEXT_SECRET, undefined);
      expect(result).toBe(`plain:${PLAINTEXT_SECRET}`);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const a = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      const b = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      expect(a).not.toBe(b); // different IVs
    });
  });

  describe('tryDecryptSecret', () => {
    it('should decrypt enc: ciphertext with correct key', () => {
      const encrypted = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      const result = tryDecryptSecret(encrypted, KEY_A);
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should return null for enc: ciphertext with wrong key', () => {
      const encrypted = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      const result = tryDecryptSecret(encrypted, KEY_B);
      expect(result).toBeNull();
    });

    it('should return null when key is undefined and value is enc:', () => {
      const encrypted = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      const result = tryDecryptSecret(encrypted, undefined);
      expect(result).toBeNull();
    });

    it('should return plaintext for plain: prefixed values', () => {
      const result = tryDecryptSecret(`plain:${PLAINTEXT_SECRET}`, KEY_A);
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should return plaintext for plain: even with undefined key', () => {
      const result = tryDecryptSecret(`plain:${PLAINTEXT_SECRET}`, undefined);
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should return as-is for legacy unformatted values', () => {
      const result = tryDecryptSecret(PLAINTEXT_SECRET, KEY_A);
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should return as-is for legacy unformatted values with undefined key', () => {
      const result = tryDecryptSecret(PLAINTEXT_SECRET, undefined);
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should return null for corrupted enc: data', () => {
      const result = tryDecryptSecret('enc:bad:data:here', KEY_A);
      expect(result).toBeNull();
    });
  });

  describe('decryptSecretWithFallback', () => {
    it('should decrypt with current key first', () => {
      const encrypted = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      const result = decryptSecretWithFallback(encrypted, KEY_A, KEY_B);
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should fall back to old key when current key fails', () => {
      const encrypted = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      // current key is KEY_B (wrong), old key is KEY_A (correct)
      const result = decryptSecretWithFallback(encrypted, KEY_B, KEY_A);
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should throw when both keys fail', () => {
      const encrypted = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      const wrongKey = randomBytes(32).toString('hex');
      expect(() =>
        decryptSecretWithFallback(encrypted, KEY_B, wrongKey),
      ).toThrow(BadRequestException);
    });

    it('should throw when current key fails and no old key exists', () => {
      const encrypted = encryptSecret(PLAINTEXT_SECRET, KEY_A);
      expect(() =>
        decryptSecretWithFallback(encrypted, KEY_B, undefined),
      ).toThrow(BadRequestException);
    });

    it('should work with plain: prefix (no key needed)', () => {
      const result = decryptSecretWithFallback(
        `plain:${PLAINTEXT_SECRET}`,
        KEY_A,
        KEY_B,
      );
      expect(result).toBe(PLAINTEXT_SECRET);
    });

    it('should work with legacy unformatted values', () => {
      const result = decryptSecretWithFallback(PLAINTEXT_SECRET, KEY_A, KEY_B);
      expect(result).toBe(PLAINTEXT_SECRET);
    });
  });
});

describe('TwoFactorService — key rotation cron', () => {
  let service: TwoFactorService;
  let mockPrisma: any;

  function createModule(currentKey: string | undefined, oldKey: string | undefined) {
    mockPrisma = {
      user: { findUnique: jest.fn() },
      twoFactorSecret: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    return Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'TOTP_ENCRYPTION_KEY') return currentKey;
              if (key === 'TOTP_ENCRYPTION_KEY_OLD') return oldKey;
              return null;
            }),
          },
        },
        { provide: 'REDIS', useValue: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null), del: jest.fn().mockResolvedValue(1) } },
      ],
    }).compile();
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not run when TOTP_ENCRYPTION_KEY is not set', async () => {
    const module = await createModule(undefined, undefined);
    service = module.get<TwoFactorService>(TwoFactorService);

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.findMany).not.toHaveBeenCalled();
  });

  it('should not run when only TOTP_ENCRYPTION_KEY_OLD is set (no current key)', async () => {
    const module = await createModule(undefined, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.findMany).not.toHaveBeenCalled();
  });

  it('should skip already-migrated secrets (encrypted with current key)', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    const encryptedWithNewKey = encryptSecret(PLAINTEXT_SECRET, KEY_B);
    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([
        { id: 'rec-1', userId: 'user-1', secret: encryptedWithNewKey },
      ])
      .mockResolvedValueOnce([]);

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.update).not.toHaveBeenCalled();
  });

  it('should re-encrypt secrets from old key to new key', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    const encryptedWithOldKey = encryptSecret(PLAINTEXT_SECRET, KEY_A);
    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([
        { id: 'rec-1', userId: 'user-1', secret: encryptedWithOldKey },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.twoFactorSecret.update.mockResolvedValue({});

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.twoFactorSecret.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe('rec-1');

    // Verify the new ciphertext can be decrypted with the new key
    const newCiphertext = updateCall.data.secret;
    expect(newCiphertext.startsWith('enc:')).toBe(true);
    const decrypted = tryDecryptSecret(newCiphertext, KEY_B);
    expect(decrypted).toBe(PLAINTEXT_SECRET);

    // Verify Sentry audit trail
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'TOTP secret rotated (old key → new key)',
      expect.objectContaining({
        level: 'info',
        extra: { userId: 'user-1', type: 'key_rotation' },
      }),
    );
  });

  it('should encrypt plain: prefixed secrets with current key', async () => {
    const module = await createModule(KEY_A, undefined);
    service = module.get<TwoFactorService>(TwoFactorService);

    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([
        { id: 'rec-2', userId: 'user-2', secret: `plain:${PLAINTEXT_SECRET}` },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.twoFactorSecret.update.mockResolvedValue({});

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.update).toHaveBeenCalledTimes(1);
    const updateCall = mockPrisma.twoFactorSecret.update.mock.calls[0][0];
    const newCiphertext = updateCall.data.secret;
    expect(newCiphertext.startsWith('enc:')).toBe(true);
    const decrypted = tryDecryptSecret(newCiphertext, KEY_A);
    expect(decrypted).toBe(PLAINTEXT_SECRET);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'TOTP secret migrated (plain → encrypted)',
      expect.objectContaining({
        level: 'info',
        extra: { userId: 'user-2', type: 'plain_to_encrypted' },
      }),
    );
  });

  it('should encrypt legacy unformatted secrets with current key', async () => {
    const module = await createModule(KEY_A, undefined);
    service = module.get<TwoFactorService>(TwoFactorService);

    // Legacy secret: no enc: or plain: prefix, just raw base32
    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([
        { id: 'rec-3', userId: 'user-3', secret: PLAINTEXT_SECRET },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.twoFactorSecret.update.mockResolvedValue({});

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.update).toHaveBeenCalledTimes(1);
    const newCiphertext = mockPrisma.twoFactorSecret.update.mock.calls[0][0].data.secret;
    expect(newCiphertext.startsWith('enc:')).toBe(true);
    const decrypted = tryDecryptSecret(newCiphertext, KEY_A);
    expect(decrypted).toBe(PLAINTEXT_SECRET);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'TOTP secret migrated (legacy → encrypted)',
      expect.objectContaining({
        level: 'info',
        extra: { userId: 'user-3', type: 'legacy_to_encrypted' },
      }),
    );
  });

  it('should isolate errors per record — one failure does not block others', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    const encryptedWithOldKey1 = encryptSecret('SECRET_ONE', KEY_A);
    const encryptedWithOldKey2 = encryptSecret('SECRET_TWO', KEY_A);

    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([
        { id: 'rec-1', userId: 'user-1', secret: encryptedWithOldKey1 },
        { id: 'rec-2', userId: 'user-2', secret: encryptedWithOldKey2 },
      ])
      .mockResolvedValueOnce([]);

    // First update throws, second succeeds
    mockPrisma.twoFactorSecret.update
      .mockRejectedValueOnce(new Error('DB write error'))
      .mockResolvedValueOnce({});

    await service.rotateEncryptionKeys();

    // Both records attempted
    expect(mockPrisma.twoFactorSecret.update).toHaveBeenCalledTimes(2);

    // Error captured for first record
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ userId: 'user-1', phase: 'totp_key_rotation' }),
      }),
    );

    // Second record still succeeded
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'TOTP secret rotated (old key → new key)',
      expect.objectContaining({
        extra: { userId: 'user-2', type: 'key_rotation' },
      }),
    );
  });

  it('should report undecryptable secrets as errors via Sentry', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    // Encrypted with a completely unknown key
    const unknownKey = randomBytes(32).toString('hex');
    const encryptedWithUnknown = encryptSecret(PLAINTEXT_SECRET, unknownKey);

    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([
        { id: 'rec-bad', userId: 'user-bad', secret: encryptedWithUnknown },
      ])
      .mockResolvedValueOnce([]);

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.update).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'TOTP secret undecryptable during rotation',
      expect.objectContaining({
        level: 'error',
        extra: { userId: 'user-bad', secretId: 'rec-bad' },
      }),
    );
  });

  it('should process in batches of 50', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    // Batch 1: 50 records already migrated, batch 2: 10 records already migrated, batch 3: empty
    const migratedRecords = Array.from({ length: 50 }, (_, i) => ({
      id: `rec-${i}`,
      userId: `user-${i}`,
      secret: encryptSecret(PLAINTEXT_SECRET, KEY_B),
    }));
    const batch2 = Array.from({ length: 10 }, (_, i) => ({
      id: `rec-${50 + i}`,
      userId: `user-${50 + i}`,
      secret: encryptSecret(PLAINTEXT_SECRET, KEY_B),
    }));

    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce(migratedRecords)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.findMany).toHaveBeenCalledTimes(3);
    // Verify cursor-based pagination: first call has no cursor, subsequent calls use last ID
    expect(mockPrisma.twoFactorSecret.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: 50, orderBy: { id: 'asc' } }));
    expect(mockPrisma.twoFactorSecret.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ take: 50, cursor: { id: 'rec-49' }, skip: 1 }));
    expect(mockPrisma.twoFactorSecret.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({ take: 50, cursor: { id: 'rec-59' }, skip: 1 }));
  });

  it('should log "rotation complete" when all secrets are migrated and rotation mode is active', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    // All secrets already encrypted with new key
    const alreadyMigrated = encryptSecret(PLAINTEXT_SECRET, KEY_B);
    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([{ id: 'rec-1', userId: 'user-1', secret: alreadyMigrated }])
      .mockResolvedValueOnce([]);

    await service.rotateEncryptionKeys();

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'TOTP key rotation complete — safe to remove TOTP_ENCRYPTION_KEY_OLD',
      expect.objectContaining({
        level: 'info',
        extra: { totalProcessed: 1 },
      }),
    );
  });

  it('should NOT log "rotation complete" when some secrets were migrated this run', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    const encryptedWithOldKey = encryptSecret(PLAINTEXT_SECRET, KEY_A);
    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([{ id: 'rec-1', userId: 'user-1', secret: encryptedWithOldKey }])
      .mockResolvedValueOnce([]);
    mockPrisma.twoFactorSecret.update.mockResolvedValue({});

    await service.rotateEncryptionKeys();

    // Should have the rotation message but NOT the completion message
    const sentryMessages = (Sentry.captureMessage as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(sentryMessages).toContain('TOTP secret rotated (old key → new key)');
    expect(sentryMessages).not.toContain('TOTP key rotation complete — safe to remove TOTP_ENCRYPTION_KEY_OLD');
  });

  it('should be idempotent — second run has no effect after all migrated', async () => {
    const module = await createModule(KEY_B, KEY_A);
    service = module.get<TwoFactorService>(TwoFactorService);

    const alreadyMigrated = encryptSecret(PLAINTEXT_SECRET, KEY_B);
    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([{ id: 'rec-1', userId: 'user-1', secret: alreadyMigrated }])
      .mockResolvedValueOnce([]);

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.update).not.toHaveBeenCalled();

    // Run again
    jest.clearAllMocks();
    mockPrisma.twoFactorSecret.findMany
      .mockResolvedValueOnce([{ id: 'rec-1', userId: 'user-1', secret: alreadyMigrated }])
      .mockResolvedValueOnce([]);

    await service.rotateEncryptionKeys();

    expect(mockPrisma.twoFactorSecret.update).not.toHaveBeenCalled();
  });
});

describe('TwoFactorService — dual-key decryption in service methods', () => {
  let service: TwoFactorService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: jest.fn() },
      twoFactorSecret: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'TOTP_ENCRYPTION_KEY') return KEY_B;
              if (key === 'TOTP_ENCRYPTION_KEY_OLD') return KEY_A;
              return null;
            }),
          },
        },
        { provide: 'REDIS', useValue: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null), del: jest.fn().mockResolvedValue(1) } },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
  });

  it('validate: should decrypt old-key secrets via fallback', async () => {
    const encryptedWithOldKey = encryptSecret(PLAINTEXT_SECRET, KEY_A);
    mockPrisma.twoFactorSecret.findUnique.mockResolvedValue({
      userId: 'user-1',
      secret: encryptedWithOldKey,
      isEnabled: true,
    });

    // This should not throw — should fall back to old key
    const result = await service.validate('user-1', '000000');
    // Result is false (wrong code) but the point is it didn't throw on decryption
    expect(result).toBe(false);
  });

  it('validate: should decrypt current-key secrets directly', async () => {
    const encryptedWithNewKey = encryptSecret(PLAINTEXT_SECRET, KEY_B);
    mockPrisma.twoFactorSecret.findUnique.mockResolvedValue({
      userId: 'user-1',
      secret: encryptedWithNewKey,
      isEnabled: true,
    });

    const result = await service.validate('user-1', '000000');
    expect(result).toBe(false); // wrong code, but no decryption error
  });

  it('validateStrict: should work with old-key encrypted secrets', async () => {
    const encryptedWithOldKey = encryptSecret(PLAINTEXT_SECRET, KEY_A);
    mockPrisma.twoFactorSecret.findUnique.mockResolvedValue({
      userId: 'user-1',
      secret: encryptedWithOldKey,
      isEnabled: true,
    });

    const result = await service.validateStrict('user-1', '000000');
    expect(result).toBe(false); // wrong code, but decryption succeeded
  });

  it('verify: should work with old-key encrypted secrets', async () => {
    const encryptedWithOldKey = encryptSecret(PLAINTEXT_SECRET, KEY_A);
    mockPrisma.twoFactorSecret.findUnique.mockResolvedValue({
      userId: 'user-1',
      secret: encryptedWithOldKey,
      isEnabled: false,
    });

    const result = await service.verify('user-1', '000000');
    expect(result).toBe(false); // wrong code, but decryption succeeded
  });

  it('disable: should throw BadRequestException when both keys fail', async () => {
    const unknownKey = randomBytes(32).toString('hex');
    const encryptedWithUnknown = encryptSecret(PLAINTEXT_SECRET, unknownKey);
    mockPrisma.twoFactorSecret.findUnique.mockResolvedValue({
      userId: 'user-1',
      secret: encryptedWithUnknown,
      isEnabled: true,
    });

    await expect(service.disable('user-1', '123456')).rejects.toThrow(BadRequestException);
  });
});
