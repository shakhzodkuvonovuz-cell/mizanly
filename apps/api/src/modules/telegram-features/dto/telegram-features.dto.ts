import {
  IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsIn, IsInt,
  MaxLength, Min, Max, ArrayMaxSize, IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveMessageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) content?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() mediaUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() mediaType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['post', 'thread', 'reel', 'video', 'message']) forwardedFromType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() forwardedFromId?: string;
}

export class ReorderChatFoldersDto {
  @ApiProperty() @IsArray() @IsString({ each: true }) @ArrayMaxSize(50) folderIds: string[];
}

export class CreateChatFolderDto {
  @ApiProperty() @IsString() @MaxLength(50) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) conversationIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeGroups?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeChannels?: boolean;
}

export class UpdateChatFolderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) conversationIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeGroups?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeChannels?: boolean;
}

export class SetSlowModeDto {
  @ApiProperty() @IsInt() @Min(0) @Max(86400) seconds: number;
}

export class CreateTopicDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(7) iconColor?: string;
}

export class UpdateTopicDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(7) iconColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPinned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isClosed?: boolean;
}

export class CreateEmojiPackDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class AddEmojiDto {
  @ApiProperty() @IsString() @MaxLength(50) shortcode: string;
  @ApiProperty() @IsUrl() imageUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnimated?: boolean;
}
