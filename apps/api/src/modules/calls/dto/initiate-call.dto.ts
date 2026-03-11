import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateCallDto {
  @ApiProperty({ description: 'User ID to call' })
  @IsString()
  targetUserId: string;

  @ApiProperty({ enum: ['VOICE', 'VIDEO'] })
  @IsEnum(['VOICE', 'VIDEO'])
  callType: string;
}