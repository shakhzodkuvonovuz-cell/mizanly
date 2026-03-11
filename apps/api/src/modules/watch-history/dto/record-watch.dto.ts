import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordWatchDto {
  @ApiProperty({ description: 'Video ID to record watch progress for' })
  @IsString()
  videoId: string;

  @ApiProperty({ description: 'Progress in seconds', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  progress?: number;

  @ApiProperty({ description: 'Whether the video is completed', required: false })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}