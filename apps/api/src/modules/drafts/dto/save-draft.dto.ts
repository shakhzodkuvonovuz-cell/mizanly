import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveDraftDto {
  @ApiProperty({ enum: ['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'], default: 'SAF' })
  @IsEnum(['SAF', 'BAKRA', 'MAJLIS', 'MINBAR'])
  @IsOptional()
  space?: string;

  @ApiProperty({ description: 'Draft payload (content, mediaUrls, etc.)' })
  @IsObject()
  data: Record<string, unknown>;
}