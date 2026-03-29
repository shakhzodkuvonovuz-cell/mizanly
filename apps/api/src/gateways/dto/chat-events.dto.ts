import { IsString, IsUUID, IsBoolean } from 'class-validator';

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
