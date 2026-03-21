import { IsArray, IsString, ArrayMaxSize, ArrayMinSize, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ManageMembersDto {
  @ApiProperty({ description: 'User IDs to add/remove', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  memberIds: string[];
}
