import { IsString, IsUUID, IsBoolean, IsIn, IsArray, ArrayMaxSize } from 'class-validator';

export class WsJoinConversationDto {
  @IsUUID()
  conversationId: string;
}

export class WsTypingDto {
  @IsUUID()
  conversationId: string;

  @IsBoolean()
  isTyping: boolean;
}

export class WsReadDto {
  @IsUUID()
  conversationId: string;
}

export class WsCallInitiateDto {
  @IsUUID()
  targetUserId: string;

  @IsIn(['AUDIO', 'VIDEO'])
  callType: string;

  @IsUUID()
  sessionId: string;
}

export class WsCallAnswerDto {
  @IsUUID()
  sessionId: string;

  @IsUUID()
  callerId: string;
}

export class WsCallRejectDto {
  @IsUUID()
  sessionId: string;

  @IsUUID()
  callerId: string;
}

export class WsCallEndDto {
  @IsUUID()
  sessionId: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  participants: string[];
}

export class WsCallSignalDto {
  @IsUUID()
  targetUserId: string;

  // signal is opaque WebRTC data — validated by size only
  signal: unknown;
}

export class WsMessageDeliveredDto {
  @IsUUID()
  messageId: string;

  @IsUUID()
  conversationId: string;
}

export class WsLeaveConversationDto {
  @IsUUID()
  conversationId: string;
}
