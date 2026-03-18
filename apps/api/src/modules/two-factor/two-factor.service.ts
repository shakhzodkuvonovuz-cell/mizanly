import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as qrcode from 'qrcode';
import { createHash, createHmac, randomBytes } from 'crypto';
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

@Injectable()
export class TwoFactorService {
  constructor(private prisma: PrismaService) {}

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

    // Create or update the secret record
    if (secretRecord) {
      secretRecord = await this.prisma.twoFactorSecret.update({
        where: { userId },
        data: {
          secret,
          backupCodes: backupCodesHashed,
          isEnabled: false,
          verifiedAt: null,
        },
      });
    } else {
      secretRecord = await this.prisma.twoFactorSecret.create({
        data: {
          userId,
          secret,
          backupCodes: backupCodesHashed,
          isEnabled: false,
        },
      });
    }

    // Generate QR data URI
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

    // Validate the TOTP token
    const isValid = verifyTotp(code, secretRecord.secret);
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
   * Validate a TOTP code for a user (login flow)
   */
  async validate(userId: string, code: string): Promise<boolean> {
    const secretRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!secretRecord || !secretRecord.isEnabled) {
      // If 2FA not enabled, treat as valid (no 2FA required)
      return true;
    }

    return verifyTotp(code, secretRecord.secret);
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
    return verifyTotp(code, secretRecord.secret);
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

    const hashedInput = this.hashBackupCode(backupCode);
    const index = secretRecord.backupCodes.indexOf(hashedInput);
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
   * Hash a backup code using SHA-256
   */
  private hashBackupCode(backupCode: string): string {
    return createHash('sha256').update(backupCode).digest('hex');
  }
}