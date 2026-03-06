import {
  IsString,
  IsOptional,
  IsUrl,
  IsEnum,
  IsArray,
  MaxLength,
} from 'class-validator';
import { VideoCategory } from '@prisma/client';

export class UpdateVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @IsOptional()
  @IsEnum(VideoCategory)
  category?: VideoCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}