import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDmDto {
  @ApiProperty({ description: 'Target user ID for the DM' })
  @IsUUID()
  targetUserId: string;
}
