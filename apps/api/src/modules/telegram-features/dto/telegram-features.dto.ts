import {
  IsString, IsOptional, IsBoolean, IsArray, IsIn, IsInt,
  MaxLength, ArrayMaxSize, IsUrl, Matches, ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveMessageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) content?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() mediaUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['image', 'video', 'audio', 'document', 'voice']) mediaType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['FWD_POST', 'FWD_THREAD', 'FWD_REEL', 'FWD_VIDEO', 'FWD_MESSAGE']) forwardedFromType?: string;
  @ApiPropertyOptional()
  @ValidateIf((o) => o.forwardedFromType !== undefined)
  @IsString()
  forwardedFromId?: string;
}

export class ReorderChatFoldersDto {
  @ApiProperty() @IsArray() @IsString({ each: true }) @ArrayMaxSize(50) folderIds: string[];
}

export class CreateChatFolderDto {
  @ApiProperty() @IsString() @MaxLength(50) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) conversationIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeGroups?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeChannels?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['INCLUDE', 'EXCLUDE']) filterType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeBots?: boolean;
}

export class UpdateChatFolderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) conversationIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeGroups?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeChannels?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['INCLUDE', 'EXCLUDE']) filterType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeBots?: boolean;
}

export class SetSlowModeDto {
  @ApiProperty({ description: 'Slow mode interval in seconds. Valid values: 0 (off), 30, 60, 300, 900, 3600' })
  @IsInt()
  @IsIn([0, 30, 60, 300, 900, 3600])
  seconds: number;
}

export class CreateTopicDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'iconColor must be a valid hex color (e.g. #FF0000)' }) iconColor?: string;
}

export class UpdateTopicDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'iconColor must be a valid hex color (e.g. #FF0000)' }) iconColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPinned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isClosed?: boolean;
}

export class CreateEmojiPackDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class UpdateEmojiPackDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class AddEmojiDto {
  @ApiProperty() @IsString() @MaxLength(50) shortcode: string;
  @ApiProperty() @IsUrl() imageUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnimated?: boolean;
}
