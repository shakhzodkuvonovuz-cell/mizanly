import { IsString, MaxLength } from 'class-validator';

export class EditCommentDto {
  @IsString()
  @MaxLength(1000)
  content: string;
}
