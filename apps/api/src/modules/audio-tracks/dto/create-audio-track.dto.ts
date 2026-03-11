import { IsString, IsOptional, IsNumber, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAudioTrackDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(100) artist: string;
  @ApiProperty() @IsNumber() duration: number;
  @ApiProperty() @IsString() audioUrl: string;
  @ApiProperty({ required: false }) @IsString() @IsOptional() coverUrl?: string;
  @ApiProperty({ default: false }) @IsBoolean() @IsOptional() isOriginal?: boolean;
}