import { IsOptional, IsBoolean, IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrivacyDto {
  @ApiProperty({ required: false, enum: ['everyone', 'followers', 'none'] })
  @IsOptional()
  @IsIn(['everyone', 'followers', 'none'])
  messagePermission?: string;

  @ApiProperty({ required: false, enum: ['everyone', 'followers', 'none'] })
  @IsOptional()
  @IsIn(['everyone', 'followers', 'none'])
  mentionPermission?: string;

  @ApiProperty({ required: false, description: 'Show online/active status to others' })
  @IsOptional()
  @IsBoolean()
  activityStatus?: boolean;

  @ApiProperty({ required: false, description: 'Show read receipts (blue ticks) in chats' })
  @IsOptional()
  @IsBoolean()
  readReceipts?: boolean;

  @ApiProperty({ required: false, description: 'Show typing indicators in chats' })
  @IsOptional()
  @IsBoolean()
  typingIndicators?: boolean;

  @ApiProperty({ required: false, enum: ['everyone', 'contacts', 'nobody'], description: 'Who can see your last seen timestamp' })
  @IsOptional()
  @IsString()
  @IsIn(['everyone', 'contacts', 'nobody'])
  lastSeenVisibility?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
