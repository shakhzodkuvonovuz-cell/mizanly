import { IsEnum } from 'class-validator';

export class SetReplyPermissionDto {
  @IsEnum(['everyone', 'following', 'mentioned', 'none'])
  permission: 'everyone' | 'following' | 'mentioned' | 'none';
}
