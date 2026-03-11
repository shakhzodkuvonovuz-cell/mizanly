import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateHighlightDto {
  @ApiProperty({ required: false, description: 'Highlight album title', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @ApiProperty({ required: false, description: 'Cover image URL for the highlight album' })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;
}
