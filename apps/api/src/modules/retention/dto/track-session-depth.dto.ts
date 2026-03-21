import { IsNumber, IsString, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TrackSessionDepthDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(100000) scrollDepth: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(86400000) timeSpentMs: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(100000) interactionCount: number;
  @ApiProperty({ enum: ['saf', 'majlis', 'risalah', 'bakra', 'minbar'] })
  @IsString()
  @IsIn(['saf', 'majlis', 'risalah', 'bakra', 'minbar'])
  space: string;
}
