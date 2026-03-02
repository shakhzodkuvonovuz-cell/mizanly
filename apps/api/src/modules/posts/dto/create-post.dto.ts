import {
  IsString, IsOptional, IsEnum, IsArray,
  MaxLength, IsBoolean, IsUrl, ArrayMaxSize,
} from 'class-validator';

export class CreatePostDto {
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'])
  postType: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE'])
  visibility?: string;

  @IsOptional()
  @IsString()
  circleId?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  mediaUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  mediaTypes?: string[];

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  mediaWidth?: number;

  @IsOptional()
  mediaHeight?: number;

  @IsOptional()
  videoDuration?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsBoolean()
  hideLikesCount?: boolean;

  @IsOptional()
  @IsBoolean()
  commentsDisabled?: boolean;
}
