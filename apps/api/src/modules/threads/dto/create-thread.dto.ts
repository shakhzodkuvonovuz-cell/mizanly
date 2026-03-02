import { IsString, IsOptional, IsArray, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ThreadMediaDto {
  @IsString() url: string;
  @IsOptional() @IsString() type?: string;
}

class PollDto {
  @IsString() @MaxLength(300) question: string;
  @IsArray() @IsString({ each: true }) options: string[];
  @IsString() expiresAt: string;
}

export class CreateThreadDto {
  @IsString() @MaxLength(500) content: string;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsString() circleId?: string;
  @IsOptional() @IsString() replyToId?: string;
  @IsOptional() @IsString() rootThreadId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ThreadMediaDto) media?: ThreadMediaDto[];
  @IsOptional() @ValidateNested() @Type(() => PollDto) poll?: PollDto;
}
