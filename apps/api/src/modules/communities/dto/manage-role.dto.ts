import { IsString, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ description: 'Role name', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Role color (hex)', required: false, example: '#FF5733' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color (e.g. #FF5733)' })
  color?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  canSendMessages?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  canPostMedia?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  canInvite?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  canKick?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  canBan?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  canManageRoles?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  canManageChannels?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  canSpeak?: boolean;
}

export class UpdateRoleDto {
  @ApiProperty({ description: 'Role name', required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ description: 'Role color (hex)', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a valid hex color (e.g. #FF5733)' })
  color?: string;

  @IsOptional() @IsBoolean() canSendMessages?: boolean;
  @IsOptional() @IsBoolean() canPostMedia?: boolean;
  @IsOptional() @IsBoolean() canInvite?: boolean;
  @IsOptional() @IsBoolean() canKick?: boolean;
  @IsOptional() @IsBoolean() canBan?: boolean;
  @IsOptional() @IsBoolean() canManageRoles?: boolean;
  @IsOptional() @IsBoolean() canManageChannels?: boolean;
  @IsOptional() @IsBoolean() canSpeak?: boolean;
}
