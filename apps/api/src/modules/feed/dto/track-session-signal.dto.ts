import { IsString, IsEnum, IsOptional, IsArray, IsNumber, Min, Max, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TrackSessionSignalDto {
  @ApiProperty() @IsString() contentId: string;

  @ApiProperty({ enum: ['view', 'like', 'save', 'share', 'skip'] })
  @IsEnum(['view', 'like', 'save', 'share', 'skip'])
  action: 'view' | 'like' | 'save' | 'share' | 'skip';

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  hashtags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  scrollPosition?: number;
}
