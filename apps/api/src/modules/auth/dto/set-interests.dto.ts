import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class SetInterestsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  categories: string[];
}
