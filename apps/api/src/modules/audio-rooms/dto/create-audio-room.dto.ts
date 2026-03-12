import { IsString, IsOptional, MaxLength, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAudioRoomDto {
  @ApiProperty({ description: 'Room title', maxLength: 300 })
  @IsString()
  @MaxLength(300)
  title: string;

  @ApiProperty({ description: 'Room description', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Scheduled start time (ISO string)', required: false })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}