import { IsString, IsOptional, IsEnum, IsDateString, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLiveDto {
  @ApiProperty({ example: 'Friday Khutbah' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiProperty({ enum: ['VIDEO_STREAM', 'AUDIO_SPACE'] })
  @IsEnum(['VIDEO_STREAM', 'AUDIO_SPACE'])
  liveType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  isRecorded?: boolean;
}