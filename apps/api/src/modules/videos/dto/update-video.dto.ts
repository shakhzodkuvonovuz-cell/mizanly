import {
  IsString,
  IsOptional,
  IsUrl,
  IsEnum,
  IsArray,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { VideoCategory } from '@prisma/client';

export class UpdateVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @IsOptional()
  @IsEnum(VideoCategory)
  category?: VideoCategory;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}