import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelPostDto {
  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  content: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  @IsOptional()
  mediaUrls?: string[];
}