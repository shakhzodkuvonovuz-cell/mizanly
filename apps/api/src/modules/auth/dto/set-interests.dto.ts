import { IsArray, IsEnum, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InterestCategory } from '@prisma/client';

export class SetInterestsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 20, enum: InterestCategory })
  @IsArray()
  @IsEnum(InterestCategory, { each: true, message: 'Each category must be one of: ' + Object.values(InterestCategory).join(', ') })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  categories: InterestCategory[];
}
