import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateVideoCommentDto {
  @IsString()
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}