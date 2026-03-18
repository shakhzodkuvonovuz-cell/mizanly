import {
  IsString, IsNumber, IsOptional, IsBoolean, IsIn, IsInt,
  MaxLength, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChallengeDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(1000) description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coverUrl?: string;
  @ApiProperty() @IsString() challengeType: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) targetCount: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) xpReward?: number;
  @ApiProperty() @IsString() startDate: string;
  @ApiProperty() @IsString() endDate: string;
}

export class UpdateProgressDto {
  @ApiProperty() @IsInt() @Min(0) @Max(100000) progress: number;
}

export class CreateSeriesDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coverUrl?: string;
  @ApiProperty() @IsString() category: string;
}

export class AddEpisodeDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() videoId?: string;
}

export class UpdateProfileCustomizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(7) accentColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['default', 'grid', 'magazine', 'minimal']) layoutStyle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backgroundUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() backgroundMusic?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showBadges?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showLevel?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showStreak?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['default', 'serif', 'mono', 'arabic']) bioFont?: string;
}
