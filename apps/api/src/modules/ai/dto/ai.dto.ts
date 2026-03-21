import {
  IsString, IsOptional, IsArray, IsNumber, IsIn, IsUrl,
  MaxLength, Min, Max, ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestCaptionsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) content?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) mediaDescription?: string;
}

export class SuggestHashtagsDto {
  @ApiProperty() @IsString() @MaxLength(5000) content: string;
}

export class TranslateDto {
  @ApiProperty() @IsString() @MaxLength(10000) text: string;
  @ApiProperty() @IsString() @MaxLength(10) targetLanguage: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contentType?: string;
}

export class ModerateDto {
  @ApiProperty() @IsString() @MaxLength(10000) text: string;
  @ApiProperty() @IsString() @IsIn(['post', 'comment', 'thread', 'message', 'bio', 'reel']) contentType: string;
}

export class SmartRepliesDto {
  @ApiProperty() @IsString() @MaxLength(5000) conversationContext: string;
  @ApiProperty() @IsArray() @IsString({ each: true }) @MaxLength(2000, { each: true }) @ArrayMaxSize(20) lastMessages: string[];
}

export class SummarizeDto {
  @ApiProperty() @IsString() @MaxLength(50000) text: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(50) @Max(1000) maxLength?: number;
}

export class RouteSpaceDto {
  @ApiProperty() @IsString() @MaxLength(5000) content: string;
  @ApiProperty() @IsArray() @IsString({ each: true }) @ArrayMaxSize(10) mediaTypes: string[];
}

export class GenerateCaptionsDto {
  @ApiProperty() @IsUrl() audioUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) language?: string;
}

export class GenerateAvatarDto {
  @ApiProperty() @IsUrl() sourceUrl: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['default', 'anime', 'cartoon', 'pixel', 'watercolor']) style?: string;
}
