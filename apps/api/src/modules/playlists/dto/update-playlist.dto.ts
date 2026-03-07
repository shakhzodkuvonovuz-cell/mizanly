import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePlaylistDto {
  @ApiProperty({ required: false, maxLength: 200, description: 'Playlist title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false, maxLength: 1000, description: 'Playlist description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false, description: 'Whether the playlist is public' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}