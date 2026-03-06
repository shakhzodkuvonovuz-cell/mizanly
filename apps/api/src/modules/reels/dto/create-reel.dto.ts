import {
  IsUrl,
  IsOptional,
  IsNumber,
  IsString,
  IsArray,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class CreateReelDto {
  @IsUrl()
  videoUrl: string;

  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @IsNumber()
  duration: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  audioTrackId?: string;

  @IsOptional()
  @IsBoolean()
  isDuet?: boolean;

  @IsOptional()
  @IsBoolean()
  isStitch?: boolean;
}