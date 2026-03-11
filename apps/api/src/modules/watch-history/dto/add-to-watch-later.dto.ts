import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddToWatchLaterDto {
  @ApiProperty({ description: 'Video ID to add to watch later' })
  @IsString()
  videoId: string;
}