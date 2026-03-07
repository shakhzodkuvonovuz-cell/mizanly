import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePlaylistDto {
  @ApiProperty({ description: 'ID of the channel that owns the playlist' })
  @IsString()
  channelId: string;

  @ApiProperty({ maxLength: 100, description: 'Playlist title' })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ required: false, maxLength: 500, description: 'Playlist description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, default: true, description: 'Whether the playlist is public' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}