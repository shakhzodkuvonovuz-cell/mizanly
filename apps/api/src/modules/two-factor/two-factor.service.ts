import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import * as qrcode from 'qrcode';
import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
import { acquireCronLock } from '../../common/utils/cron-lock';

// ── Native TOTP implementation (replaces otplib) ──

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret(length = 20): string {
  return base32Encode(randomBytes(length));
}

function generateTotpCode(secret: string, timeStep = 30, digits = 6): string {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(time, 4);
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** digits);
  return code.toString().padStart(digits, '0');
}

function verifyTotp(token: string, secret: string, window = 1): boolean {
  const timeStep = 30;
  const now = Math.floor(Date.now() / 1000 / timeStep);
  for (let i = -window; i <= window; i++) {
    const time = now + i;
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(0, 0);
    buf.writeUInt32BE(time, 4);
    const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** 6);
    // A01-#21: Use timing-safe comparison (theoretical side-channel prevention)
    const expected = code.toString().padStart(6, '0');
    if (token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
  }
  return false;
}

function buildOtpauthUri(issuer: string, label: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── AES-256-GCM encryption for TOTP secrets at rest (Finding 3) ──

export function encryptSecret(plaintext: string, encryptionKey: string | undefined): string {
  if (!encryptionKey) {
    // If no encryption key configured, store as-is with prefix for identification
    return `plain:${plaintext}`;
  }
  const key = Buffer.from(encryptionKey, 'hex'); // 32 bytes = 256 bits
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: enc:iv:authTag:ciphertext (all hex)
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Attempt to decrypt a stored TOTP secret with a single key.
 * Returns the plaintext on success, or null if:
 *   - the key is undefined
 *   - the stored value is not an `enc:` ciphertext
 *   - decryption fails (wrong key / corrupt data)
 *
 * For `plain:` or legacy unformatted values, returns the plaintext directly
 * regardless of which key is supplied (they are not encrypted).
 */
export function tryDecryptSecret(stored: string, encryptionKey: string | undefined): string | null {
  if (stored.startsWith('plain:')) {
    return stored.slice(6);
  }
  if (!stored.startsWith('enc:')) {
    // Legacy unencrypted value — return as-is for backward compatibility
    return stored;
  }
  if (!encryptionKey) {
    return null;
  }
  try {
    const parts = stored.split(':');
    // enc:iv:authTag:ciphertext
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const key = Buffer.from(encryptionKey, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    // Explicit UTF-8 encoding on both calls — decipher.update() without encoding
    // returns a Buffer, and Buffer + string concatenation relies on implicit toString()
    // which is fragile. Using explicit encoding on update() ensures deterministic string output.
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    // Wrong key or corrupt ciphertext — GCM auth tag mismatch
    return null;
  }
}

/**
 * Decrypt a stored TOTP secret, trying the current key first, then falling
 * back to the old key (for key-rotation transitions).
 * Throws if neither key can decrypt the value.
 */
export function decryptSecretWithFallback(
  stored: string,
  currentKey: string | undefined,
  oldKey: string | undefined,
): string {
  const result = tryDecryptSecret(stored, currentKey);
  if (result !== null) return result;

  if (oldKey) {
    const fallback = tryDecryptSecret(stored, oldKey);
    if (fallback !== null) return fallback;
  }

  throw new BadRequestException(
    'TOTP secret decryption failed — neither current nor old encryption key can decrypt the stored value',
  );
}

/**
 * TOTP Encryption Key Rotation Process
 * =====================================
 *
 * The TOTP secrets are encrypted at rest with AES-256-GCM using the
 * `TOTP_ENCRYPTION_KEY` environment variable (64-char hex = 32 bytes).
 *
 * To rotate the encryption key without locking out users:
 *
 *   1. Generate a new key:
 *      node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 *   2. Set `TOTP_ENCRYPTION_KEY_OLD` to the CURRENT value of `TOTP_ENCRYPTION_KEY`.
 *
 *   3. Set `TOTP_ENCRYPTION_KEY` to the newly generated key.
 *
 *   4. Deploy. From this point:
 *      - All NEW secrets are encrypted with the new key.
 *      - Decryption tries the new key first; if it fails, falls back to the old key.
 *      - The daily cron (`rotateEncryptionKeys`, 5:30 AM) re-encrypts old secrets
 *        with the new key in batches of 50.
 *
 *   5. Monitor logs for "TOTP key rotation complete" message.
 *
 *   6. Once all secrets are migrated, remove `TOTP_ENCRYPTION_KEY_OLD` from env.
 *
 * The cron also encrypts any `plain:` prefixed secrets (stored when no key was
 * configured) if `TOTP_ENCRYPTION_KEY` is now set.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly encryptionKey: string | undefined;
  private readonly oldEncryptionKey: string | undefined;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {
    this.encryptionKey = this.config.get<string>('TOTP_ENCRYPTION_KEY');
    this.oldEncryptionKey = this.config.get<string>('TOTP_ENCRYPTION_KEY_OLD');
    if (!this.encryptionKey) {
      this.logger.warn(
        'TOTP_ENCRYPTION_KEY not set — TOTP secrets will be stored unencrypted. ' +
        'Generate a 32-byte hex key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    if (this.oldEncryptionKey) {
      this.logger.log(
        'TOTP_ENCRYPTION_KEY_OLD is set — key rotation mode active. ' +
        'The daily cron will re-encrypt old secrets with the new key.',
      );
    }
  }

  /**
   * Generate a TOTP secret, create QR code, generate backup codes
   * If a secret already exists for the user, return existing (but not enabled)
   */
  async setup(userId: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check for existing two-factor secret
    let secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });

    if (secretRecord && secretRecord.isEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const secret = generateTotpSecret(20);
    const backupCodes = this.generateBackupCodes(8);
    const backupCodesHashed = backupCodes.map(code => this.hashBackupCode(code));

    // Encrypt TOTP secret before storing (Finding 3: plaintext TOTP secrets)
    const encryptedSecret = encryptSecret(secret, this.encryptionKey);

    // Create or update the secret record
    if (secretRecord) {
      secretRecord = await this.prisma.twoFactorSecret.update({
        where: { userId },
        data: {
          secret: encryptedSecret,
          backupCodes: backupCodesHashed,
          isEnabled: false,
          verifiedAt: null,
        },
      });
    } else {
      secretRecord = await this.prisma.twoFactorSecret.create({
        data: {
          userId,
          secret: encryptedSecret,
          backupCodes: backupCodesHashed,
          isEnabled: false,
        },
      });
    }

    // Generate QR data URI (use plaintext secret for TOTP URI)
    const otpauth = buildOtpauthUri('Mizanly', user.email, secret);
    const qrDataUri = await qrcode.toDataURL(otpauth);

    return {
      secret,
      qrDataUri,
      backupCodes, // plaintext backup codes (only shown once)
    };
  }

  /**
   * Verify a TOTP code and enable 2FA if valid
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!secretRecord) {
      throw new BadRequestException('Two-factor authentication not set up');
    }
    if (secretRecord.isEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    // Validate the TOTP token (decrypt stored secret first)
    const plaintextSecret = decryptSecretWithFallback(secretRecord.secret, this.encryptionKey, this.oldEncryptionKey);
    const isValid = verifyTotp(code, plaintextSecret);
    if (!isValid) {
      return false;
    }

    // Enable 2FA
    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: {
        isEnabled: true,
        verifiedAt: new Date(),
      },
    });

    return true;
  }

  /**
   * Validate a TOTP code for login flow.
   * Returns true if 2FA is not enabled (user doesn't need to provide code).
   * For sensitive operations that REQUIRE 2FA, use validateStrict() instead.
   *
   * TODO: [ARCH/F16] 2FA is currently disconnected from Clerk login flow.
   * Clerk handles authentication externally and issues JWTs. To enforce 2FA at login:
   * 1. Use Clerk custom session claims or metadata to mark 2FA-required users
   * 2. Add a Clerk middleware/webhook that checks 2FA status before issuing session
   * 3. Or: require 2FA validation on first API call after login (session-level flag)
   * This requires Clerk dashboard configuration + custom session management.
   */
  async validate(userId: string, code: string): Promise<boolean> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!secretRecord || !secretRecord.isEnabled) {
      // If 2FA not enabled, treat as valid (no 2FA required for login)
      return true;
    }

    const plaintextSecret = decryptSecretWithFallback(secretRecord.secret, this.encryptionKey, this.oldEncryptionKey);
    return verifyTotp(code, plaintextSecret);
  }

  /**
   * Strictly validate a TOTP code — returns false if 2FA is not enabled.
   * Use this for sensitive operations that must verify the user has 2FA.
   */
  async validateStrict(userId: string, code: string): Promise<boolean> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!secretRecord || !secretRecord.isEnabled) {
      return false; // 2FA not enabled — cannot verify
    }
    const plaintextSecret = decryptSecretWithFallback(secretRecord.secret, this.encryptionKey, this.oldEncryptionKey);
    return verifyTotp(code, plaintextSecret);
  }

  /**
   * Verify a TOTP code without enabling (for disabling confirmation)
   */
  private async verifyToken(userId: string, code: string): Promise<boolean> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!secretRecord) {
      throw new BadRequestException('Two-factor authentication not set up');
    }
    const plaintextSecret = decryptSecretWithFallback(secretRecord.secret, this.encryptionKey, this.oldEncryptionKey);
    return verifyTotp(code, plaintextSecret);
  }

  /**
   * Disable 2FA for a user (requires verification code)
   */
  async disable(userId: string, code: string): Promise<void> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!secretRecord) {
      throw new BadRequestException('Two-factor authentication not set up');
    }
    if (!secretRecord.isEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Verify the token
    const isValid = await this.verifyToken(userId, code);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: {
        isEnabled: false,
        verifiedAt: null,
      },
    });
  }

  /**
   * Get 2FA status for a user
   */
  async getStatus(userId: string): Promise<boolean> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    return secretRecord?.isEnabled ?? false;
  }

  /**
   * Use a backup code for authentication
   */
  async useBackupCode(userId: string, backupCode: string): Promise<boolean> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!secretRecord || !secretRecord.isEnabled) {
      throw new BadRequestException('Two-factor authentication not enabled');
    }

    // Find matching backup code (supports both salted HMAC and legacy SHA-256 formats)
    const index = secretRecord.backupCodes.findIndex(
      (stored) => this.verifyBackupCode(backupCode, stored),
    );
    if (index === -1) {
      return false;
    }

    // Remove the used backup code
    const updatedBackupCodes = [...secretRecord.backupCodes];
    updatedBackupCodes.splice(index, 1);

    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: {
        backupCodes: updatedBackupCodes,
      },
    });

    return true;
  }

  /**
   * Daily cron: re-encrypts TOTP secrets that are still encrypted with the old key
   * (or stored as `plain:` prefixed) using the current encryption key.
   *
   * Only runs when both TOTP_ENCRYPTION_KEY and TOTP_ENCRYPTION_KEY_OLD are set,
   * indicating a key rotation is in progress. Also encrypts `plain:` secrets when
   * TOTP_ENCRYPTION_KEY is set (regardless of old key).
   *
   * Processes in batches of 50 with per-record error isolation.
   * Idempotent — re-running has no effect on already-migrated secrets.
   */
  @Cron('0 30 5 * * *')
  async rotateEncryptionKeys(): Promise<void> {
    if (!await acquireCronLock(this.redis, 'cron:rotateEncryptionKeys', 3500, this.logger)) return;
    const hasCurrentKey = !!this.encryptionKey;
    const hasOldKey = !!this.oldEncryptionKey;

    // Nothing to do if no current key is configured
    if (!hasCurrentKey) return;

    // Only run rotation if old key is present (rotation in progress)
    // OR if we need to encrypt plain: secrets (current key present but no old key)
    const rotationMode = hasCurrentKey && hasOldKey;

    const batchSize = 50;
    let totalProcessed = 0;
    let totalMigrated = 0;
    let totalErrors = 0;
    let lastId: string | undefined;

    this.logger.log('TOTP key rotation cron started');

    // Use cursor-based pagination (not skip) to handle table modifications during rotation.
    // Skip-based pagination can miss or double-process records if rows are inserted/deleted
    // between batches. Cursor-based is safe because IDs are immutable and ordered.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const records = await this.prisma.twoFactorSecret.findMany({
        take: batchSize,
        ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
        select: { id: true, userId: true, secret: true },
        orderBy: { id: 'asc' },
      });

      if (records.length === 0) break;

      for (const record of records) {
        totalProcessed++;

        try {
          // 1. Check if already encrypted with current key.
          // AES-256-GCM guarantees that a ciphertext encrypted with key A CANNOT be
          // decrypted with key B — the auth tag mismatch causes tryDecryptSecret to
          // return null. So if tryDecryptSecret succeeds with the current key AND the
          // stored value starts with 'enc:', this secret is definitively already
          // encrypted with the current key. Safe to skip.
          const currentResult = tryDecryptSecret(record.secret, this.encryptionKey);
          if (currentResult !== null && record.secret.startsWith('enc:')) {
            continue;
          }

          // 2. Handle plain: prefixed secrets (needs encryption)
          if (record.secret.startsWith('plain:')) {
            const plaintext = record.secret.slice(6);
            const reEncrypted = encryptSecret(plaintext, this.encryptionKey);
            await this.prisma.twoFactorSecret.update({
              where: { id: record.id },
              data: { secret: reEncrypted },
            });
            totalMigrated++;
            Sentry.captureMessage('TOTP secret migrated (plain → encrypted)', {
              level: 'info',
              extra: { userId: record.userId, type: 'plain_to_encrypted' },
            });
            continue;
          }

          // 3. Handle legacy unformatted secrets (neither enc: nor plain:)
          if (!record.secret.startsWith('enc:')) {
            const reEncrypted = encryptSecret(record.secret, this.encryptionKey);
            await this.prisma.twoFactorSecret.update({
              where: { id: record.id },
              data: { secret: reEncrypted },
            });
            totalMigrated++;
            Sentry.captureMessage('TOTP secret migrated (legacy → encrypted)', {
              level: 'info',
              extra: { userId: record.userId, type: 'legacy_to_encrypted' },
            });
            continue;
          }

          // 4. enc: prefixed but current key failed — try old key (rotation scenario)
          if (rotationMode) {
            const oldResult = tryDecryptSecret(record.secret, this.oldEncryptionKey);
            if (oldResult !== null) {
              // Re-encrypt with current key
              const reEncrypted = encryptSecret(oldResult, this.encryptionKey);
              await this.prisma.twoFactorSecret.update({
                where: { id: record.id },
                data: { secret: reEncrypted },
              });
              totalMigrated++;
              Sentry.captureMessage('TOTP secret rotated (old key → new key)', {
                level: 'info',
                extra: { userId: record.userId, type: 'key_rotation' },
              });
              continue;
            }
          }

          // 5. Neither key works on an enc: secret — data corruption or unknown key
          this.logger.error(
            `TOTP key rotation: cannot decrypt secret for user ${record.userId} — ` +
            'neither current nor old key works. Manual investigation required.',
          );
          Sentry.captureMessage('TOTP secret undecryptable during rotation', {
            level: 'error',
            extra: { userId: record.userId, secretId: record.id },
          });
          totalErrors++;
        } catch (error) {
          totalErrors++;
          this.logger.error(
            `TOTP key rotation: error processing record ${record.id}: ${error}`,
          );
          Sentry.captureException(error, {
            extra: { userId: record.userId, secretId: record.id, phase: 'totp_key_rotation' },
          });
          // Continue to next record — error isolation
        }
      }

      lastId = records[records.length - 1].id;
    }

    this.logger.log(
      `TOTP key rotation cron complete — processed: ${totalProcessed}, migrated: ${totalMigrated}, errors: ${totalErrors}`,
    );

    if (totalMigrated === 0 && totalErrors === 0 && rotationMode) {
      this.logger.log(
        'TOTP key rotation complete — all secrets are encrypted with the current key. ' +
        'Safe to remove TOTP_ENCRYPTION_KEY_OLD from environment variables.',
      );
      Sentry.captureMessage('TOTP key rotation complete — safe to remove TOTP_ENCRYPTION_KEY_OLD', {
        level: 'info',
        extra: { totalProcessed },
      });
    }
  }

  /**
   * Generate random backup codes (10-character alphanumeric, base64url-derived).
   * Uses full alphanumeric charset instead of hex-only for higher entropy per character
   * (36^10 = 3.6×10^15 vs 16^10 = 1.1×10^12 — ~3000× harder to brute-force).
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 10-character alphanumeric code from base64url encoding
      const code = randomBytes(8).toString('base64url').slice(0, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash a backup code using HMAC-SHA256 with a random salt.
   * Format: salt:hmac where salt is 16 bytes hex.
   * (Finding 27: unsalted SHA-256 was vulnerable to rainbow tables)
   */
  private hashBackupCode(backupCode: string): string {
    const salt = randomBytes(16).toString('hex');
    const hmac = createHmac('sha256', salt).update(backupCode).digest('hex');
    return `${salt}:${hmac}`;
  }

  /**
   * Verify a backup code against a stored hash.
   * Supports both legacy (unsalted SHA-256) and new (salted HMAC-SHA256) formats.
   */
  private verifyBackupCode(backupCode: string, storedHash: string): boolean {
    if (storedHash.includes(':')) {
      // New format: salt:hmac — use timing-safe comparison to prevent timing attacks
      const [salt, hash] = storedHash.split(':');
      const computed = createHmac('sha256', salt).update(backupCode).digest();
      const stored = Buffer.from(hash, 'hex');
      if (computed.length !== stored.length) return false;
      return timingSafeEqual(computed, stored);
    }
    // Legacy format: plain SHA-256 — timing-safe comparison
    const computed = createHash('sha256').update(backupCode).digest();
    const stored = Buffer.from(storedHash, 'hex');
    if (computed.length !== stored.length) return false;
    return timingSafeEqual(computed, stored);
  }
}