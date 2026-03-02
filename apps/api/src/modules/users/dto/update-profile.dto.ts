import { IsString, IsOptional, MaxLength, IsUrl, IsBoolean } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(50) displayName?: string;
  @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsUrl() website?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsBoolean() isPrivate?: boolean;
}
