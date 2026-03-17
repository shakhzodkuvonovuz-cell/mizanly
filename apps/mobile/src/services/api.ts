import type {
  Post, Story, StoryGroup, StoryHighlightAlbum, Thread, Reel, ThreadReply, Message, Conversation,
  Comment, Notification, SearchResults, PaginatedResponse, User,
  Circle, CircleMember, ProfileLink, FollowRequest, TrendingHashtag,
  BlockedKeyword, Report, AdminStats, SuggestedUser, CreatorStat, Settings,
  BlockedUser, MutedUser,
  Channel, Video, VideoComment, Playlist, PlaylistItem, PlaylistCollaborator, WatchHistoryItem,
  ScheduledItem, MajlisList, Poll, SubtitleTrack, VideoChapter,
  BroadcastChannel, BroadcastMessage, LiveSession, LiveParticipant,
  CallSession, StickerPack, StickerItem, PostCollab,
  ChannelPost, AudioTrack, FeedDismissal,
  HashtagInfo, BookmarkCollection, SearchSuggestion, ModerationLogEntry,
  DMNote, OfflineDownload, EndScreen,
} from '@/types';

// ── Request payload types (API layer only) ──

type UpdateUserPayload = {
  displayName?: string;
  username?: string;
  bio?: string;
  website?: string;
  isPrivate?: boolean;
  avatarUrl?: string;
  coverUrl?: string;
};

type CreatePostPayload = {
  postType: string;
  content?: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  thumbnailUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  visibility?: string;
  locationName?: string;
  hashtags?: string[];
  hideLikesCount?: boolean;
  commentsDisabled?: boolean;
};

type CreateStoryPayload = {
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl?: string;
  textOverlay?: string;
  textColor?: string;
  bgColor?: string;
  fontFamily?: string;
  filter?: string;
  bgGradient?: string;
  stickerData?: object[];
  closeFriendsOnly?: boolean;
};

type UpdateHighlightPayload = { title?: string; coverUrl?: string; position?: number };

type CreateThreadPayload = {
  content: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  visibility?: string;
  isQuotePost?: boolean;
  quoteText?: string;
};

type CreateReelPayload = {
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  caption?: string;
  mentions?: string[];
  hashtags?: string[];
  audioTrackId?: string;
  isDuet?: boolean;
  isStitch?: boolean;
};

type CreateVideoData = {
  channelId: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  category?: string;
  tags?: string[];
};

type SendMessagePayload = {
  content?: string;
  messageType?: string;
  mediaUrl?: string;
  replyToId?: string;
  voiceDuration?: number;
};

type PrivacySettings = { isPrivate?: boolean };
type NotificationSettings = {
  notifyLikes?: boolean;
  notifyComments?: boolean;
  notifyFollows?: boolean;
  notifyMentions?: boolean;
  notifyMessages?: boolean;
};
type AccessibilitySettings = { reducedMotion?: boolean; fontSize?: string };
type WellbeingSettings = { sensitiveContentFilter?: boolean; dailyTimeLimit?: number };

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

class ApiClient {
  private getToken: (() => Promise<string | null>) | null = null;

  setTokenGetter(getter: () => Promise<string | null>) {
    this.getToken = getter;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let token: string | null = null;
    try {
      token = this.getToken ? await this.getToken() : null;
    } catch (e) {
      console.error('[API] Token getter failed:', e);
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Request failed' }));
      console.error(`[API] ${options.method || 'GET'} ${path} → ${res.status}`, error);
      throw new Error(error.message || `HTTP ${res.status}`);
    }

    if (res.status === 204) return null as T;
    const json = await res.json();
    // Unwrap TransformInterceptor envelope
    // Paginated responses have { success, data, meta, timestamp } — keep data + meta together
    if (json.success && json.meta !== undefined) {
      return { data: json.data, meta: json.meta } as T;
    }
    // Non-paginated: { success, data, timestamp } — return just data
    return json.data !== undefined ? json.data : json;
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }
  delete<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const api = new ApiClient();

// Build query string from params object, skipping undefined/empty values
const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return s ? `?${s}` : '';
};

// ── Auth ──
export const authApi = {
  register: (data: { clerkId: string; username: string; displayName: string; avatarUrl?: string }) =>
    api.post<User>('/auth/register', data),
  me: () => api.get<User>('/auth/me'),
  checkUsername: (username: string) =>
    api.get<{ available: boolean }>(`/auth/check-username?username=${encodeURIComponent(username)}`),
  setInterests: (categories: string[]) => api.post('/auth/interests', { categories }),
  suggestedUsers: () => api.get<User[]>('/auth/suggested-users'),
};

// ── Users ──
export const usersApi = {
  getMe: () => api.get<User>('/users/me'),
  updateMe: (data: UpdateUserPayload) => api.patch<User>('/users/me', data),
  deactivate: () => api.delete('/users/me/deactivate'),
  deleteAccount: () => api.delete('/users/me'),
  getProfile: (username: string) => api.get<User>(`/users/${username}`),
  getUserPosts: (username: string, cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/users/${username}/posts${qs({ cursor })}`),
  getUserThreads: (username: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/users/${username}/threads${qs({ cursor })}`),
  getSavedPosts: (cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/users/me/saved-posts${qs({ cursor })}`),
  getSavedThreads: (cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/users/me/saved-threads${qs({ cursor })}`),
  getSavedReels: (cursor?: string) =>
    api.get<PaginatedResponse<Reel>>(`/users/me/saved-reels${qs({ cursor })}`),
  getSavedVideos: (cursor?: string) =>
    api.get<PaginatedResponse<Video>>(`/users/me/saved-videos${qs({ cursor })}`),
  getFollowRequests: () => api.get('/users/me/follow-requests'),
  getAnalytics: () => api.get<{ stats: CreatorStat[] }>('/users/me/analytics'),
  getWatchHistory: (cursor?: string) =>
    api.get<PaginatedResponse<WatchHistoryItem>>(`/users/me/watch-history${qs({ cursor })}`),
  clearWatchHistory: () =>
    api.delete('/users/me/watch-history'),
  getWatchLater: (cursor?: string) =>
    api.get<PaginatedResponse<Video>>(`/users/me/watch-later${qs({ cursor })}`),
  addWatchLater: (videoId: string) => api.post(`/users/me/watch-later/${videoId}`),
  removeWatchLater: (videoId: string) => api.delete(`/users/me/watch-later/${videoId}`),
  report: (userId: string, reason: string) => api.post(`/users/${userId}/report`, { reason }),
  getArchive: () => api.get<Story[]>('/stories/me/archived'),
  getMutualFollowers: (username: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/users/${username}/mutual-followers${qs({ cursor })}`),
  getLikedPosts: (cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/users/me/liked-posts${qs({ cursor })}`),
  exportData: () =>
    api.get<Record<string, unknown>>('/users/me/export-data'),
  requestAccountDeletion: () =>
    api.post('/users/me/delete-account'),
  cancelAccountDeletion: () =>
    api.post('/users/me/cancel-deletion'),
  updateDailyReminder: (enabled: boolean, time?: string) => api.patch('/users/settings/daily-reminder', { enabled, time }),
  updateNasheedMode: (nasheedMode: boolean) => api.patch<{ id: string; nasheedMode: boolean }>('/users/me/nasheed-mode', { nasheedMode }),
  syncContacts: (phoneNumbers: string[]) => api.post<Array<{ id: string; username: string; displayName: string; avatarUrl: string | null; isVerified: boolean; isFollowing: boolean }>>('/users/contacts/sync', { phoneNumbers }),
};

// ── Follows ──
export const followsApi = {
  follow: (userId: string) => api.post(`/follows/${userId}`),
  unfollow: (userId: string) => api.delete(`/follows/${userId}`),
  getFollowers: (userId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/follows/${userId}/followers${qs({ cursor })}`),
  getFollowing: (userId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/follows/${userId}/following${qs({ cursor })}`),
  getRequests: () => api.get<PaginatedResponse<FollowRequest>>('/follows/requests/incoming'),
  acceptRequest: (id: string) => api.post(`/follows/requests/${id}/accept`),
  declineRequest: (id: string) => api.post(`/follows/requests/${id}/decline`),
  cancelRequest: (id: string) => api.delete(`/follows/requests/${id}`),
  suggestions: () => api.get<User[]>('/follows/suggestions'),
};

// ── Posts (Saf) ──
export const postsApi = {
  getFeed: (type: 'following' | 'foryou' = 'following', cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/posts/feed${qs({ type, cursor })}`),
  create: (data: CreatePostPayload) => api.post<Post>('/posts', data),
  getById: (id: string) => api.get<Post>(`/posts/${id}`),
  update: (id: string, data: Partial<CreatePostPayload>) => api.patch<Post>(`/posts/${id}`, data),
  delete: (id: string) => api.delete(`/posts/${id}`),
  react: (id: string, reaction: string) => api.post(`/posts/${id}/react`, { reaction }),
  unreact: (id: string) => api.delete(`/posts/${id}/react`),
  save: (id: string) => api.post(`/posts/${id}/save`),
  unsave: (id: string) => api.delete(`/posts/${id}/save`),
  share: (id: string, content?: string) => api.post(`/posts/${id}/share`, { content }),
  getComments: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<Comment>>(`/posts/${id}/comments${qs({ cursor })}`),
  addComment: (id: string, content: string, parentId?: string) =>
    api.post<Comment>(`/posts/${id}/comments`, { content, parentId }),
  editComment: (postId: string, commentId: string, content: string) =>
    api.patch<Comment>(`/posts/${postId}/comments/${commentId}`, { content }),
  report: (id: string, reason: string) => api.post(`/posts/${id}/report`, { reason }),
  dismiss: (id: string) => api.post(`/posts/${id}/dismiss`),
  deleteComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}`),
  likeComment: (postId: string, commentId: string) =>
    api.post(`/posts/${postId}/comments/${commentId}/like`),
  unlikeComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}/like`),
  getCommentReplies: (postId: string, commentId: string, cursor?: string) =>
    api.get<PaginatedResponse<Comment>>(`/posts/${postId}/comments/${commentId}/replies${qs({ cursor })}`),
  archive: (id: string) =>
    api.post(`/posts/${id}/archive`),
  unarchive: (id: string) =>
    api.post(`/posts/${id}/unarchive`),
  getArchived: (cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/posts/archived${qs({ cursor })}`),
  pinComment: (postId: string, commentId: string) =>
    api.post(`/posts/${postId}/comments/${commentId}/pin`),
  unpinComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}/pin`),
  hideComment: (postId: string, commentId: string) =>
    api.post(`/posts/${postId}/comments/${commentId}/hide`),
  unhideComment: (postId: string, commentId: string) =>
    api.delete(`/posts/${postId}/comments/${commentId}/hide`),
  getHiddenComments: (postId: string, cursor?: string) =>
    api.get<PaginatedResponse<Comment>>(`/posts/${postId}/comments/hidden${qs({ cursor })}`),
  getShareLink: (id: string) =>
    api.get<{ url: string }>(`/posts/${id}/share-link`),
  shareAsStory: (id: string) => api.post(`/posts/${id}/share-as-story`),
  crossPost: (id: string, data: { targetSpaces: string[]; captionOverride?: string }) =>
    api.post<Post[]>(`/posts/${id}/cross-post`, data),
};

// ── Stories (Saf) ──
export const storiesApi = {
  getFeed: () => api.get<StoryGroup[]>('/stories/feed'),
  create: (data: CreateStoryPayload) => api.post<Story>('/stories', data),
  getById: (id: string) => api.get<Story>(`/stories/${id}`),
  delete: (id: string) => api.delete(`/stories/${id}`),
  markViewed: (id: string) => api.post<{ viewed: boolean }>(`/stories/${id}/view`),
  getViewers: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/stories/${id}/viewers${qs({ cursor })}`),
  getHighlights: (userId: string) => api.get<StoryHighlightAlbum[]>(`/stories/highlights/${userId}`),
  getHighlightById: (albumId: string) => api.get<StoryHighlightAlbum>(`/stories/highlights/album/${albumId}`),
  createHighlight: (title: string, coverUrl?: string) =>
    api.post<StoryHighlightAlbum>('/stories/highlights', { title, coverUrl }),
  updateHighlight: (albumId: string, data: UpdateHighlightPayload) =>
    api.patch<StoryHighlightAlbum>(`/stories/highlights/${albumId}`, data),
  deleteHighlight: (albumId: string) => api.delete(`/stories/highlights/${albumId}`),
  addToHighlight: (albumId: string, storyId: string) =>
    api.post(`/stories/highlights/${albumId}/stories/${storyId}`),
  getArchived: () => api.get<Story[]>('/stories/me/archived'),
  unarchive: (id: string) => api.patch<{ unarchived: boolean }>(`/stories/${id}/unarchive`),
  replyToStory: (storyId: string, content: string) =>
    api.post<Message>(`/stories/${storyId}/reply`, { content }),
  getReactionSummary: (storyId: string) =>
    api.get<Record<string, number>>(`/stories/${storyId}/reactions/summary`),
  submitStickerResponse: (storyId: string, stickerType: string, responseData: Record<string, unknown>) =>
    api.post(`/stories/${storyId}/sticker-response`, { stickerType, responseData }),
  getStickerResponses: (storyId: string, type?: string) =>
    api.get<{ stickerType: string; responseData: Record<string, unknown>; user: User }[]>(
      `/stories/${storyId}/sticker-responses${type ? `?type=${encodeURIComponent(type)}` : ''}`,
    ),
  getStickerSummary: (storyId: string) =>
    api.get<Record<string, Record<string, number>>>(`/stories/${storyId}/sticker-summary`),
};

// ── Reels (Bakra) ──
export const reelsApi = {
  getFeed: (cursor?: string) => api.get<PaginatedResponse<Reel>>(`/reels/feed${qs({ cursor })}`),
  getById: (id: string) => api.get<Reel>(`/reels/${id}`),
  create: (data: CreateReelPayload) => api.post<Reel>('/reels', data),
  delete: (id: string) => api.delete(`/reels/${id}`),
  deleteComment: (reelId: string, commentId: string) => api.delete(`/reels/${reelId}/comments/${commentId}`),
  like: (id: string) => api.post(`/reels/${id}/like`),
  unlike: (id: string) => api.delete(`/reels/${id}/like`),
  comment: (id: string, content: string) => api.post(`/reels/${id}/comment`, { content }),
  getComments: (id: string, cursor?: string) => api.get<PaginatedResponse<Comment>>(`/reels/${id}/comments${qs({ cursor })}`),
  share: (id: string) => api.post(`/reels/${id}/share`),
  bookmark: (id: string) => api.post(`/reels/${id}/bookmark`),
  unbookmark: (id: string) => api.delete(`/reels/${id}/bookmark`),
  view: (id: string) => api.post(`/reels/${id}/view`),
  getUserReels: (username: string, cursor?: string) => api.get<PaginatedResponse<Reel>>(`/reels/user/${username}${qs({ cursor })}`),
  report: (id: string, reason: string) => api.post(`/reels/${id}/report`, { reason }),
  getByAudioTrack: (audioTrackId: string, cursor?: string) =>
    api.get<PaginatedResponse<Reel>>(`/reels/audio/${audioTrackId}${qs({ cursor })}`),
  getDuets: (reelId: string, cursor?: string) =>
    api.get<PaginatedResponse<Reel>>(`/reels/${reelId}/duets${qs({ cursor })}`),
  getStitches: (reelId: string, cursor?: string) =>
    api.get<PaginatedResponse<Reel>>(`/reels/${reelId}/stitches${qs({ cursor })}`),
  archive: (reelId: string) =>
    api.post(`/reels/${reelId}/archive`),
  unarchive: (reelId: string) =>
    api.post(`/reels/${reelId}/unarchive`),
  getShareLink: (id: string) =>
    api.get<{ url: string }>(`/reels/${id}/share-link`),
  likeComment: (reelId: string, commentId: string) => api.post(`/reels/${reelId}/comments/${commentId}/like`),
  unlikeComment: (reelId: string, commentId: string) => api.delete(`/reels/${reelId}/comments/${commentId}/like`),
};

// ── Channels (Minbar) ──
export const channelsApi = {
  create: (data: { handle: string; name: string; description?: string }) =>
    api.post<Channel>('/channels', data).then(r => r.data),
  getByHandle: (handle: string) =>
    api.get<Channel>(`/channels/${handle}`).then(r => r.data),
  update: (handle: string, data: Partial<Channel>) =>
    api.patch<Channel>(`/channels/${handle}`, data).then(r => r.data),
  delete: (handle: string) =>
    api.delete(`/channels/${handle}`).then(r => r.data),
  subscribe: (handle: string) =>
    api.post(`/channels/${handle}/subscribe`).then(r => r.data),
  unsubscribe: (handle: string) =>
    api.delete(`/channels/${handle}/subscribe`).then(r => r.data),
  getVideos: (handle: string, cursor?: string) =>
    api.get<PaginatedResponse<Video>>(`/channels/${handle}/videos${qs({ cursor })}`).then(r => r.data),
  getMyChannels: () =>
    api.get<Channel[]>('/channels/me/channels').then(r => r.data),
  getAnalytics: (channelId: string) =>
    api.get<{ views: number; subscribers: number; videos: number; recentSubscribers: number[] }>(`/channels/${channelId}/analytics`).then(r => r.data),
  getSubscribers: (channelId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/channels/${channelId}/subscribers${qs({ cursor })}`).then(r => r.data),
  getRecommended: (limit?: number) =>
    api.get<Channel[]>(`/channels/recommended${qs({ limit })}`).then(r => r.data),
  setTrailer: (handle: string, videoId: string) =>
    api.put(`/channels/${handle}/trailer`, { videoId }).then(r => r.data),
  removeTrailer: (handle: string) =>
    api.delete(`/channels/${handle}/trailer`).then(r => r.data),
};

// ── Videos (Minbar) ──
export const videosApi = {
  getFeed: (category?: string, cursor?: string) =>
    api.get<PaginatedResponse<Video>>(`/videos/feed${qs({ category, cursor })}`).then(r => r.data),
  getById: (id: string) =>
    api.get<Video>(`/videos/${id}`).then(r => r.data),
  create: (data: CreateVideoData) =>
    api.post<Video>('/videos', data).then(r => r.data),
  update: (id: string, data: Partial<Video>) =>
    api.patch<Video>(`/videos/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/videos/${id}`).then(r => r.data),
  like: (id: string) =>
    api.post(`/videos/${id}/like`).then(r => r.data),
  dislike: (id: string) =>
    api.post(`/videos/${id}/dislike`).then(r => r.data),
  removeReaction: (id: string) =>
    api.delete(`/videos/${id}/reaction`).then(r => r.data),
  comment: (id: string, content: string, parentId?: string) =>
    api.post(`/videos/${id}/comment`, { content, parentId }).then(r => r.data),
  getComments: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<VideoComment>>(`/videos/${id}/comments${qs({ cursor })}`).then(r => r.data),
  bookmark: (id: string) =>
    api.post(`/videos/${id}/bookmark`).then(r => r.data),
  unbookmark: (id: string) =>
    api.delete(`/videos/${id}/bookmark`).then(r => r.data),
  view: (id: string) =>
    api.post(`/videos/${id}/view`).then(r => r.data),
  updateProgress: (id: string, progress: number, completed: boolean) =>
    api.patch(`/videos/${id}/progress`, { progress, completed }).then(r => r.data),
  report: (id: string, reason: string) =>
    api.post(`/videos/${id}/report`, { reason }).then(r => r.data),
  getRecommended: (videoId: string, limit?: number) =>
    api.get<Video[]>(`/videos/${videoId}/recommended${qs({ limit })}`).then(r => r.data),
  getCommentReplies: (commentId: string, cursor?: string) =>
    api.get<PaginatedResponse<VideoComment>>(`/videos/comments/${commentId}/replies${qs({ cursor })}`).then(r => r.data),
  recordProgress: (videoId: string, progress: number) =>
    api.patch(`/videos/${videoId}/progress`, { progress, completed: false }).then(r => r.data),
  getShareLink: (id: string) =>
    api.get<{ url: string }>(`/videos/${id}/share-link`).then(r => r.data),
  // Premiere
  createPremiere: (id: string, dto: { scheduledAt: string; chatEnabled?: boolean; countdownTheme?: string }) =>
    api.post(`/videos/${id}/premiere`, dto),
  getPremiere: (id: string) =>
    api.get(`/videos/${id}/premiere`),
  setPremiereReminder: (id: string) =>
    api.post(`/videos/${id}/premiere/reminder`),
  removePremiereReminder: (id: string) =>
    api.delete(`/videos/${id}/premiere/reminder`),
  startPremiere: (id: string) =>
    api.post(`/videos/${id}/premiere/start`),
  getPremiereViewers: (id: string) =>
    api.get(`/videos/${id}/premiere/viewers`),
  // End Screens
  setEndScreens: (id: string, items: Array<{ type: string; targetId?: string; label: string; url?: string; position: string; showAtSeconds: number }>) =>
    api.put<EndScreen[]>(`/videos/${id}/end-screens`, { items }).then(r => r.data),
  getEndScreens: (id: string) =>
    api.get<EndScreen[]>(`/videos/${id}/end-screens`).then(r => r.data),
  deleteEndScreens: (id: string) =>
    api.delete(`/videos/${id}/end-screens`).then(r => r.data),
};
// ── Playlists (Minbar) ──
export const playlistsApi = {
  create: (data: { channelId: string; title: string; description?: string; isPublic?: boolean }) =>
    api.post<Playlist>('/playlists', data).then(r => r.data),
  getById: (id: string) =>
    api.get<Playlist>(`/playlists/${id}`).then(r => r.data),
  getByChannel: (channelId: string, cursor?: string) =>
    api.get<PaginatedResponse<Playlist>>(`/playlists/channel/${channelId}${qs({ cursor })}`).then(r => r.data),
  getItems: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<PlaylistItem>>(`/playlists/${id}/items${qs({ cursor })}`).then(r => r.data),
  update: (id: string, data: Partial<Playlist>) =>
    api.patch<Playlist>(`/playlists/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/playlists/${id}`).then(r => r.data),
  addItem: (id: string, videoId: string) =>
    api.post(`/playlists/${id}/items/${videoId}`).then(r => r.data),
  removeItem: (id: string, videoId: string) =>
    api.delete(`/playlists/${id}/items/${videoId}`).then(r => r.data),
  toggleCollaborative: (id: string) =>
    api.post(`/playlists/${id}/collaborative`).then(r => r.data),
  getCollaborators: (id: string) =>
    api.get<{ data: PlaylistCollaborator[] }>(`/playlists/${id}/collaborators`).then(r => r.data),
  addCollaborator: (id: string, userId: string, role?: string) =>
    api.post<PlaylistCollaborator>(`/playlists/${id}/collaborators`, { userId, role }).then(r => r.data),
  removeCollaborator: (id: string, userId: string) =>
    api.delete(`/playlists/${id}/collaborators/${userId}`).then(r => r.data),
  updateCollaboratorRole: (id: string, userId: string, role: string) =>
    api.patch<PlaylistCollaborator>(`/playlists/${id}/collaborators/${userId}`, { role }).then(r => r.data),
};

// ── Threads (Majlis) ──
export const threadsApi = {
  getFeed: (type: 'foryou' | 'following' | 'trending' = 'foryou', cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/threads/feed${qs({ type, cursor })}`),
  create: (data: CreateThreadPayload) => api.post<Thread>('/threads', data),
  getById: (id: string) => api.get<Thread>(`/threads/${id}`),
  delete: (id: string) => api.delete(`/threads/${id}`),
  report: (id: string, reason: string) => api.post(`/threads/${id}/report`, { reason }),
  dismiss: (id: string) => api.post(`/threads/${id}/dismiss`),
  like: (id: string) => api.post(`/threads/${id}/like`),
  unlike: (id: string) => api.delete(`/threads/${id}/like`),
  repost: (id: string) => api.post<Thread>(`/threads/${id}/repost`),
  unrepost: (id: string) => api.delete(`/threads/${id}/repost`),
  bookmark: (id: string) => api.post(`/threads/${id}/bookmark`),
  unbookmark: (id: string) => api.delete(`/threads/${id}/bookmark`),
  getReplies: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<ThreadReply>>(`/threads/${id}/replies${qs({ cursor })}`),
  addReply: (id: string, content: string, parentId?: string) =>
    api.post<ThreadReply>(`/threads/${id}/replies`, { content, parentId }),
  deleteReply: (threadId: string, replyId: string) =>
    api.delete(`/threads/${threadId}/replies/${replyId}`),
  likeReply: (threadId: string, replyId: string) =>
    api.post(`/threads/${threadId}/replies/${replyId}/like`),
  unlikeReply: (threadId: string, replyId: string) =>
    api.delete(`/threads/${threadId}/replies/${replyId}/like`),
  votePoll: (optionId: string) => api.post(`/threads/polls/${optionId}/vote`),
  getUserThreads: (username: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/threads/user/${username}${qs({ cursor })}`),
  setReplyPermission: (threadId: string, permission: 'everyone' | 'following' | 'mentioned' | 'none') =>
    api.patch(`/threads/${threadId}/reply-permission`, { permission }),
  canReply: (threadId: string) =>
    api.get<{ canReply: boolean }>(`/threads/${threadId}/can-reply`),
  getShareLink: (id: string) =>
    api.get<{ url: string }>(`/threads/${id}/share-link`),
  isBookmarked: (threadId: string) =>
    api.get<{ bookmarked: boolean }>(`/threads/${threadId}/bookmarked`),
};

// ── Messages (Risalah) ──
export const messagesApi = {
  getConversations: () => api.get<Conversation[]>('/messages/conversations'),
  getConversation: (id: string) => api.get<Conversation>(`/messages/conversations/${id}`),
  getMessages: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<Message>>(`/messages/conversations/${id}/messages${qs({ cursor })}`),
  sendMessage: (id: string, data: SendMessagePayload) =>
    api.post<Message>(`/messages/conversations/${id}/messages`, data),
  deleteMessage: (convId: string, messageId: string) =>
    api.delete(`/messages/conversations/${convId}/messages/${messageId}`),
  editMessage: (convId: string, messageId: string, content: string) =>
    api.patch(`/messages/conversations/${convId}/messages/${messageId}`, { content }),
  reactToMessage: (convId: string, messageId: string, emoji: string) =>
    api.post(`/messages/conversations/${convId}/messages/${messageId}/react`, { emoji }),
  removeReaction: (convId: string, messageId: string, emoji: string) =>
    api.delete(`/messages/conversations/${convId}/messages/${messageId}/react`, { emoji }),
  markRead: (id: string) => api.post(`/messages/conversations/${id}/read`),
  mute: (id: string, muted: boolean) =>
    api.post(`/messages/conversations/${id}/mute`, { muted }),
  archive: (id: string, archived: boolean) =>
    api.post(`/messages/conversations/${id}/archive`, { archived }),
  createDM: (targetUserId: string) => api.post<Conversation>('/messages/dm', { targetUserId }),
  createGroup: (groupName: string, memberIds: string[]) =>
    api.post<Conversation>('/messages/groups', { groupName, memberIds }),
  updateGroup: (id: string, data: { groupName?: string; groupAvatarUrl?: string }) =>
    api.patch<Conversation>(`/messages/groups/${id}`, data),
  addMembers: (id: string, memberIds: string[]) =>
    api.post(`/messages/groups/${id}/members`, { memberIds }),
  removeMember: (id: string, userId: string) =>
    api.delete(`/messages/groups/${id}/members/${userId}`),
  leaveGroup: (id: string) => api.delete(`/messages/groups/${id}/members/me`),
  setDisappearingTimer: (conversationId: string, duration: number) =>
    api.patch(`/messages/conversations/${conversationId}/disappearing-timer`, { duration }),
  archiveConversation: (conversationId: string) =>
    api.post(`/messages/conversations/${conversationId}/archive`),
  unarchiveConversation: (conversationId: string) =>
    api.delete(`/messages/conversations/${conversationId}/archive`),
  getArchivedConversations: (cursor?: string) =>
    api.get<PaginatedResponse<Conversation>>(`/messages/conversations/archived${qs({ cursor })}`),
  scheduleMessage: (conversationId: string, content: string, scheduledAt: string, messageType?: string) =>
    api.post<Message>(`/messages/conversations/${conversationId}/schedule`, { content, scheduledAt, messageType }),
  getStarredMessages: (cursor?: string) =>
    api.get<PaginatedResponse<Message>>(`/messages/starred${qs({ cursor })}`),
  pin: (conversationId: string, messageId: string) => api.post(`/messages/${conversationId}/${messageId}/pin`),
  unpin: (conversationId: string, messageId: string) => api.delete(`/messages/${conversationId}/${messageId}/pin`),
  toggleStar: (conversationId: string, messageId: string) => api.post(`/messages/${conversationId}/${messageId}/star`),
  getPinned: (conversationId: string) => api.get<Message[]>(`/messages/${conversationId}/pinned`),
  // DM Notes
  createDMNote: (content: string, expiresInHours?: number) =>
    api.post<DMNote>('/messages/notes', { content, expiresInHours }),
  getMyDMNote: () => api.get<DMNote | null>('/messages/notes/me'),
  deleteDMNote: () => api.delete<{ deleted: boolean }>('/messages/notes/me'),
  getContactDMNotes: () => api.get<DMNote[]>('/messages/notes/contacts'),
};

// ── Notifications ──
export const notificationsApi = {
  get: (filter?: 'all' | 'mentions' | 'verified', cursor?: string) =>
    api.get<PaginatedResponse<Notification>>(`/notifications${qs({ filter, cursor })}`),
  getUnreadCount: () => api.get<{ unread: number }>('/notifications/unread'),
  getUnreadCounts: () => api.get<Record<string, number>>('/notifications/unread-counts'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
};

// ── Search ──
export const searchApi = {
  search: (query: string, type?: string, cursor?: string) =>
    api.get<SearchResults>(`/search${qs({ q: query, type, cursor })}`),
  trending: () => api.get<TrendingHashtag[]>('/search/trending'),
  suggestions: () => api.get<User[]>('/search/suggestions'),
  hashtagPosts: (tag: string, cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/search/hashtag/${encodeURIComponent(tag)}${qs({ cursor })}`),
  searchPosts: (query: string, cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/search/posts${qs({ q: query, cursor })}`),
  searchThreads: (query: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/search/threads${qs({ q: query, cursor })}`),
  searchReels: (query: string, cursor?: string) =>
    api.get<PaginatedResponse<Reel>>(`/search/reels${qs({ q: query, cursor })}`),
  getExploreFeed: (cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/search/explore${qs({ cursor })}`),
  getSearchSuggestions: (query: string, limit?: number) =>
    api.get<SearchSuggestion[]>(`/search/suggestions${qs({ q: query, limit })}`),
};

// ── Upload ──
export const uploadApi = {
  getPresignUrl: (contentType: string, folder: string) =>
    api.post<{ uploadUrl: string; key: string; publicUrl: string; expiresIn: number }>(
      '/upload/presign',
      { contentType, folder },
    ),
};

// ── Circles ──
export const circlesApi = {
  getMyCircles: () => api.get<Circle[]>('/circles'),
  create: (name: string, emoji?: string) => api.post<Circle>('/circles', { name, emoji }),
  update: (id: string, data: { name?: string; emoji?: string }) =>
    api.patch<Circle>(`/circles/${id}`, data),
  delete: (id: string) => api.delete(`/circles/${id}`),
  getMembers: (id: string) => api.get<CircleMember[]>(`/circles/${id}/members`),
  addMembers: (id: string, memberIds: string[]) =>
    api.post(`/circles/${id}/members`, { memberIds }),
  removeMembers: (id: string, memberIds: string[]) =>
    api.delete(`/circles/${id}/members`, { memberIds }),
};

// ── Devices (push notifications) ──
export const devicesApi = {
  register: (pushToken: string, platform: string, deviceId?: string) =>
    api.post('/devices', { pushToken, platform, deviceId }),
  unregister: (pushToken: string) => api.delete(`/devices/${encodeURIComponent(pushToken)}`),
};

// ── Profile Links ──
export const profileLinksApi = {
  getLinks: () => api.get<ProfileLink[]>('/profile-links'),
  create: (data: { title: string; url: string }) => api.post<ProfileLink>('/profile-links', data),
  update: (id: string, data: { title?: string; url?: string }) =>
    api.patch<ProfileLink>(`/profile-links/${id}`, data),
  delete: (id: string) => api.delete(`/profile-links/${id}`),
  reorder: (ids: string[]) => api.put('/profile-links/reorder', { ids }),
};

// ── Blocks ──
export const blocksApi = {
  getBlocked: (cursor?: string) => api.get<PaginatedResponse<BlockedUser>>(`/blocks${qs({ cursor })}`),
  block: (userId: string) => api.post(`/blocks/${userId}`),
  unblock: (userId: string) => api.delete(`/blocks/${userId}`),
};

// ── Mutes ──
export const mutesApi = {
  getMuted: (cursor?: string) => api.get<PaginatedResponse<MutedUser>>(`/mutes${qs({ cursor })}`),
  mute: (userId: string) => api.post(`/mutes/${userId}`),
  unmute: (userId: string) => api.delete(`/mutes/${userId}`),
};

// ── Restricts ──
export const restrictsApi = {
  restrict: (userId: string) => api.post(`/restricts/${userId}`, {}),
  unrestrict: (userId: string) => api.delete(`/restricts/${userId}`),
  getRestricted: (cursor?: string) =>
    api.get<{
      data: Array<{
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
      }>;
      meta: { hasMore: boolean; cursor?: string };
    }>(`/restricts${qs({ cursor })}`),
};

// ── Settings ──
export const settingsApi = {
  get: () => api.get<Settings>('/settings'),
  updatePrivacy: (data: PrivacySettings) => api.patch<Settings>('/settings/privacy', data),
  updateNotifications: (data: NotificationSettings) => api.patch<Settings>('/settings/notifications', data),
  updateAccessibility: (data: AccessibilitySettings) => api.patch<Settings>('/settings/accessibility', data),
  updateWellbeing: (data: WellbeingSettings) => api.patch<Settings>('/settings/wellbeing', data),
  getBlockedKeywords: () => api.get<BlockedKeyword[]>('/settings/blocked-keywords'),
  addBlockedKeyword: (word: string) => api.post<BlockedKeyword>('/settings/blocked-keywords', { word }),
  deleteBlockedKeyword: (id: string) => api.delete(`/settings/blocked-keywords/${id}`),
  getQuietMode: () => api.get<any>('/settings/quiet-mode'),
  updateQuietMode: (data: { isActive?: boolean; autoReply?: string; startTime?: string; endTime?: string; isScheduled?: boolean }) =>
    api.patch<any>('/settings/quiet-mode', data),
  logScreenTime: (seconds: number) =>
    api.post('/settings/screen-time/log', { seconds }),
  getScreenTimeStats: () =>
    api.get<{ daily: Array<{ date: string; totalSeconds: number; sessions: number }>; totalSeconds: number; totalSessions: number; avgDailySeconds: number; limitMinutes: number | null }>('/settings/screen-time/stats'),
  setScreenTimeLimit: (limitMinutes: number | null) =>
    api.patch('/settings/screen-time/limit', { limitMinutes }),
  getAutoPlay: () =>
    api.get<{ autoPlaySetting: string }>('/settings/auto-play'),
  updateAutoPlay: (autoPlaySetting: 'wifi' | 'always' | 'never') =>
    api.patch('/settings/auto-play', { autoPlaySetting }),
};

// ── Admin ──
export const adminApi = {
  getReports: (status?: string, cursor?: string) =>
    api.get<PaginatedResponse<Report>>(`/admin/reports${qs({ status, cursor })}`),
  getReport: (id: string) =>
    api.get<Report>(`/admin/reports/${id}`),
  resolveReport: (id: string, action: string, note?: string) =>
    api.patch(`/admin/reports/${id}`, { action, note }),
  getStats: () =>
    api.get<AdminStats>('/admin/stats'),
  banUser: (id: string, reason: string, duration?: number) =>
    api.post(`/admin/users/${id}/ban`, { reason, duration }),
  unbanUser: (id: string) =>
    api.post(`/admin/users/${id}/unban`),
};

// ── Recommendations ──
export const recommendationsApi = {
  people: () => api.get<SuggestedUser[]>('/recommendations/people'),
  posts: () => api.get<Post[]>('/recommendations/posts'),
  reels: () => api.get<Reel[]>('/recommendations/reels'),
  channels: () => api.get<Channel[]>('/recommendations/channels'),
};

// ── New Batch 18 Modules ──

// Scheduling API
export const schedulingApi = {
  getScheduled: () => api.get<ScheduledItem[]>('/scheduling/scheduled'),
  updateSchedule: (type: string, id: string, scheduledAt: string) =>
    api.patch(`/scheduling/${type}/${id}`, { scheduledAt }),
  cancelSchedule: (type: string, id: string) =>
    api.delete(`/scheduling/${type}/${id}`),
  publishNow: (type: string, id: string) =>
    api.post(`/scheduling/publish-now/${type}/${id}`),
};

// Majlis Lists API
export const majlisListsApi = {
  getLists: () => api.get<MajlisList[]>('/majlis-lists'),
  create: (data: { name: string; description?: string; isPublic?: boolean }) =>
    api.post<MajlisList>('/majlis-lists', data),
  getById: (id: string) => api.get<MajlisList>(`/majlis-lists/${id}`),
  update: (id: string, data: Partial<MajlisList>) =>
    api.patch(`/majlis-lists/${id}`, data),
  delete: (id: string) => api.delete(`/majlis-lists/${id}`),
  getMembers: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/majlis-lists/${id}/members${qs({ cursor })}`),
  addMember: (id: string, userId: string) =>
    api.post(`/majlis-lists/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) =>
    api.delete(`/majlis-lists/${id}/members/${userId}`),
  getTimeline: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/majlis-lists/${id}/timeline${qs({ cursor })}`),
};

// Polls API
export const pollsApi = {
  get: (id: string) => api.get<Poll>(`/polls/${id}`),
  vote: (id: string, optionId: string) =>
    api.post(`/polls/${id}/vote`, { optionId }),
  retractVote: (id: string) => api.delete(`/polls/${id}/vote`),
  getVoters: (id: string, optionId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/polls/${id}/voters${qs({ optionId, cursor })}`),
};

// Subtitles API
export const subtitlesApi = {
  list: (videoId: string) => api.get<SubtitleTrack[]>(`/videos/${videoId}/subtitles`),
  upload: (videoId: string, data: { label: string; language: string; srtUrl: string }) =>
    api.post(`/videos/${videoId}/subtitles`, data),
  delete: (videoId: string, trackId: string) =>
    api.delete(`/videos/${videoId}/subtitles/${trackId}`),
  generate: (videoId: string, language?: string) =>
    api.post<SubtitleTrack>(`/videos/${videoId}/subtitles/generate`, { language }),
  update: (videoId: string, trackId: string, data: { label?: string; srtUrl?: string }) =>
    api.patch<SubtitleTrack>(`/videos/${videoId}/subtitles/${trackId}`, data),
};

// Stories reactions (if endpoint exists)
export const storiesReactionsApi = {
  react: (storyId: string, emoji: string) =>
    api.post(`/stories/${storyId}/react`, { emoji }),
};

// ── Drafts ──
export const draftsApi = {
  getAll: (space?: string) =>
    api.get<Array<{ id: string; space: string; data: Record<string, unknown>; createdAt: string; updatedAt: string }>>(
      `/drafts${space ? `?space=${space}` : ''}`
    ),
  get: (id: string) =>
    api.get<{ id: string; space: string; data: Record<string, unknown> }>(`/drafts/${id}`),
  save: (space: string, data: Record<string, unknown>) =>
    api.post(`/drafts`, { space, data }),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/drafts/${id}`, { data }),
  delete: (id: string) => api.delete(`/drafts/${id}`),
};

// ── Broadcast Channels ──
export const broadcastApi = {
  discover: (cursor?: string) =>
    api.get<PaginatedResponse<BroadcastChannel>>(`/broadcast-channels/discover${cursor ? `?cursor=${cursor}` : ''}`),
  getMyChannels: () =>
    api.get<BroadcastChannel[]>('/broadcast-channels/mine'),
  getBySlug: (slug: string) =>
    api.get<BroadcastChannel>(`/broadcast-channels/slug/${slug}`),
  getById: (id: string) =>
    api.get<BroadcastChannel>(`/broadcast-channels/${id}`),
  create: (data: { name: string; slug: string; description?: string; avatarUrl?: string }) =>
    api.post<BroadcastChannel>('/broadcast-channels', data),
  subscribe: (id: string) =>
    api.post(`/broadcast-channels/${id}/subscribe`),
  unsubscribe: (id: string) =>
    api.delete(`/broadcast-channels/${id}/subscribe`),
  mute: (id: string) =>
    api.post(`/broadcast-channels/${id}/mute`),
  unmute: (id: string) =>
    api.delete(`/broadcast-channels/${id}/mute`),
  getMessages: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<BroadcastMessage>>(`/broadcast-channels/${id}/messages${cursor ? `?cursor=${cursor}` : ''}`),
  sendMessage: (id: string, data: { content: string; mediaUrls?: string[]; mediaTypes?: string[] }) =>
    api.post<BroadcastMessage>(`/broadcast-channels/${id}/messages`, data),
  pinMessage: (channelId: string, messageId: string) =>
    api.post(`/broadcast-channels/${channelId}/messages/${messageId}/pin`),
  unpinMessage: (channelId: string, messageId: string) =>
    api.delete(`/broadcast-channels/${channelId}/messages/${messageId}/pin`),
  deleteMessage: (channelId: string, messageId: string) =>
    api.delete(`/broadcast-channels/${channelId}/messages/${messageId}`),
  getPinnedMessages: (id: string) =>
    api.get<BroadcastMessage[]>(`/broadcast-channels/${id}/messages/pinned`),
  promoteToAdmin: (channelId: string, userId: string) =>
    api.post(`/broadcast-channels/${channelId}/admins/${userId}`),
  demoteFromAdmin: (channelId: string, userId: string) =>
    api.delete(`/broadcast-channels/${channelId}/admins/${userId}`),
  removeSubscriber: (channelId: string, userId: string) =>
    api.delete(`/broadcast-channels/${channelId}/subscribers/${userId}`),
};

// ── Live Sessions ──
export const liveApi = {
  create: (data: { title: string; description?: string; thumbnailUrl?: string; scheduledAt?: string }) =>
    api.post<LiveSession>('/live', data),
  getById: (id: string) =>
    api.get<LiveSession>(`/live/${id}`),
  getActive: () =>
    api.get<LiveSession[]>('/live/active'),
  getScheduled: () =>
    api.get<LiveSession[]>('/live/scheduled'),
  startLive: (id: string) =>
    api.post(`/live/${id}/start`),
  endLive: (id: string) =>
    api.post(`/live/${id}/end`),
  cancelLive: (id: string) =>
    api.post(`/live/${id}/cancel`),
  join: (id: string) =>
    api.post<LiveParticipant>(`/live/${id}/join`),
  leave: (id: string) =>
    api.post(`/live/${id}/leave`),
  raiseHand: (id: string) =>
    api.post(`/live/${id}/raise-hand`),
  promoteToSpeaker: (id: string, userId: string) =>
    api.post(`/live/${id}/promote/${userId}`),
  demoteToViewer: (id: string, userId: string) =>
    api.post(`/live/${id}/demote/${userId}`),
  getParticipants: (id: string) =>
    api.get<LiveParticipant[]>(`/live/${id}/participants`),
  getHostSessions: (userId: string) =>
    api.get<LiveSession[]>(`/live/host/${userId}`),
};

// ── Calls ──
export const callsApi = {
  initiate: (data: { receiverId: string; callType: 'voice' | 'video' }) =>
    api.post<CallSession>('/calls', data),
  answer: (id: string) =>
    api.post(`/calls/${id}/answer`),
  decline: (id: string) =>
    api.post(`/calls/${id}/decline`),
  end: (id: string) =>
    api.post(`/calls/${id}/end`),
  getHistory: (cursor?: string) =>
    api.get<PaginatedResponse<CallSession>>(`/calls/history${cursor ? `?cursor=${cursor}` : ''}`),
  getActiveCall: () =>
    api.get<CallSession | null>('/calls/active'),
  getIceServers: () =>
    api.get<{ iceServers: { urls: string; username?: string; credential?: string }[] }>('/calls/ice-servers').then(r => r.data),
};

// ── Stickers ──
export const stickersApi = {
  browsePacks: (cursor?: string) =>
    api.get<PaginatedResponse<StickerPack>>(`/stickers/browse${cursor ? `?cursor=${cursor}` : ''}`),
  searchPacks: (query: string) =>
    api.get<StickerPack[]>(`/stickers/search?q=${encodeURIComponent(query)}`),
  getPack: (id: string) =>
    api.get<StickerPack>(`/stickers/packs/${id}`),
  getFeaturedPacks: () =>
    api.get<StickerPack[]>('/stickers/featured'),
  getMyPacks: () =>
    api.get<StickerPack[]>('/stickers/mine'),
  getRecentStickers: () =>
    api.get<StickerItem[]>('/stickers/recent'),
  addToCollection: (packId: string) =>
    api.post(`/stickers/packs/${packId}/collect`),
  removeFromCollection: (packId: string) =>
    api.delete(`/stickers/packs/${packId}/collect`),
  createPack: (data: { name: string; slug: string; description?: string; coverUrl?: string; stickers: { imageUrl: string; emoji?: string }[] }) =>
    api.post<StickerPack>('/stickers/packs', data),
  deletePack: (id: string) =>
    api.delete(`/stickers/packs/${id}`),
};

// ── Post Collabs ──
export const collabsApi = {
  invite: (postId: string, userId: string) =>
    api.post<PostCollab>(`/collabs/invite`, { postId, userId }),
  accept: (id: string) =>
    api.post(`/collabs/${id}/accept`),
  decline: (id: string) =>
    api.post(`/collabs/${id}/decline`),
  remove: (id: string) =>
    api.delete(`/collabs/${id}`),
  getMyPending: () =>
    api.get<PostCollab[]>('/collabs/pending'),
  getPostCollabs: (postId: string) =>
    api.get<PostCollab[]>(`/collabs/post/${postId}`),
};

// ── Channel Posts (Community) ──
export const channelPostsApi = {
  list: (channelId: string, cursor?: string) =>
    api.get<PaginatedResponse<ChannelPost>>(`/channels/${channelId}/posts${cursor ? `?cursor=${cursor}` : ''}`),
  create: (channelId: string, data: { content: string; postType?: string; mediaUrls?: string[]; mediaTypes?: string[] }) =>
    api.post<ChannelPost>(`/channels/${channelId}/posts`, data),
  like: (channelId: string, postId: string) =>
    api.post(`/channels/${channelId}/posts/${postId}/like`),
  unlike: (channelId: string, postId: string) =>
    api.delete(`/channels/${channelId}/posts/${postId}/like`),
  delete: (channelId: string, postId: string) =>
    api.delete(`/channels/${channelId}/posts/${postId}`),
  getComments: (channelId: string, postId: string, cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/channels/${channelId}/posts/${postId}/comments${cursor ? `?cursor=${cursor}` : ''}`),
  addComment: (channelId: string, postId: string, content: string) =>
    api.post(`/channels/${channelId}/posts/${postId}/comments`, { content }),
};

// ── Audio Tracks ──
export const audioTracksApi = {
  browse: (cursor?: string) =>
    api.get<PaginatedResponse<AudioTrack>>(`/audio-tracks${cursor ? `?cursor=${cursor}` : ''}`),
  search: (query: string) =>
    api.get<AudioTrack[]>(`/audio-tracks/search?q=${encodeURIComponent(query)}`),
  getById: (id: string) =>
    api.get<AudioTrack>(`/audio-tracks/${id}`),
  getTrending: () =>
    api.get<AudioTrack[]>('/audio-tracks/trending'),
  getByGenre: (genre: string) =>
    api.get<AudioTrack[]>(`/audio-tracks/genre/${genre}`),
  getReelsUsing: (trackId: string, cursor?: string) =>
    api.get<PaginatedResponse<Reel>>(`/audio-tracks/${trackId}/reels${cursor ? `?cursor=${cursor}` : ''}`),
  upload: (data: { title: string; artist: string; audioUrl: string; coverUrl?: string; duration: number; genre?: string }) =>
    api.post<AudioTrack>('/audio-tracks', data),
  delete: (id: string) =>
    api.delete(`/audio-tracks/${id}`),
};

// ── Feed Intelligence ──
export const feedApi = {
  dismiss: (data: { postId?: string; reelId?: string; threadId?: string; reason: string }) =>
    api.post('/feed/dismiss', data),
  getPersonalized: (cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/feed/personalized${cursor ? `?cursor=${cursor}` : ''}`),
  getExplore: (cursor?: string) =>
    api.get<PaginatedResponse<any>>(`/feed/explore${cursor ? `?cursor=${cursor}` : ''}`),
  reportNotInterested: (contentId: string, contentType: string) =>
    api.post('/feed/not-interested', { contentId, contentType }),
};

// ── Moderation (user-facing appeal endpoints) ──
export const moderationApi = {
  getMyActions: (cursor?: string) =>
    api.get<PaginatedResponse<ModerationLogEntry>>(`/moderation/my-actions${qs({ cursor })}`),
  getMyAppeals: (cursor?: string) =>
    api.get<PaginatedResponse<ModerationLogEntry>>(`/moderation/my-appeals${qs({ cursor })}`),
  submitAppeal: (data: { moderationLogId: string; reason: string; details: string }) =>
    api.post<ModerationLogEntry>('/moderation/appeal', data),
};

// ── Appeals (convenience alias used by appeal-moderation screen) ──
export const appealsApi = {
  getHistory: (reportId?: string) =>
    api.get<ModerationLogEntry | null>(`/moderation/my-appeals${qs({ reportId })}`).then(
      (res) => (Array.isArray(res) ? res[0] ?? null : res),
    ),
  submit: (data: { reportId: string; reason: string; details: string }) =>
    moderationApi.submitAppeal({ moderationLogId: data.reportId, reason: data.reason, details: data.details }),
};

// ── Reports ──
export const reportsApi = {
  create: (data: { reason: string; description?: string; reportedPostId?: string; reportedUserId?: string; reportedCommentId?: string; reportedMessageId?: string }) =>
    api.post<Report>('/reports', data),
  getMine: (cursor?: string) =>
    api.get<PaginatedResponse<Report>>(`/reports/mine${qs({ cursor })}`),
  getPending: (cursor?: string) =>
    api.get<PaginatedResponse<Report>>(`/reports/pending${qs({ cursor })}`),
  getStats: () =>
    api.get<{ pending: number; reviewing: number; resolved: number; dismissed: number; total: number }>('/reports/stats'),
  getById: (id: string) =>
    api.get<Report>(`/reports/${id}`),
  resolve: (id: string, actionTaken: string) =>
    api.patch<Report>(`/reports/${id}/resolve`, { actionTaken }),
  dismiss: (id: string) =>
    api.patch<Report>(`/reports/${id}/dismiss`),
};

// ── Hashtags ──
export const hashtagsApi = {
  getTrending: () =>
    api.get<HashtagInfo[]>('/hashtags/trending'),
  search: (query: string) =>
    api.get<HashtagInfo[]>(`/hashtags/search${qs({ q: query })}`),
  getByName: (name: string) =>
    api.get<HashtagInfo>(`/hashtags/${name}`),
  getPosts: (name: string, cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/hashtags/${name}/posts${qs({ cursor })}`),
  getReels: (name: string, cursor?: string) =>
    api.get<PaginatedResponse<Reel>>(`/hashtags/${name}/reels${qs({ cursor })}`),
  getThreads: (name: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/hashtags/${name}/threads${qs({ cursor })}`),
};

// ── Bookmarks ──
export const bookmarksApi = {
  savePost: (postId: string, collectionName?: string) =>
    api.post(`/bookmarks/posts/${postId}`, { collectionName }),
  unsavePost: (postId: string) =>
    api.delete(`/bookmarks/posts/${postId}`),
  saveThread: (threadId: string, collectionName?: string) =>
    api.post(`/bookmarks/threads/${threadId}`, { collectionName }),
  unsaveThread: (threadId: string) =>
    api.delete(`/bookmarks/threads/${threadId}`),
  saveVideo: (videoId: string, collectionName?: string) =>
    api.post(`/bookmarks/videos/${videoId}`, { collectionName }),
  unsaveVideo: (videoId: string) =>
    api.delete(`/bookmarks/videos/${videoId}`),
  getSavedPosts: (collectionName?: string, cursor?: string) =>
    api.get<PaginatedResponse<Post>>(`/bookmarks/posts${qs({ collectionName, cursor })}`),
  getSavedThreads: (collectionName?: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/bookmarks/threads${qs({ collectionName, cursor })}`),
  getSavedVideos: (collectionName?: string, cursor?: string) =>
    api.get<PaginatedResponse<Video>>(`/bookmarks/videos${qs({ collectionName, cursor })}`),
  getCollections: () =>
    api.get<BookmarkCollection[]>('/bookmarks/collections'),
  moveToCollection: (bookmarkId: string, collectionName: string) =>
    api.patch(`/bookmarks/${bookmarkId}/collection`, { collectionName }),
  isPostSaved: (postId: string) =>
    api.get<{ saved: boolean }>(`/bookmarks/posts/${postId}/saved`),
  isThreadSaved: (threadId: string) =>
    api.get<{ saved: boolean }>(`/bookmarks/threads/${threadId}/saved`),
  isVideoSaved: (videoId: string) =>
    api.get<{ saved: boolean }>(`/bookmarks/videos/${videoId}/saved`),
};

// ── Watch History ──
export const watchHistoryApi = {
  recordWatch: (videoId: string, progress: number, duration: number) =>
    api.post(`/watch-history/${videoId}`, { progress, duration }),
  getHistory: (cursor?: string) =>
    api.get<PaginatedResponse<WatchHistoryItem>>(`/watch-history${qs({ cursor })}`),
  removeFromHistory: (videoId: string) =>
    api.delete(`/watch-history/${videoId}`),
  clearHistory: () =>
    api.delete('/watch-history'),
};

// ── Account ──
export const accountApi = {
  requestDataExport: () => api.post('/account/export'),
};

// ── Downloads (Offline) ──
export const downloadsApi = {
  request: (dto: { contentId: string; contentType: string; quality?: string }) =>
    api.post('/downloads', dto),
  getAll: (params?: { status?: string; cursor?: string }) =>
    api.get(`/downloads${qs(params || {})}`),
  getUrl: (id: string) =>
    api.get<{ url: string }>(`/downloads/${id}/url`),
  updateProgress: (id: string, progress: number, fileSize?: number) =>
    api.patch(`/downloads/${id}/progress`, { progress, fileSize }),
  delete: (id: string) =>
    api.delete(`/downloads/${id}`),
  getStorage: () =>
    api.get<{ usedBytes: number; count: number }>('/downloads/storage'),
};

// ── Parental Controls ──
export const parentalApi = {
  linkChild: (dto: { childUserId: string; pin: string }) =>
    api.post('/parental-controls/link', dto),
  unlinkChild: (childId: string, pin: string) =>
    api.delete(`/parental-controls/link/${childId}`, { pin }),
  getChildren: () =>
    api.get('/parental-controls/children'),
  getParent: () =>
    api.get('/parental-controls/parent'),
  updateControls: (childId: string, dto: Record<string, unknown>) =>
    api.patch(`/parental-controls/${childId}`, dto),
  verifyPin: (childId: string, pin: string) =>
    api.post(`/parental-controls/${childId}/pin`, { pin }),
  changePin: (childId: string, currentPin: string, newPin: string) =>
    api.patch(`/parental-controls/${childId}/pin`, { currentPin, newPin }),
  getRestrictions: (childId: string) =>
    api.get(`/parental-controls/${childId}/restrictions`),
  getDigest: (childId: string) =>
    api.get(`/parental-controls/${childId}/digest`),
};

// ── Clips ──
export const clipsApi = {
  create: (videoId: string, dto: { startTime: number; endTime: number; title?: string }) =>
    api.post(`/clips/video/${videoId}`, dto),
  getByVideo: (videoId: string, cursor?: string) =>
    api.get(`/clips/video/${videoId}${qs({ cursor })}`),
  getMine: (cursor?: string) =>
    api.get(`/clips/me${qs({ cursor })}`),
  delete: (id: string) =>
    api.delete(`/clips/${id}`),
  getShareLink: (id: string) =>
    api.get<{ url: string }>(`/clips/${id}/share`),
};

// ── AI ──
export const aiApi = {
  suggestCaptions: (content?: string, mediaDescription?: string) =>
    api.post('/ai/suggest-captions', { content, mediaDescription }),
  suggestHashtags: (content: string) =>
    api.post('/ai/suggest-hashtags', { content }),
  suggestPostingTime: () =>
    api.get<{ bestTime: string; reason: string }>('/ai/suggest-posting-time'),
  translate: (text: string, targetLanguage: string, contentId?: string, contentType?: string) =>
    api.post('/ai/translate', { text, targetLanguage, contentId, contentType }),
  moderate: (text: string, contentType: string) =>
    api.post('/ai/moderate', { text, contentType }),
  smartReplies: (conversationContext: string, lastMessages: string[]) =>
    api.post('/ai/smart-replies', { conversationContext, lastMessages }),
  summarize: (text: string, maxLength?: number) =>
    api.post('/ai/summarize', { text, maxLength }),
  routeSpace: (content: string, mediaTypes: string[]) =>
    api.post('/ai/route-space', { content, mediaTypes }),
  generateCaptions: (videoId: string, audioUrl: string, language?: string) =>
    api.post(`/ai/videos/${videoId}/captions`, { audioUrl, language }),
  getCaptions: (videoId: string, language?: string) =>
    api.get(`/ai/videos/${videoId}/captions${qs({ language })}`),
  generateAvatar: (sourceUrl: string, style?: string) =>
    api.post('/ai/avatar', { sourceUrl, style }),
  getAvatars: () =>
    api.get('/ai/avatars'),
};

// ── Gamification ──
export const gamificationApi = {
  // Streaks
  getStreaks: () => api.get('/streaks'),
  updateStreak: (type: string) => api.post(`/streaks/${type}`),
  // XP & Levels
  getXP: () => api.get('/xp'),
  getXPHistory: (cursor?: string) => api.get(`/xp/history${qs({ cursor })}`),
  // Achievements
  getAchievements: () => api.get('/achievements'),
  // Leaderboards
  getLeaderboard: (type: string, limit?: number) => api.get(`/leaderboard/${type}${qs({ limit })}`),
  // Challenges
  getChallenges: (params?: { cursor?: string; category?: string }) => api.get(`/challenges${qs(params || {})}`),
  createChallenge: (dto: { title: string; description: string; challengeType: string; category: string; targetCount: number; startDate: string; endDate: string }) =>
    api.post('/challenges', dto),
  joinChallenge: (id: string) => api.post(`/challenges/${id}/join`),
  updateProgress: (id: string, progress: number) => api.patch(`/challenges/${id}/progress`, { progress }),
  getMyChallenges: () => api.get('/challenges/me'),
  // Series
  createSeries: (dto: { title: string; description?: string; category: string }) => api.post('/series', dto),
  discoverSeries: (params?: { cursor?: string; category?: string }) => api.get(`/series/discover${qs(params || {})}`),
  getSeries: (id: string) => api.get(`/series/${id}`),
  addEpisode: (seriesId: string, dto: { title: string; postId?: string; reelId?: string; videoId?: string }) =>
    api.post(`/series/${seriesId}/episodes`, dto),
  followSeries: (id: string) => api.post(`/series/${id}/follow`),
  unfollowSeries: (id: string) => api.delete(`/series/${id}/follow`),
  // Profile Customization
  getProfileCustomization: () => api.get('/profile-customization'),
  updateProfileCustomization: (dto: Record<string, unknown>) => api.patch('/profile-customization', dto),
};

// ── Commerce ──
export const commerceApi = {
  // Products
  createProduct: (dto: Record<string, unknown>) => api.post('/products', dto),
  getProducts: (params?: { cursor?: string; category?: string; search?: string }) => api.get(`/products${qs(params || {})}`),
  getProduct: (id: string) => api.get(`/products/${id}`),
  reviewProduct: (id: string, rating: number, comment?: string) => api.post(`/products/${id}/review`, { rating, comment }),
  // Orders
  createOrder: (dto: { productId: string; quantity?: number; installments?: number; shippingAddress?: string }) => api.post('/orders', dto),
  getMyOrders: (cursor?: string) => api.get(`/orders/me${qs({ cursor })}`),
  updateOrderStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),
  // Businesses
  createBusiness: (dto: Record<string, unknown>) => api.post('/businesses', dto),
  getBusinesses: (params?: { cursor?: string; category?: string; lat?: number; lng?: number }) => api.get(`/businesses${qs(params || {})}`),
  reviewBusiness: (id: string, rating: number, comment?: string) => api.post(`/businesses/${id}/review`, { rating, comment }),
  // Zakat
  createZakatFund: (dto: { title: string; description: string; goalAmount: number; category: string }) => api.post('/zakat/funds', dto),
  getZakatFunds: (params?: { cursor?: string; category?: string }) => api.get(`/zakat/funds${qs(params || {})}`),
  donateZakat: (fundId: string, amount: number, isAnonymous?: boolean) => api.post(`/zakat/funds/${fundId}/donate`, { amount, isAnonymous }),
  // Treasury
  createTreasury: (dto: { circleId: string; title: string; goalAmount: number }) => api.post('/treasury', dto),
  contributeTreasury: (id: string, amount: number) => api.post(`/treasury/${id}/contribute`, { amount }),
  // Premium
  getPremiumStatus: () => api.get('/premium/status'),
  subscribePremium: (plan: string) => api.post('/premium/subscribe', { plan }),
  cancelPremium: () => api.delete('/premium/cancel'),
};
