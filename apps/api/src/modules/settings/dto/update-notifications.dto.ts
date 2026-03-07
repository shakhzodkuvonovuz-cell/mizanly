import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateNotificationsDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() notifyLikes?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() notifyComments?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() notifyFollows?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() notifyMentions?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() notifyMessages?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() notifyLiveStreams?: boolean;
  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean() emailDigest?: boolean;
}
