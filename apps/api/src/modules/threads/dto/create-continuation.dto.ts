import { IsString, MaxLength } from 'class-validator';

export class CreateContinuationDto {
  @IsString()
  @MaxLength(500)
  content: string;
}
