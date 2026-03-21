import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReportReason } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiProperty({ required: false, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reportedPostId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reportedUserId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reportedCommentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reportedMessageId?: string;
}