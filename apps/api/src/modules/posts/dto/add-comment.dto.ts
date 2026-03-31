import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCommentDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  content: string;

  @ApiProperty({ required: false, description: 'Parent comment ID (CUID format)' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
