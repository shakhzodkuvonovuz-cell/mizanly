import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../config/prisma.service';

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

    const secret = authenticator.generateSecret(32);
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
    const otpauth = authenticator.keyuri(user.email, 'Mizanly', secret);
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
    const isValid = authenticator.verify({ token: code, secret: secretRecord.secret });
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

    return authenticator.verify({ token: code, secret: secretRecord.secret });
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
    return authenticator.verify({ token: code, secret: secretRecord.secret });
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