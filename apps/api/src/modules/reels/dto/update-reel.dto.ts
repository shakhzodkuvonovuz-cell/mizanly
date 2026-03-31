import { IsOptional, IsString, IsArray, MaxLength, ArrayMaxSize } from 'class-validator';

export class UpdateReelDto {
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  hashtags?: string[];
}
