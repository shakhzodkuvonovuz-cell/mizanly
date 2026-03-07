import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  content: string;
}