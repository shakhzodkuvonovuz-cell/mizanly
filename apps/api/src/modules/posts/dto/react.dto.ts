import { IsEnum } from 'class-validator';

export class ReactDto {
  @IsEnum(['LIKE', 'LOVE', 'SUPPORT', 'INSIGHTFUL'])
  reaction: string;
}
