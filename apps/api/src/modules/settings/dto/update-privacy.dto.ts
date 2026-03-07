import { IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrivacyDto {
  @ApiProperty({ required: false, enum: ['everyone', 'followers', 'none'] })
  @IsOptional()
  @IsIn(['everyone', 'followers', 'none'])
  messagePermission?: string;

  @ApiProperty({ required: false, enum: ['everyone', 'followers', 'none'] })
  @IsOptional()
  @IsIn(['everyone', 'followers', 'none'])
  mentionPermission?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  activityStatus?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
