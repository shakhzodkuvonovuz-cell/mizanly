import {
  IsString,
  IsOptional,
  IsUrl,
  IsNumber,
  IsEnum,
  IsArray,
  MaxLength,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';
import { VideoCategory } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVideoDto {
  @ApiProperty()
  @IsUUID()
  channelId: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ required: false, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

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

  @ApiProperty({ required: false, enum: VideoCategory })
  @IsOptional()
  @IsEnum(VideoCategory)
  category?: VideoCategory;

  @ApiProperty({ required: false, type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}