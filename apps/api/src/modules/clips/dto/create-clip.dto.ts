import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateClipDto {
  @IsNumber() @Min(0) startTime: number;
  @IsNumber() @Min(0.5) endTime: number;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
}
