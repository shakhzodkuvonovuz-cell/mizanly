import { IsArray, IsString, ArrayMaxSize, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ContactSyncDto {
  @ApiProperty() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(20, { each: true }) phoneNumbers: string[];
}
