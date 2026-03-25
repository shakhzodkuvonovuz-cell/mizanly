import {
  IsString, IsOptional, IsArray, MaxLength,
  ValidateNested, IsBoolean, IsEnum, ArrayMaxSize, IsUrl, IsDateString, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class PollOptionDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  text: string;
}

class CreatePollDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  question: string;

  @ApiProperty({ type: [PollOptionDto], maxItems: 4 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  @ArrayMaxSize(4)
  options: PollOptionDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;
}

export class CreateThreadDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  content: string;

  @ApiProperty({ required: false, enum: ['PUBLIC', 'FOLLOWERS', 'CIRCLE'] })
  @IsOptional()
  @IsEnum(['PUBLIC', 'FOLLOWERS', 'CIRCLE'])
  visibility?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  circleId?: string;

  @ApiProperty({ required: false, type: [String], maxItems: 4 })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(4)
  mediaUrls?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 4 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(4)
  mediaTypes?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  hashtags?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  @MaxLength(50, { each: true })
  mentions?: string[];

  // For quote posts
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isQuotePost?: boolean;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  quoteText?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  repostOfId?: string;

  @ApiProperty({ required: false, type: CreatePollDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePollDto)
  poll?: CreatePollDto;

  @ApiProperty({ required: false, description: 'ISO 8601 datetime to schedule thread' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
