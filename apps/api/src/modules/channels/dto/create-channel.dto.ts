import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Handle can only contain letters, numbers, and underscores' })
  handle: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}