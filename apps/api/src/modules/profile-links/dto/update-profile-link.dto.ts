import { IsString, IsOptional, MaxLength, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileLinkDto {
  @ApiProperty({ required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  url?: string;
}
