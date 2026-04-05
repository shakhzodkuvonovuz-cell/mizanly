import {
  IsOptional,
  IsNumber,
  IsString,
  IsArray,
  IsBoolean,
  MaxLength,
  IsUUID,
  ArrayMaxSize,
  Min,
  Max,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStorageUrl } from '../../../common/validators/is-storage-url.validator';

export class CreateReelDto {
  @ApiProperty()
  @IsStorageUrl()
  videoUrl: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsStorageUrl()
  thumbnailUrl?: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  @Max(180)
  duration: number;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiProperty({ required: false, type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(50, { each: true })
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

  // ── Session 5: Publish fields + carousel support ──

  @ApiProperty({ required: false, description: 'Whether this is a photo carousel (TikTok-style slideshow)' })
  @IsOptional()
  @IsBoolean()
  isPhotoCarousel?: boolean;

  @ApiProperty({ required: false, type: [String], maxItems: 35, description: 'Image URLs for carousel slides' })
  @IsOptional()
  @IsArray()
  @IsStorageUrl({ each: true })
  @ArrayMaxSize(35)
  carouselUrls?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 35, description: 'Per-slide text overlays for carousel' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(35)
  @MaxLength(200, { each: true })
  carouselTexts?: string[];

  @ApiProperty({ required: false, maxLength: 1000, description: 'Alt text for accessibility' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  altText?: string;

  @ApiProperty({ required: false, description: 'Location name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locationName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLng?: number;

  @ApiProperty({ required: false, enum: ['EVERYONE', 'FOLLOWERS', 'NOBODY'], description: 'Who can comment' })
  @IsOptional()
  @IsEnum(['EVERYONE', 'FOLLOWERS', 'NOBODY'])
  commentPermission?: string;

  @ApiProperty({ required: false, description: 'Branded/sponsored content flag' })
  @IsOptional()
  @IsBoolean()
  brandedContent?: boolean;

  @ApiProperty({ required: false, maxLength: 100, description: 'Brand partner name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brandPartner?: string;

  @ApiProperty({ required: false, description: 'Whether others can remix/duet/stitch' })
  @IsOptional()
  @IsBoolean()
  remixAllowed?: boolean;

  @ApiProperty({ required: false, type: [String], maxItems: 3, description: 'Topic tags (max 3)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  @MaxLength(50, { each: true })
  topics?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 20, description: 'User IDs to tag' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  taggedUserIds?: string[];

  @ApiProperty({ required: false, description: 'ISO 8601 datetime to schedule reel' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiProperty({ required: false, description: 'Trial reel — shown to non-followers for feedback before publishing to all' })
  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;
}
