import { IsString, IsOptional, MaxLength, IsUrl } from 'class-validator';

export class UpdateProfileLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  url?: string;
}
