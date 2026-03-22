import { IsOptional, IsString, MaxLength, IsNumberString } from 'class-validator';

export class TrendingQueryDto {
  @IsOptional() @IsNumberString() limit?: string;
}

export class SearchQueryDto {
  @IsString() @MaxLength(100) q: string;
  @IsOptional() @IsNumberString() limit?: string;
}

export class HashtagContentQueryDto {
  @IsOptional() @IsString() cursor?: string;
}
