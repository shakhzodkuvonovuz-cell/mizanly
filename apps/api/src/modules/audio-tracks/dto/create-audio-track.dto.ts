import { IsString, IsOptional, IsNumber, IsBoolean, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAudioTrackDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(100) artist: string;
  @ApiProperty() @IsNumber() duration: number;
  @ApiProperty() @IsUrl() audioUrl: string;
  @ApiProperty({ required: false }) @IsUrl() @IsOptional() coverUrl?: string;
  @ApiProperty({ default: false }) @IsBoolean() @IsOptional() isOriginal?: boolean;
}