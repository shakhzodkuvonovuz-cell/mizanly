import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ArchiveConversationDto {
  @ApiProperty({ description: 'Whether to archive (true) or unarchive (false)' })
  @IsBoolean()
  archived: boolean;
}
