import { IsArray, IsString, ArrayMinSize, ArrayMaxSize, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const VALID_CATEGORIES = [
  'quran', 'fiqh', 'history', 'family', 'health', 'business',
  'tech', 'arts', 'travel', 'education', 'social', 'sports',
] as const;

export class SetInterestsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20, enum: VALID_CATEGORIES })
  @IsArray()
  @IsString({ each: true })
  @IsIn(VALID_CATEGORIES, { each: true, message: 'Each category must be one of: ' + VALID_CATEGORIES.join(', ') })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  categories: string[];
}
