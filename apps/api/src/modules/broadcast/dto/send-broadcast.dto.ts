import { IsString, IsOptional, IsEnum, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendBroadcastDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  content?: string;

  @ApiProperty({ enum: ['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE'], default: 'TEXT' })
  @IsEnum(['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE'])
  @IsOptional()
  messageType?: string;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  mediaUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  mediaType?: string;
}