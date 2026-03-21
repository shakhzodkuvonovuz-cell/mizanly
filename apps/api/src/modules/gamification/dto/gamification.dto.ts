import {
  IsString, IsNumber, IsOptional, IsBoolean, IsIn, IsInt, IsUrl, IsDateString, Matches,
  MaxLength, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChallengeDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(1000) description: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() coverUrl?: string;
  @ApiProperty() @IsString() @IsIn(['daily', 'weekly', 'monthly', 'custom']) challengeType: string;
  @ApiProperty() @IsString() @IsIn(['quran', 'dhikr', 'photography', 'fitness', 'charity', 'community', 'learning', 'custom']) category: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) targetCount: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) xpReward?: number;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
}

export class UpdateProgressDto {
  @ApiProperty() @IsInt() @Min(0) @Max(100000) progress: number;
}

export class CreateSeriesDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() coverUrl?: string;
  @ApiProperty() @IsString() @MaxLength(50) category: string;
}

export class AddEpisodeDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoId?: string;
}

export class UpdateSeriesProgressDto {
  @ApiProperty() @IsInt() @Min(1) @Max(10000) episodeNum: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(86400) timestamp: number;
}

export class UpdateProfileCustomizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accentColor must be a valid hex color (#RRGGBB)' }) accentColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['default', 'grid', 'magazine', 'minimal']) layoutStyle?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() backgroundUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() backgroundMusic?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showBadges?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showLevel?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showStreak?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['default', 'serif', 'mono', 'arabic']) bioFont?: string;
}
