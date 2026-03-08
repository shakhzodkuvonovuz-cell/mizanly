// ── User ──
export interface User {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  website?: string;
  isVerified: boolean;
  isPrivate: boolean;
  isDeactivated?: boolean;
  createdAt: string;
  _count?: { followers: number; following: number; posts: number; threads: number };
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  channel?: Channel;
}

// ── Saf: Posts ──
export type PostType = 'IMAGE' | 'CAROUSEL' | 'VIDEO' | 'TEXT' | 'LINK';
export type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE';
export type ReactionType = 'LIKE' | 'LOVE' | 'SUPPORT' | 'INSIGHTFUL';

export interface Post {
  id: string;
  postType: PostType;
  content?: string;
  visibility: Visibility;
  mediaUrls: string[];
  mediaTypes: string[];
  thumbnailUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  hashtags: string[];
  mentions: string[];
  locationName?: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  viewsCount: number;
  hideLikesCount: boolean;
  commentsDisabled: boolean;
  isSensitive: boolean;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
  user: User;
  circle?: Circle;
  sharedPost?: { id: string; content?: string; user: { username: string } };
  userReaction?: ReactionType | null;
  isSaved?: boolean;
}

// ── Saf: Stories ──
export interface Story {
  id: string;
  mediaUrl: string;
  mediaType: string;
  thumbnailUrl?: string;
  duration?: number;
  textOverlay?: string;
  textColor?: string;
  bgColor?: string;
  viewsCount: number;
  repliesCount: number;
  isHighlight: boolean;
  highlightAlbumId?: string;
  stickerData?: object;
  closeFriendsOnly: boolean;
  isArchived: boolean;
  expiresAt: string;
  createdAt: string;
  user: User;
}

export interface StoryGroup {
  user: User;
  stories: Story[];
  hasUnread: boolean;
}

export interface StoryHighlightAlbum {
  id: string;
  title: string;
  coverUrl?: string;
  position: number;
  stories?: Pick<Story, 'id' | 'mediaUrl' | 'mediaType' | 'thumbnailUrl'>[];
}

// ── Majlis: Threads ──
export interface PollOption {
  id: string;
  text: string;
  votesCount: number;
  position: number;
  _count?: { votes: number };
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  endsAt?: string;
  totalVotes: number;
  allowMultiple: boolean;
  userVoteId?: string;
}

export interface Thread {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaTypes: string[];
  visibility: Visibility;
  isChainHead: boolean;
  chainId?: string;
  chainPosition: number;
  isQuotePost: boolean;
  quoteText?: string;
  repostOfId?: string;
  hashtags: string[];
  mentions: string[];
  likesCount: number;
  repliesCount: number;
  repostsCount: number;
  quotesCount: number;
  viewsCount: number;
  bookmarksCount: number;
  hideLikesCount: boolean;
  isPinned: boolean;
  isSensitive: boolean;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
  user: User;
  circle?: Circle;
  poll?: Poll;
  repostOf?: { id: string; content: string; user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> };
  userReaction?: ReactionType | null;
  isBookmarked?: boolean;
  isReposted?: boolean;
}

export interface ThreadReply {
  id: string;
  content: string;
  mediaUrls: string[];
  likesCount: number;
  isLiked?: boolean;
  createdAt: string;
  parentId?: string;
  user: User;
  _count?: { replies: number };
}

// ── Bakra: Reels ──
export interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  caption?: string;
  mentions: string[];
  hashtags: string[];
  status: 'PROCESSING' | 'READY' | 'FAILED';
  isRemoved: boolean;
  audioTrackId?: string;
  audioTitle?: string;
  audioArtist?: string;
  isDuet: boolean;
  isStitch: boolean;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  createdAt: string;
  user: User;
  isLiked?: boolean;
  isBookmarked?: boolean;
}

// ── Minbar: Long Video ──
export type VideoStatus = 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'UNLISTED' | 'PRIVATE';
export type VideoCategory = 'EDUCATION' | 'QURAN' | 'LECTURE' | 'VLOG' | 'NEWS' | 'DOCUMENTARY' | 'ENTERTAINMENT' | 'SPORTS' | 'COOKING' | 'TECH' | 'OTHER';

export interface Channel {
  id: string;
  userId: string;
  handle: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  subscribersCount: number;
  videosCount: number;
  totalViews: number;
  isVerified: boolean;
  createdAt: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isVerified'>;
  isSubscribed?: boolean;
}

export interface Video {
  id: string;
  userId: string;
  channelId: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  category: VideoCategory;
  tags: string[];
  viewsCount: number;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  savesCount: number;
  status: VideoStatus;
  publishedAt?: string;
  createdAt: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isVerified'>;
  channel: Pick<Channel, 'id' | 'handle' | 'name' | 'avatarUrl' | 'isVerified'>;
  isLiked?: boolean;
  isDisliked?: boolean;
  isBookmarked?: boolean;
  isSubscribed?: boolean;
}

export interface VideoComment {
  id: string;
  videoId: string;
  userId: string;
  parentId?: string;
  content: string;
  likesCount: number;
  timestamp?: number;
  isPinned: boolean;
  createdAt: string;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isVerified'>;
  _count?: { replies: number };
}

// ── Minbar: Playlists & Watch History ──
export interface Playlist {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  videosCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistItem {
  id: string;
  position: number;
  createdAt: string;
  video: {
    id: string;
    title: string;
    thumbnailUrl?: string;
    duration: number;
    viewsCount: number;
    createdAt: string;
    channel: { id: string; handle: string; name: string; avatarUrl?: string };
  };
}

export interface WatchHistoryItem {
  id: string;
  title: string;
  thumbnailUrl?: string;
  duration: number;
  viewsCount: number;
  createdAt: string;
  channel: { id: string; handle: string; name: string; avatarUrl?: string };
  progress: number;
  completed: boolean;
  watchedAt: string;
}

// ── Risalah: Messages ──
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'FILE' | 'GIF' | 'STICKER' | 'LOCATION';

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
}

export interface Message {
  id: string;
  content?: string;
  messageType: MessageType;
  mediaUrl?: string;
  mediaType?: string;
  voiceDuration?: number;
  fileName?: string;
  fileSize?: number;
  replyToId?: string;
  isForwarded: boolean;
  isDeleted: boolean;
  editedAt?: string;
  createdAt: string;
  sender: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  replyTo?: { id: string; content?: string; senderId: string; sender: { username: string } };
  reactions?: MessageReaction[];
}

export interface ConversationMember {
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isVerified'>;
  lastReadAt: string;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
  joinedAt: string;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  createdById?: string;
  groupName?: string;
  groupAvatarUrl?: string;
  lastMessageText?: string;
  lastMessageAt?: string;
  createdAt: string;
  members: ConversationMember[];
  otherUser?: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  // From membership row
  isMuted?: boolean;
  isArchived?: boolean;
  unreadCount?: number;
  lastReadAt?: string;
}

// ── Circles ──
export interface Circle {
  id: string;
  name: string;
  slug: string;
  emoji?: string;
  description?: string;
  avatarUrl?: string;
  _count?: { members: number };
}

// ── Comments ──
export interface Comment {
  id: string;
  content: string;
  likesCount: number;
  isPinned: boolean;
  createdAt: string;
  user: User;
  _count?: { replies: number };
}

// ── Notifications ──
export type NotificationType =
  | 'LIKE' | 'COMMENT' | 'FOLLOW' | 'FOLLOW_REQUEST' | 'FOLLOW_REQUEST_ACCEPTED'
  | 'MENTION' | 'REPLY' | 'CIRCLE_INVITE' | 'CIRCLE_JOIN' | 'MESSAGE'
  | 'THREAD_REPLY' | 'REPOST' | 'QUOTE_POST' | 'CHANNEL_POST' | 'LIVE_STARTED';

export interface Notification {
  id: string;
  type: NotificationType;
  postId?: string;
  threadId?: string;
  commentId?: string;
  reelId?: string;
  videoId?: string;
  followRequestId?: string;
  title?: string;
  body?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  actor?: User;
}

// ── Search ──
export interface SearchResults {
  people?: User[];
  threads?: Thread[];
  posts?: Post[];
  hashtags?: { id: string; name: string; postsCount: number }[];
  videos?: Video[];
  channels?: Channel[];
}

// ── Circles ──
export interface CircleMember {
  user: User;
  role: string;
  joinedAt: string;
}

// ── Profile links ──
export interface ProfileLink {
  id: string;
  title: string;
  url: string;
  position: number;
}

// ── Follow requests ──
export interface FollowRequest {
  id: string;
  createdAt: string;
  follower: User;
}

// ── Trending ──
export interface TrendingHashtag {
  id: string;
  name: string;
  postsCount: number;
  threadsCount: number;
}

// ── Blocked keywords ──
export interface BlockedKeyword {
  id: string;
  word: string;
  createdAt: string;
}

// ── Settings ──
export interface Settings {
  isPrivate: boolean;
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyFollows: boolean;
  notifyMentions: boolean;
  notifyMessages: boolean;
  sensitiveContentFilter: boolean;
  reducedMotion: boolean;
}

// ── Admin & Recommendations ──
export interface Report {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: { id: string; username: string; displayName?: string; avatarUrl?: string };
  reportedUser?: { id: string; username: string; displayName?: string; avatarUrl?: string };
  postId?: string;
  threadId?: string;
  reelId?: string;
  videoId?: string;
}

export interface AdminStats {
  users: number;
  posts: number;
  threads: number;
  reels: number;
  videos: number;
  pendingReports: number;
}

export interface SuggestedUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified: boolean;
  bio?: string;
  mutualFollowers?: number;
}

export interface CreatorStat {
  id: string;
  userId: string;
  date: string;
  space: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
}

// ── Pagination ──
export interface PaginatedResponse<T> {
  data: T[];
  meta: { cursor: string | null; hasMore: boolean };
}
