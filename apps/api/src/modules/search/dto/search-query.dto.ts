import { IsString, IsOptional, IsIn, MaxLength, MinLength, IsNumberString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const VALID_TYPES = ['people', 'threads', 'posts', 'tags', 'reels', 'videos', 'channels'] as const;
type SearchType = typeof VALID_TYPES[number];

export class SearchQueryDto {
  @ApiProperty({ description: 'Search query text' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q: string;

  @ApiPropertyOptional({ enum: VALID_TYPES, description: 'Content type to search' })
  @IsOptional()
  @IsIn(VALID_TYPES)
  type?: SearchType;

  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;

  @ApiPropertyOptional({ description: 'Results per page (1-50, default 20)' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}

export class SearchSuggestionsDto {
  @ApiProperty({ description: 'Query prefix for autocomplete' })
  @IsString()
  @MaxLength(200)
  q: string;

  @ApiPropertyOptional({ description: 'Max suggestions (1-20, default 10)' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}

export class HashtagSearchDto {
  @ApiPropertyOptional({ description: 'Pagination cursor' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;
}
