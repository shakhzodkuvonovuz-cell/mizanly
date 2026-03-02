import { IsString, MaxLength, IsUrl } from 'class-validator';

export class CreateProfileLinkDto {
  @IsString()
  @MaxLength(50)
  title: string;

  @IsUrl()
  @MaxLength(500)
  url: string;
}
