import { IsString, IsOptional, IsBoolean, IsArray, IsUrl, ValidateNested, MaxLength, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class StickerItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500000)
  url: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  name?: string;
}

export class CreateStickerPackDto {
  @ApiProperty({ example: 'Islamic Greetings' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isFree?: boolean;

  @ApiProperty({ type: [StickerItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StickerItemDto)
  stickers: StickerItemDto[];
}