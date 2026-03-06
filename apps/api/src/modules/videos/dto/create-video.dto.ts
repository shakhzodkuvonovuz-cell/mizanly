import {
  IsString,
  IsOptional,
  IsUrl,
  IsNumber,
  IsEnum,
  IsArray,
  MaxLength,
} from 'class-validator';
import { VideoCategory } from '@prisma/client';

export class CreateVideoDto {
  @IsString()
  channelId: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsUrl()
  videoUrl: string;

  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @IsNumber()
  duration: number;

  @IsOptional()
  @IsEnum(VideoCategory)
  category?: VideoCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}