import { IsString, IsOptional, MaxLength, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(50) displayName?: string;
  @IsOptional() @IsString() @MaxLength(160) bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() coverPhotoUrl?: string;
  @IsOptional() @IsUrl() websiteUrl?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() theme?: string;
}
