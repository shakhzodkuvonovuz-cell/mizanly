import { IsString, IsOptional, MaxLength } from 'class-validator';

export class AddCommentDto {
  @IsString()
  @MaxLength(1000)
  content: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
