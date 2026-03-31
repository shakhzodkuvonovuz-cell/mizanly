import { IsEnum } from 'class-validator';

export class RespondToTagDto {
  @IsEnum(['APPROVED', 'DECLINED'])
  status: 'APPROVED' | 'DECLINED';
}
