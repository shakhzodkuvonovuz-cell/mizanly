import { IsString, IsOptional, IsBoolean, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePlaylistDto {
  @ApiProperty({ description: 'ID of the channel that owns the playlist' })
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty({ maxLength: 200, description: 'Playlist title' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ required: false, maxLength: 1000, description: 'Playlist description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false, default: true, description: 'Whether the playlist is public' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}