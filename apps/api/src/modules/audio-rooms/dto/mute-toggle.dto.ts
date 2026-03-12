import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MuteToggleDto {
  @ApiProperty({ description: 'User ID to mute/unmute (optional, host only)', required: false })
  @IsOptional()
  @IsString()
  targetUserId?: string;
}