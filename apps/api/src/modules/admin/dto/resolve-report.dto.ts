import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveReportDto {
  @ApiProperty({ description: 'Action to take', enum: ['DISMISS', 'WARN', 'REMOVE_CONTENT', 'BAN_USER', 'TEMP_BAN', 'MUTE'] })
  @IsEnum(['DISMISS', 'WARN', 'REMOVE_CONTENT', 'BAN_USER', 'TEMP_BAN', 'MUTE'])
  action: 'DISMISS' | 'WARN' | 'REMOVE_CONTENT' | 'BAN_USER' | 'TEMP_BAN' | 'MUTE';

  @ApiProperty({ required: false, description: 'Moderator note', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
