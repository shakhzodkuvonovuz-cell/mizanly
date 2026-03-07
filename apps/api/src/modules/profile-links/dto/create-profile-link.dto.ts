import { IsString, MaxLength, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProfileLinkDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  title: string;

  @ApiProperty({ maxLength: 500 })
  @IsUrl()
  @MaxLength(500)
  url: string;
}
