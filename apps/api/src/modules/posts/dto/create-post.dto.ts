import {
  IsString, IsOptional, IsEnum, IsArray,
  MaxLength, IsBoolean, IsUrl, ArrayMaxSize, IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ enum: ['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'] })
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'])
  postType: string;

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiProperty({ required: false, enum: ['PUBLIC', 'FOLLOWERS', 'CIRCLE'] })
  @IsOptional()
  @IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE'])
  visibility?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  circleId?: string;

  @ApiProperty({ required: false, type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  mediaTypes?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  mediaWidth?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  mediaHeight?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  videoDuration?: number;

  @ApiProperty({ required: false, type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  hashtags?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  locationName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  hideLikesCount?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  commentsDisabled?: boolean;
}
