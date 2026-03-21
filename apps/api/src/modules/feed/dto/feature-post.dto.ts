import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FeaturePostDto {
  @ApiProperty({ description: 'Whether to feature or unfeature the post' })
  @IsBoolean()
  featured: boolean;
}
