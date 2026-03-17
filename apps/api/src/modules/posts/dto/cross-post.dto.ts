import { IsArray, IsOptional, IsString, MaxLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CrossPostDto {
  @ApiProperty({ description: 'Target spaces to cross-post to', example: ['MAJLIS', 'BAKRA'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  targetSpaces: string[];

  @ApiProperty({ required: false, description: 'Optional caption override', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  captionOverride?: string;
}
