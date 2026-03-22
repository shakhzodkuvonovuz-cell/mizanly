import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode';
import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { PrismaService } from '../../config/prisma.service';

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
    if (token === code.toString().padStart(6, '0')) return true;
  }
  return false;
}

function buildOtpauthUri(issuer: string, label: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── AES-256-GCM encryption for TOTP secrets at rest (Finding 3) ──

function encryptSecret(plaintext: string, encryptionKey: string | undefined): string {
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

function decryptSecret(stored: string, encryptionKey: string | undefined): string {
  if (stored.startsWith('plain:')) {
    return stored.slice(6);
  }
  if (!stored.startsWith('enc:')) {
    // Legacy unencrypted value — return as-is for backward compatibility
    return stored;
  }
  if (!encryptionKey) {
    throw new BadRequestException('TOTP encryption key not configured — cannot decrypt');
  }
  const parts = stored.split(':');
  // enc:iv:authTag:ciphertext
  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encrypted = Buffer.from(parts[3], 'hex');
  const key = Buffer.from(encryptionKey, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly encryptionKey: string | undefined;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.encryptionKey = this.config.get<string>('TOTP_ENCRYPTION_KEY');
    if (!this.encryptionKey) {
      this.logger.warn(
        'TOTP_ENCRYPTION_KEY not set — TOTP secrets will be stored unencrypted. ' +
        'Generate a 32-byte hex key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
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
    const plaintextSecret = decryptSecret(secretRecord.secret, this.encryptionKey);
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

    const plaintextSecret = decryptSecret(secretRecord.secret, this.encryptionKey);
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
    const plaintextSecret = decryptSecret(secretRecord.secret, this.encryptionKey);
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
    const plaintextSecret = decryptSecret(secretRecord.secret, this.encryptionKey);
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
   * Generate random backup codes (10-character alphanumeric)
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 10-character alphanumeric code
      const buffer = randomBytes(6); // 6 bytes = 48 bits
      const code = buffer.toString('hex').toUpperCase().slice(0, 10);
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
      // New format: salt:hmac
      const [salt, hash] = storedHash.split(':');
      const hmac = createHmac('sha256', salt).update(backupCode).digest('hex');
      return hmac === hash;
    }
    // Legacy format: plain SHA-256 (for backward compatibility during migration)
    return createHash('sha256').update(backupCode).digest('hex') === storedHash;
  }
}