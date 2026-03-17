import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetTrailerDto {
  @ApiProperty({ description: 'ID of the video to set as the channel trailer' })
  @IsString()
  videoId: string;
}
