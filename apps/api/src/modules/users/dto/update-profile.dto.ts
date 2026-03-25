import { IsString, IsOptional, MaxLength, IsUrl, IsBoolean, IsIn, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Avatar/cover URL pattern: must be from our R2 CDN or Clerk avatar CDN.
 * Prevents SSRF and external image hotlinking abuse.
 */
const MEDIA_URL_PATTERN = /^https:\/\/(.*\.r2\.cloudflarestorage\.com|.*\.r2\.dev|img\.clerk\.com|images\.clerk\.dev|pub-[a-z0-9]+\.r2\.dev)\//;

export class UpdateProfileDto {
  @ApiProperty({ required: false, maxLength: 30, description: 'New username (alphanumeric, underscores, periods — 3-30 chars)' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_.]{3,30}$/, { message: 'Username must be 3-30 characters: letters, numbers, underscores, or periods' })
  username?: string;

  @ApiProperty({ required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;

  @ApiProperty({ required: false, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @ApiProperty({ required: false, description: 'Must be an R2 or Clerk CDN URL' })
  @IsOptional()
  @IsUrl()
  @Matches(MEDIA_URL_PATTERN, { message: 'avatarUrl must be from an allowed CDN domain' })
  avatarUrl?: string;

  @ApiProperty({ required: false, description: 'Must be an R2 or Clerk CDN URL' })
  @IsOptional()
  @IsUrl()
  @Matches(MEDIA_URL_PATTERN, { message: 'coverUrl must be from an allowed CDN domain' })
  coverUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiProperty({ required: false, maxLength: 30, description: 'Pronouns (e.g., he/him, she/her, they/them)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  pronouns?: string;

  @ApiProperty({ required: false, maxLength: 100, description: 'Custom status text' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  statusText?: string;

  @ApiProperty({ required: false, description: 'Creator category (educator, entertainer, scholar, business, journalist)' })
  @IsOptional()
  @IsString()
  @IsIn(['educator', 'entertainer', 'scholar', 'business', 'journalist'])
  creatorCategory?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'])
  language?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsIn(['dark', 'light', 'system'])
  theme?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiProperty({ required: false, maxLength: 20 })
  @IsOptional()
  @IsString()
  @IsIn(['hanafi', 'maliki', 'shafii', 'hanbali'])
  madhab?: string;
}
