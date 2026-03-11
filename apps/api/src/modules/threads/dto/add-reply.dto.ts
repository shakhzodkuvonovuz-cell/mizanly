import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddReplyDto {
  @ApiProperty({ description: 'Reply content', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  content: string;

  @ApiProperty({ required: false, description: 'Parent reply ID for nested replies' })
  @IsOptional()
  @IsString()
  parentId?: string;
}