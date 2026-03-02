import { IsOptional, IsBoolean, IsIn } from 'class-validator';

export class UpdatePrivacyDto {
  @IsOptional()
  @IsIn(['everyone', 'followers', 'none'])
  messagePermission?: string;

  @IsOptional()
  @IsIn(['everyone', 'followers', 'none'])
  mentionPermission?: string;

  @IsOptional()
  @IsBoolean()
  activityStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
