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

class ValidateDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

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

class BackupDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

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
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate TOTP secret + QR data URI' })
  @ApiResponse({ status: 201, description: 'Returns secret, QR data URI, and backup codes' })
  async setup(@CurrentUser('id') userId: string): Promise<SetupResponseDto> {
    return this.twoFactorService.setup(userId);
  }

  @Post('verify')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify TOTP code and enable 2FA' })
  @ApiResponse({ status: 200, description: '2FA enabled successfully' })
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
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Validate TOTP code during login' })
  @ApiResponse({ status: 200, description: 'Returns validation result' })
  async validate(@Body() dto: ValidateDto) {
    const valid = await this.twoFactorService.validate(dto.userId, dto.code);
    return { valid };
  }

  @Delete('disable')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Disable 2FA with confirmation code' })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  async disable(
    @CurrentUser('id') userId: string,
    @Body() dto: DisableDto,
  ) {
    const isValid = await this.twoFactorService.verify(userId, dto.code);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }
    await this.twoFactorService.disable(userId);
    return { success: true, message: 'Two-factor authentication disabled' };
  }

  @Get('status')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if 2FA is enabled for user' })
  @ApiResponse({ status: 200, description: 'Returns 2FA status' })
  async status(@CurrentUser('id') userId: string) {
    const isEnabled = await this.twoFactorService.getStatus(userId);
    return { isEnabled };
  }

  @Post('backup')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Use a backup code for authentication' })
  @ApiResponse({ status: 200, description: 'Backup code accepted' })
  async backup(@Body() dto: BackupDto) {
    const valid = await this.twoFactorService.useBackupCode(dto.userId, dto.backupCode);
    if (!valid) {
      throw new BadRequestException('Invalid backup code');
    }
    return { success: true, message: 'Backup code accepted' };
  }
}