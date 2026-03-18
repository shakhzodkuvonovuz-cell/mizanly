import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CallType } from '@prisma/client';

export class InitiateCallDto {
  @ApiProperty({ description: 'User ID to call' })
  @IsString()
  targetUserId: string;

  @ApiProperty({ enum: CallType })
  @IsEnum(CallType)
  callType: CallType;
}
