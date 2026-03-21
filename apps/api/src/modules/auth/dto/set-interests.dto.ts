import { IsArray, IsString, ArrayMinSize, ArrayMaxSize, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetInterestsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20 })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  categories: string[];
}
