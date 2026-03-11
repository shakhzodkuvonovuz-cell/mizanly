import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteCollabDto {
  @ApiProperty({ description: 'Post ID to invite collaborator to' })
  @IsString()
  postId: string;

  @ApiProperty({ description: 'User ID to invite' })
  @IsString()
  targetUserId: string;
}