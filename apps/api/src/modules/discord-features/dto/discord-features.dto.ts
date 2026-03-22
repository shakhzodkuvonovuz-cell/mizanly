import {
  IsString, IsOptional, IsArray, MaxLength, ArrayMaxSize, IsUrl, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForumThreadDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(10000) content: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(10) tags?: string[];
}

export class ForumReplyDto {
  @ApiProperty() @IsString() @MaxLength(10000) content: string;
}

export class CreateWebhookDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() targetChannelId?: string;
}

export class ExecuteWebhookDto {
  @ApiProperty() @IsString() @MaxLength(4000) content: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) username?: string;
}

export class CreateStageSessionDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string;
}

export class InviteSpeakerDto {
  @ApiProperty() @IsString() speakerId: string;
}

export class RemoveSpeakerDto {
  @ApiProperty() @IsString() speakerId: string;
}
