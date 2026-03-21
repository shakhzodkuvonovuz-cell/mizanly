import { IsString, IsOptional, IsBoolean, IsUrl, IsArray, IsNumber, MaxLength, Allow, ArrayMaxSize, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStoryDto {
  @ApiProperty({ description: 'URL of the story media' })
  @IsUrl()
  mediaUrl: string;

  @ApiProperty({ description: 'Media type (e.g., IMAGE, VIDEO)', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  mediaType: string;

  @ApiProperty({ required: false, description: 'Thumbnail URL for video stories' })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiProperty({ required: false, description: 'Duration in seconds for video stories' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  duration?: number;

  @ApiProperty({ required: false, description: 'Text overlay content', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  textOverlay?: string;

  @ApiProperty({ required: false, description: 'Text color hex code', maxLength: 7 })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  textColor?: string;

  @ApiProperty({ required: false, description: 'Background color hex code', maxLength: 7 })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  bgColor?: string;

  @ApiProperty({ required: false, description: 'Font family identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fontFamily?: string;

  @ApiProperty({ required: false, description: 'Filter identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  filter?: string;

  @ApiProperty({ required: false, description: 'Background gradient JSON for text-only stories' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bgGradient?: string;

  @ApiProperty({ required: false, description: 'Sticker data as JSON array of sticker objects' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  stickerData?: object[];

  @ApiProperty({ required: false, description: 'Whether story is for close friends only' })
  @IsOptional()
  @IsBoolean()
  closeFriendsOnly?: boolean;
}
