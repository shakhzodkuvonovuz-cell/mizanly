import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum AudioRoomRole {
  LISTENER = 'listener',
  SPEAKER = 'speaker',
  HOST = 'host',
}

export class RoleChangeDto {
  @ApiProperty({ description: 'User ID to change role' })
  @IsString()
  userId: string;

  @ApiProperty({ enum: AudioRoomRole, enumName: 'AudioRoomRole' })
  @IsEnum(AudioRoomRole)
  role: AudioRoomRole;
}