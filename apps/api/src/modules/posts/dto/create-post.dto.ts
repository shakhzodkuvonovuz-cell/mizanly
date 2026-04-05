import {
  IsString, IsOptional, IsEnum, IsArray, IsDateString,
  MaxLength, IsBoolean, ArrayMaxSize, IsNumber, Min, Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStorageUrl } from '../../../common/validators/is-storage-url.validator';

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
  @IsStorageUrl({ each: true })
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
  @IsStorageUrl()
  thumbnailUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  mediaWidth?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  mediaHeight?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(600)
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
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  mentions?: string[];

  @ApiProperty({ required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;

  @ApiProperty({ required: false, description: 'Latitude of the tagged location' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @ApiProperty({ required: false, description: 'Longitude of the tagged location' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLng?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;

  @ApiProperty({ required: false, maxLength: 1000, description: 'Alt text for accessibility' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  altText?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  hideLikesCount?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  commentsDisabled?: boolean;

  // ── Session 5: Publish fields wired to backend ──

  @ApiProperty({ required: false, enum: ['EVERYONE', 'FOLLOWERS', 'NOBODY'], description: 'Who can comment on this post' })
  @IsOptional()
  @IsEnum(['EVERYONE', 'FOLLOWERS', 'NOBODY'])
  commentPermission?: string;

  @ApiProperty({ required: false, type: [String], maxItems: 20, description: 'User IDs to tag in this post (photo tags)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  taggedUserIds?: string[];

  @ApiProperty({ required: false, maxLength: 50, description: 'Username to invite as collaborator' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  collaboratorUsername?: string;

  @ApiProperty({ required: false, description: 'Whether this is branded/sponsored content' })
  @IsOptional()
  @IsBoolean()
  brandedContent?: boolean;

  @ApiProperty({ required: false, maxLength: 100, description: 'Brand partner name for branded content' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brandPartner?: string;

  @ApiProperty({ required: false, description: 'Whether others can remix this post' })
  @IsOptional()
  @IsBoolean()
  remixAllowed?: boolean;

  @ApiProperty({ required: false, description: 'Whether to show in main feed (vs story only)' })
  @IsOptional()
  @IsBoolean()
  shareToFeed?: boolean;

  @ApiProperty({ required: false, type: [String], maxItems: 3, description: 'Topic/category tags (max 3)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  @MaxLength(50, { each: true })
  topics?: string[];

  @ApiProperty({ required: false, description: 'ISO 8601 datetime to schedule post for future publishing' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
