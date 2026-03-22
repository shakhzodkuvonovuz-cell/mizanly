import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NasheedModeDto {
  @ApiProperty({ description: 'Enable or disable nasheed-only audio mode' })
  @IsBoolean()
  nasheedMode: boolean;
}
