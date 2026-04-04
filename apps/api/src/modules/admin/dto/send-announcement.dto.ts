import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendAnnouncementDto {
  @ApiProperty({ description: 'Announcement title', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: 'Announcement body', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  body: string;

  @ApiProperty({ required: false, description: 'Optional push data (key-value pairs for deep linking)' })
  @IsOptional()
  pushData?: Record<string, string>;
}
