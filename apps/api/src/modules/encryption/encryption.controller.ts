import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, ValidateNested, MinLength, ArrayMinSize, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { EncryptionService } from './encryption.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class RegisterKeyDto {
  @ApiProperty({ description: 'Base64-encoded public key' })
  @IsString()
  @MinLength(32)
  @MaxLength(2048)
  @Matches(/^[A-Za-z0-9+/=]+$/, { message: 'Public key must be valid base64' })
  publicKey!: string;
}

class StoreEnvelopeDto {
  @ApiProperty({ description: 'Conversation ID' })
  @IsString()
  conversationId!: string;

  @ApiProperty({ description: 'Recipient user ID' })
  @IsString()
  recipientId!: string;

  @ApiProperty({ description: 'Encrypted symmetric key (base64)' })
  @IsString()
  encryptedKey!: string;

  @ApiProperty({ description: 'Nonce used for encryption (base64)' })
  @IsString()
  nonce!: string;
}

class RotateEnvelopeItemDto {
  @ApiProperty({ description: 'User ID for this envelope' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: 'Encrypted symmetric key (base64)' })
  @IsString()
  encryptedKey!: string;

  @ApiProperty({ description: 'Nonce used for encryption (base64)' })
  @IsString()
  nonce!: string;
}

class RotateKeyDto {
  @ApiProperty({ description: 'Envelopes for all conversation members', type: [RotateEnvelopeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RotateEnvelopeItemDto)
  envelopes!: RotateEnvelopeItemDto[];
}

@ApiTags('Encryption')
@ApiBearerAuth()
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('encryption')
@UseGuards(ClerkAuthGuard)
export class EncryptionController {
  constructor(private readonly encryptionService: EncryptionService) {}

  @Post('keys')
  @ApiOperation({ summary: 'Register or update encryption public key' })
  async registerKey(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterKeyDto,
  ) {
    return this.encryptionService.registerKey(userId, dto.publicKey);
  }

  @Get('keys/bulk')
  @ApiOperation({ summary: 'Get public keys for multiple users (max 50)' })
  async getBulkKeys(@Query('userIds') userIds: string) {
    const ids = userIds ? userIds.split(',').filter(Boolean).slice(0, 50) : [];
    return this.encryptionService.getBulkKeys(ids);
  }

  @Get('keys/:userId')
  @ApiOperation({ summary: 'Get public key for a user' })
  async getPublicKey(@Param('userId') userId: string) {
    return this.encryptionService.getPublicKey(userId);
  }

  @Post('envelopes')
  @ApiOperation({ summary: 'Store an encrypted key envelope for a conversation member' })
  async storeEnvelope(
    @CurrentUser('id') userId: string,
    @Body() dto: StoreEnvelopeDto,
  ) {
    return this.encryptionService.storeEnvelope(userId, {
      conversationId: dto.conversationId,
      recipientId: dto.recipientId,
      encryptedKey: dto.encryptedKey,
      nonce: dto.nonce,
    });
  }

  @Get('envelopes/:conversationId')
  @ApiOperation({ summary: 'Get the latest key envelope for a conversation' })
  async getEnvelope(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.encryptionService.getEnvelope(conversationId, userId);
  }

  @Post('rotate/:conversationId')
  @ApiOperation({ summary: 'Rotate the conversation encryption key' })
  async rotateKey(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: RotateKeyDto,
  ) {
    return this.encryptionService.rotateKey(conversationId, userId, dto.envelopes);
  }

  @Get('safety-number/:otherUserId')
  @ApiOperation({ summary: 'Compute safety number between current user and another user' })
  async getSafetyNumber(
    @CurrentUser('id') userId: string,
    @Param('otherUserId') otherUserId: string,
  ) {
    const safetyNumber = await this.encryptionService.computeSafetyNumber(userId, otherUserId);
    return { safetyNumber };
  }

  @Get('status/:conversationId')
  @ApiOperation({ summary: 'Check encryption status for a conversation (members only)' })
  async getConversationStatus(
    @CurrentUser('id') userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.encryptionService.getConversationEncryptionStatus(conversationId, userId);
  }
}
