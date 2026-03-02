import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateNotificationsDto {
  @IsOptional() @IsBoolean() notifyLikes?: boolean;
  @IsOptional() @IsBoolean() notifyComments?: boolean;
  @IsOptional() @IsBoolean() notifyFollows?: boolean;
  @IsOptional() @IsBoolean() notifyMentions?: boolean;
  @IsOptional() @IsBoolean() notifyMessages?: boolean;
  @IsOptional() @IsBoolean() notifyLiveStreams?: boolean;
  @IsOptional() @IsBoolean() emailDigest?: boolean;
}
