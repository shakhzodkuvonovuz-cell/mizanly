import {
  IsString, IsOptional, IsArray, MaxLength,
  ValidateNested, IsBoolean, IsEnum, ArrayMaxSize, IsUrl, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

class PollOptionDto {
  @IsString()
  @MaxLength(100)
  text: string;
}

class CreatePollDto {
  @IsString()
  @MaxLength(300)
  question: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  @ArrayMaxSize(4)
  options: PollOptionDto[];

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;
}

export class CreateThreadDto {
  @IsString()
  @MaxLength(500)
  content: string;

  @IsOptional()
  @IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE'])
  visibility?: string;

  @IsOptional()
  @IsString()
  circleId?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(4)
  mediaUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(4)
  mediaTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  // For quote posts
  @IsOptional()
  @IsBoolean()
  isQuotePost?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  quoteText?: string;

  @IsOptional()
  @IsString()
  repostOfId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePollDto)
  poll?: CreatePollDto;
}
