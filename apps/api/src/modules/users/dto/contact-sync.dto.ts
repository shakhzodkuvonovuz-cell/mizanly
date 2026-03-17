import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ContactSyncDto {
  @ApiProperty() @IsArray() @IsString({ each: true }) phoneNumbers: string[];
}
