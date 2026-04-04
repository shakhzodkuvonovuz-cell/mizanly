import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, Length } from 'class-validator';
import { TwoFactorService } from './two-factor.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class SetupResponseDto {
  @ApiProperty({ description: 'TOTP secret (base32)' })
  secret: string;

  @ApiProperty({ description: 'QR code data URI for scanning' })
  qrDataUri: string;

  @ApiProperty({ description: 'Plaintext backup codes (store securely)', type: [String] })
  backupCodes: string[];
}

class VerifyDto {
  @ApiProperty({ description: '6-digit TOTP code' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

class DisableDto {
  @ApiProperty({ description: '6-digit TOTP code for confirmation' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

class VerifyBackupDto {
  @ApiProperty({ description: 'Backup code (10-character alphanumeric)' })
  @IsString()
  @IsNotEmpty()
  @Length(10, 10)
  backupCode: string;
}

@ApiTags('Two-Factor Authentication')
@Controller('two-factor')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Post('setup')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate TOTP secret + QR data URI' })
  @ApiResponse({ status: 201, description: 'Returns secret, QR data URI, and backup codes' })
  @ApiResponse({ status: 400, description: 'Two-factor authentication already enabled' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async setup(@CurrentUser('id') userId: string): Promise<SetupResponseDto> {
    return this.twoFactorService.setup(userId);
  }

  @Post('verify')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify TOTP code and enable 2FA' })
  @ApiResponse({ status: 200, description: '2FA enabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code or already enabled' })
  async verify(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyDto,
  ) {
    const isValid = await this.twoFactorService.verify(userId, dto.code);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }
    return { success: true, message: 'Two-factor authentication enabled' };
  }

  @Post('validate')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @ApiOperation({ summary: 'Validate TOTP code and set session flag (5 attempts per 5 min)' })
  @ApiResponse({ status: 200, description: 'Returns validation result with session verification status' })
  async validate(@CurrentUser('id') userId: string, @Body() dto: VerifyDto) {
    // A01-#10: Use validate() which sets session-level 2FA flag in Redis on success.
    // Also returns twoFactorEnabled so caller knows if 2FA was actually checked.
    const isEnabled = await this.twoFactorService.getStatus(userId);
    if (!isEnabled) {
      return { valid: true, twoFactorEnabled: false, sessionVerified: true, message: '2FA not enabled — no code required' };
    }
    const valid = await this.twoFactorService.validate(userId, dto.code);
    return { valid, twoFactorEnabled: true, sessionVerified: valid };
  }

  @Delete('disable')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Disable 2FA with confirmation code' })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid code or not enabled' })
  async disable(
    @CurrentUser('id') userId: string,
    @Body() dto: DisableDto,
  ) {
    await this.twoFactorService.disable(userId, dto.code);
    return { success: true, message: 'Two-factor authentication disabled' };
  }

  @Get('status')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if 2FA is enabled and session is verified' })
  @ApiResponse({ status: 200, description: 'Returns 2FA status and session verification' })
  async status(@CurrentUser('id') userId: string) {
    const isEnabled = await this.twoFactorService.getStatus(userId);
    const sessionVerified = await this.twoFactorService.isTwoFactorVerified(userId);
    return { isEnabled, sessionVerified };
  }

  @Post('backup')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @ApiOperation({ summary: 'Use a backup code (5 attempts per 5 min)' })
  @ApiResponse({ status: 200, description: 'Backup code accepted' })
  @ApiResponse({ status: 400, description: 'Invalid backup code' })
  async backup(@CurrentUser('id') userId: string, @Body() dto: VerifyBackupDto) {
    const valid = await this.twoFactorService.useBackupCode(userId, dto.backupCode);
    if (!valid) {
      throw new BadRequestException('Invalid backup code');
    }
    return { success: true, message: 'Backup code accepted' };
  }
}