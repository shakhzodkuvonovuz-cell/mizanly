import { IsString, MaxLength } from 'class-validator';

export class UpdateThreadDto {
  @IsString()
  @MaxLength(500)
  content: string;
}
