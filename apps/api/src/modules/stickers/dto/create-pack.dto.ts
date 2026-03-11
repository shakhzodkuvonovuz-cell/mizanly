import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class StickerItemDto {
  @ApiProperty()
  @IsString()
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
  @IsString()
  @IsOptional()
  coverUrl?: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  @IsOptional()
  isFree?: boolean;

  @ApiProperty({ type: [StickerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StickerItemDto)
  stickers: StickerItemDto[];
}