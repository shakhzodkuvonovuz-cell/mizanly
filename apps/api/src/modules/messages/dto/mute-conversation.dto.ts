import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MuteConversationDto {
  @ApiProperty({ description: 'Whether to mute (true) or unmute (false)' })
  @IsBoolean()
  muted: boolean;
}
