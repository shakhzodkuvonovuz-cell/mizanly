import {
  IsUrl,
  IsOptional,
  IsNumber,
  IsString,
  IsArray,
  IsBoolean,
  MaxLength,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReelDto {
  @ApiProperty()
  @IsUrl()
  videoUrl: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiProperty()
  @IsNumber()
  duration: number;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiProperty({ required: false, type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  mentions?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  hashtags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  audioTrackId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDuet?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isStitch?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  normalizeAudio?: boolean;
}