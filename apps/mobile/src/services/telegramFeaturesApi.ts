import { api, qs } from './api';

type SavedMessage = {
  id: string;
  userId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  isPinned: boolean;
  tags?: string[];
  createdAt: string;
};

type ChatFolder = {
  id: string;
  userId: string;
  name: string;
  icon?: string;
  position: number;
  conversationIds: string[];
};

type GroupTopic = {
  id: string;
  conversationId: string;
  name: string;
  icon?: string;
  isPinned: boolean;
  isClosed: boolean;
  createdAt: string;
};

type AdminLogEntry = {
  id: string;
  conversationId: string;
  userId: string;
  action: string;
  details?: string;
  createdAt: string;
};

type EmojiPack = {
  id: string;
  name: string;
  creatorId: string;
  emojis?: CustomEmoji[];
  createdAt: string;
};

type CustomEmoji = {
  id: string;
  packId: string;
  shortcode: string;
  imageUrl: string;
};

type PaginatedResponse<T> = { data: T[]; meta: { cursor?: string; hasMore: boolean } };

export const telegramFeaturesApi = {
  // Saved Messages
  getSavedMessages: (cursor?: string) =>
    api.get<PaginatedResponse<SavedMessage>>(`/saved-messages${qs({ cursor })}`),

  searchSavedMessages: (q: string) =>
    api.get<SavedMessage[]>(`/saved-messages/search${qs({ q })}`),

  saveMessage: (data: {
    content: string;
    mediaUrl?: string;
    mediaType?: string;
    tags?: string[];
    originalMessageId?: string;
  }) =>
    api.post<SavedMessage>('/saved-messages', data),

  pinSavedMessage: (id: string) =>
    api.patch<SavedMessage>(`/saved-messages/${id}/pin`, {}),

  deleteSavedMessage: (id: string) =>
    api.delete<void>(`/saved-messages/${id}`),

  // Chat Folders
  getChatFolders: () =>
    api.get<ChatFolder[]>('/chat-folders'),

  createChatFolder: (data: {
    name: string;
    icon?: string;
    conversationIds?: string[];
    includeTypes?: string[];
    excludeMuted?: boolean;
    excludeRead?: boolean;
  }) =>
    api.post<ChatFolder>('/chat-folders', data),

  updateChatFolder: (id: string, data: {
    name?: string;
    icon?: string;
    conversationIds?: string[];
    includeTypes?: string[];
    excludeMuted?: boolean;
    excludeRead?: boolean;
  }) =>
    api.patch<ChatFolder>(`/chat-folders/${id}`, data),

  deleteChatFolder: (id: string) =>
    api.delete<void>(`/chat-folders/${id}`),

  reorderChatFolders: (folderIds: string[]) =>
    api.patch<void>('/chat-folders/reorder', { folderIds }),

  // Slow Mode
  setSlowMode: (conversationId: string, seconds: number) =>
    api.patch<void>(`/conversations/${conversationId}/slow-mode`, { seconds }),

  // Admin Log
  getAdminLog: (conversationId: string, cursor?: string) =>
    api.get<PaginatedResponse<AdminLogEntry>>(
      `/conversations/${conversationId}/admin-log${qs({ cursor })}`,
    ),

  // Group Topics
  createTopic: (conversationId: string, data: { name: string; icon?: string }) =>
    api.post<GroupTopic>(`/conversations/${conversationId}/topics`, data),

  getTopics: (conversationId: string) =>
    api.get<GroupTopic[]>(`/conversations/${conversationId}/topics`),

  updateTopic: (topicId: string, data: { name?: string; icon?: string; isClosed?: boolean }) =>
    api.patch<GroupTopic>(`/topics/${topicId}`, data),

  deleteTopic: (topicId: string) =>
    api.delete<void>(`/topics/${topicId}`),

  // Custom Emoji Packs
  getMyEmojiPacks: () =>
    api.get<EmojiPack[]>('/emoji-packs/me'),

  getEmojiPacks: (cursor?: string) =>
    api.get<PaginatedResponse<EmojiPack>>(`/emoji-packs${qs({ cursor })}`),

  createEmojiPack: (data: { name: string; description?: string }) =>
    api.post<EmojiPack>('/emoji-packs', data),

  addEmoji: (packId: string, data: { shortcode: string; imageUrl: string }) =>
    api.post<CustomEmoji>(`/emoji-packs/${packId}/emojis`, data),
};
