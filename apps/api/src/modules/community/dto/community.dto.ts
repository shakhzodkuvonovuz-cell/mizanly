import {
  IsString, IsNumber, IsOptional, IsBoolean, IsIn,
  MaxLength, Min, Max, IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBoardDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty() @IsString() @MaxLength(100) city: string;
  @ApiProperty() @IsString() @MaxLength(100) country: string;
}

export class RequestMentorshipDto {
  @ApiProperty() @IsString() mentorId: string;
  @ApiProperty() @IsString() @IsIn(['new_muslim', 'quran', 'arabic', 'fiqh', 'general']) topic: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class RespondMentorshipDto {
  @ApiProperty() @IsBoolean() accept: boolean;
}

export class CreateStudyCircleDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty() @IsString() @IsIn(['quran', 'hadith', 'fiqh', 'seerah', 'arabic', 'tafsir']) topic: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) schedule?: string;
}

export class AskFatwaDto {
  @ApiProperty() @IsString() @MaxLength(2000) question: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['hanafi', 'maliki', 'shafii', 'hanbali', 'any']) madhab?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5) language?: string;
}

export class AnswerFatwaDto {
  @ApiProperty() @IsString() @MaxLength(5000) answer: string;
}

export class CreateOpportunityDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(2000) description: string;
  @ApiProperty() @IsString() category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000) spotsTotal?: number;
}

export class CreateEventDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty() @IsString() eventType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) location?: string;
  @ApiProperty() @IsString() startDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOnline?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() coverUrl?: string;
}

export class CreateVoicePostDto {
  @ApiProperty() @IsString() audioUrl: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(300) duration: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) transcript?: string;
}

export class CreateWatchPartyDto {
  @ApiProperty() @IsString() videoId: string;
  @ApiProperty() @IsString() @MaxLength(200) title: string;
}

export class CreateCollectionDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class CreateWaqfDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(2000) description: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(10_000_000) goalAmount: number;
}

export class KindnessCheckDto {
  @ApiProperty() @IsString() @MaxLength(2000) text: string;
}
