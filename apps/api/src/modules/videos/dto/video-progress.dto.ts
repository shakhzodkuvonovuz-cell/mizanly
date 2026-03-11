import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VideoProgressDto {
  @ApiProperty({ description: 'Watch progress (0.0 to 1.0)', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  progress: number;
}