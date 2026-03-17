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
  isArchived?: boolean;
  collaborators?: User[];
  createdAt: string;
  updatedAt: string;
  user: User;
  circle?: Circle;
  sharedPost?: { id: string; content?: string; user: { username: string } };
  userReaction?: ReactionType | null;
  isSaved?: boolean;
}

export interface BlockedUser {
  id: string;
  blockedId: string;
  blocked: User;
}

export interface MutedUser {
  id: string;
  mutedId: string;
  muted: User;
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
  stickerData?: Record<string, unknown>[] | string;
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
  percentage?: number;
  _count?: { votes: number };
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  endsAt?: string;
  expiresAt?: string; // alias for endsAt
  totalVotes: number;
  allowMultiple: boolean;
  userVoteId?: string;
  userVotedOptionId?: string; // alias for userVoteId
}

export interface Thread {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaTypes: string[];
  visibility: Visibility;
  replyPermission?: 'everyone' | 'following' | 'mentioned' | 'none';
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
  streamId?: string;
  hlsUrl?: string;
  dashUrl?: string;
  qualities?: string[];
  isLooping?: boolean;
  normalizeAudio?: boolean;
  thumbnailUrl?: string;
  duration: number;
  caption?: string;
  mentions: string[];
  hashtags: string[];
  status: 'PROCESSING' | 'READY' | 'FAILED';
  isRemoved: boolean;
  isArchived?: boolean;
  duetOfId?: string;
  stitchOfId?: string;
  audioTrackId?: string;
  audioTitle?: string;
  audioArtist?: string;
  audioCoverUrl?: string;
  audioTrack?: AudioTrack;
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

export interface ChannelTrailerVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  hlsUrl: string | null;
  videoUrl: string;
  duration: number;
}

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
  trailerVideoId?: string | null;
  trailerVideo?: ChannelTrailerVideo | null;
  user: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isVerified'>;
  isSubscribed?: boolean;
}

export interface VideoChapter {
  title: string;
  startTime: number; // seconds
}

export interface Video {
  id: string;
  userId: string;
  channelId: string;
  title: string;
  description?: string;
  videoUrl: string;
  streamId?: string;
  hlsUrl?: string;
  dashUrl?: string;
  qualities?: string[];
  isLooping?: boolean;
  normalizeAudio?: boolean;
  thumbnailUrl?: string;
  duration: number;
  category: VideoCategory;
  tags: string[];
  chapters?: VideoChapter[];
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
export interface PlaylistCollaborator {
  playlistId: string;
  userId: string;
  role: 'editor' | 'viewer';
  addedAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null; isVerified: boolean };
}

export interface Playlist {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  isCollaborative?: boolean;
  collaborators?: PlaylistCollaborator[];
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
  videoId: string;
  userId: string;
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
  isScheduled?: boolean;
  scheduledAt?: string;
  starredBy?: string[];
  editedAt?: string;
  createdAt: string;
  sender: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
  replyTo?: { id: string; content?: string; senderId: string; sender: { username: string } };
  reactions?: MessageReaction[];
  isPinned?: boolean;
  expiresAt?: string;
}

export interface ConversationMember {
  userId?: string;
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
  disappearingDuration?: number;
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
  dailyTimeLimit?: number;
}

// ── Admin & Recommendations ──
export type ReportStatus = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
export type ReportReason = 'HATE_SPEECH' | 'HARASSMENT' | 'VIOLENCE' | 'SPAM' | 'MISINFORMATION' | 'NUDITY' | 'SELF_HARM' | 'TERRORISM' | 'DOXXING' | 'COPYRIGHT' | 'IMPERSONATION' | 'OTHER';
export type ModerationAction = 'WARNING' | 'CONTENT_REMOVED' | 'TEMP_MUTE' | 'TEMP_BAN' | 'PERMANENT_BAN' | 'NONE';

export interface Report {
  id: string;
  reporterId: string;
  reporter: { id: string; username: string; displayName?: string; avatarUrl?: string };
  reportedUserId?: string;
  reportedUser?: { id: string; username: string; displayName?: string; avatarUrl?: string };
  reportedPostId?: string;
  reportedCommentId?: string;
  reportedMessageId?: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  reviewedById?: string;
  reviewedAt?: string;
  actionTaken: ModerationAction;
  moderatorNotes?: string;
  explanationToReporter?: string;
  explanationToReported?: string;
  createdAt: string;
}

export interface ModerationLogEntry {
  id: string;
  moderatorId: string;
  moderator?: { id: string; displayName?: string };
  targetUserId?: string;
  targetPostId?: string;
  targetPost?: { id: string; content?: string; mediaUrls?: string[] };
  targetCommentId?: string;
  targetComment?: { id: string; content?: string };
  targetMessageId?: string;
  action: ModerationAction;
  reason: string;
  explanation: string;
  reportId?: string;
  isAppealed: boolean;
  appealText?: string;
  appealResolved?: boolean;
  appealResult?: string;
  createdAt: string;
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
  space: 'SAF' | 'BAKRA' | 'MAJLIS' | 'MINBAR';
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
}

// ── New Batch 18 Types ──
export interface ScheduledItem {
  id: string;
  type: 'post' | 'thread' | 'reel' | 'video';
  title?: string;
  content?: string;
  caption?: string;
  scheduledAt: string;
  createdAt: string;
}

export interface MajlisList {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  membersCount: number;
  userId: string;
  createdAt: string;
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  srtUrl: string;
  videoId: string;
}

// ── Pagination ──
export interface PaginatedResponse<T> {
  data: T[];
  meta: { cursor: string | null; hasMore: boolean };
}

// ── Broadcast Channels ──
export interface BroadcastChannel {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  coverUrl?: string;
  subscribersCount: number;
  postsCount: number;
  userId: string;
  user?: User;
  role?: 'owner' | 'admin' | 'subscriber';
  isMuted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastMessage {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaTypes: string[];
  isPinned: boolean;
  viewsCount: number;
  channelId: string;
  userId: string;
  user?: User;
  createdAt: string;
}

// ── Live Sessions ──
export interface LiveSession {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  viewersCount: number;
  peakViewers: number;
  recordingUrl?: string;
  userId: string;
  user?: User;
  createdAt: string;
}

export interface LiveParticipant {
  id: string;
  userId: string;
  user?: User;
  role: 'host' | 'speaker' | 'viewer';
  joinedAt: string;
  handRaised: boolean;
}

// ── Calls ──
export interface CallSession {
  id: string;
  callType: 'voice' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined';
  callerId: string;
  caller?: User;
  receiverId: string;
  receiver?: User;
  startedAt?: string;
  endedAt?: string;
  duration?: number;
  createdAt: string;
}

// ── Stickers ──
export interface StickerPack {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverUrl?: string;
  stickers: StickerItem[];
  userId: string;
  user?: User;
  isOfficial: boolean;
  downloadCount: number;
  createdAt: string;
}

export interface StickerItem {
  id: string;
  imageUrl: string;
  emoji?: string;
  packId: string;
}

// ── Post Collabs ──
export interface PostCollab {
  id: string;
  postId: string;
  post?: Post;
  userId: string;
  user?: User;
  status: 'pending' | 'accepted' | 'declined';
  invitedBy: string;
  createdAt: string;
}

// ── Channel Posts (Community) ──
export interface ChannelPost {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaTypes: string[];
  postType: 'text' | 'image' | 'poll' | 'quiz';
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isPinned: boolean;
  channelId: string;
  userId: string;
  user: User;
  createdAt: string;
}

// ── Audio Tracks ──
export interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  audioUrl: string;
  duration: number;
  usageCount: number;
  isTrending: boolean;
  genre?: string;
  userId: string;
  user?: User;
  createdAt: string;
}

// ── Feed Dismissal ──
export interface FeedDismissal {
  id: string;
  postId?: string;
  reelId?: string;
  threadId?: string;
  reason: string;
  userId: string;
  createdAt: string;
}

// ── New Batch 22 Types ──
export interface HashtagInfo {
  id: string;
  name: string;
  postsCount: number;
  reelsCount: number;
  threadsCount: number;
  videosCount: number;
  createdAt: string;
}

export interface BookmarkCollection {
  name: string;
  count: number;
  thumbnailUrl?: string;
}

export interface WatchLaterItem {
  id: string;
  videoId: string;
  userId: string;
  title: string;
  thumbnailUrl?: string;
  duration: number;
  viewsCount: number;
  createdAt: string;
  channel: { id: string; handle: string; name: string; avatarUrl?: string };
  addedAt: string;
}

// ── DM Notes ──
export interface DMNote {
  id: string;
  userId: string;
  content: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export type SearchSuggestionType = 'user' | 'hashtag' | 'post' | 'thread' | 'reel' | 'video';

export interface SearchSuggestion {
  type: SearchSuggestionType;
  id: string;
  name: string;
  avatarUrl?: string;
  displayName?: string;
  count?: number;
  extra?: string;
}

// ── Offline Downloads ──
export interface OfflineDownload {
  id: string;
  userId: string;
  contentType: 'post' | 'video' | 'reel';
  contentId: string;
  quality: string;
  fileSize: number;
  status: 'pending' | 'downloading' | 'complete' | 'failed' | 'paused';
  progress: number;
  filePath: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// ── Parental Controls ──
export interface ParentalControl {
  id: string;
  parentUserId: string;
  childUserId: string;
  restrictedMode: boolean;
  maxAgeRating: string;
  dailyLimitMinutes: number | null;
  dmRestriction: string;
  canGoLive: boolean;
  canPost: boolean;
  canComment: boolean;
  activityDigest: boolean;
  lastDigestAt: string | null;
  createdAt: string;
  updatedAt: string;
  child?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    isChildAccount: boolean;
  };
  parent?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export interface ParentalRestrictions {
  isLinked: boolean;
  restrictedMode: boolean;
  maxAgeRating: string;
  dailyLimitMinutes: number | null;
  dmRestriction: string;
  canGoLive: boolean;
  canPost: boolean;
  canComment: boolean;
}

export interface VideoPremiere {
  id: string;
  videoId: string;
  scheduledAt: string;
  isLive: boolean;
  chatEnabled: boolean;
  reminderCount: number;
  viewerCount: number;
  countdownTheme: string;
  trailerUrl: string | null;
  video?: { title: string; thumbnailUrl: string | null; channel?: { name: string; handle: string } };
}

export interface VideoClip {
  id: string;
  userId: string;
  sourceVideoId: string;
  title: string | null;
  startTime: number;
  endTime: number;
  duration: number;
  clipUrl: string | null;
  thumbnailUrl: string | null;
  viewsCount: number;
  likesCount: number;
  sharesCount: number;
  createdAt: string;
  user?: { id: string; username: string; displayName: string; avatarUrl: string | null; isVerified: boolean };
  sourceVideo?: { id: string; title: string; thumbnailUrl: string | null; duration: number };
}

export interface EndScreen {
  id: string;
  videoId: string;
  type: 'subscribe' | 'watch_next' | 'playlist' | 'link';
  targetId: string | null;
  label: string;
  url: string | null;
  position: string;
  showAtSeconds: number;
}

// AI types
export interface AiCaptionSuggestion {
  caption: string;
  tone: 'casual' | 'professional' | 'funny' | 'inspirational';
}

export interface AiModerationResult {
  safe: boolean;
  flags: string[];
  confidence: number;
  suggestion: string | null;
  category: string | null;
}

export interface AiSmartReply {
  text: string;
  tone: 'friendly' | 'formal' | 'emoji' | 'brief';
}

export interface AiSpaceRouting {
  recommendedSpace: 'SAF' | 'MAJLIS' | 'BAKRA' | 'MINBAR';
  confidence: number;
  reason: string;
}

export interface AiTranslation {
  id: string;
  contentId: string;
  targetLanguage: string;
  translatedText: string;
}

export interface AiCaption {
  id: string;
  videoId: string;
  language: string;
  srtContent: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
}

export interface AiAvatar {
  id: string;
  userId: string;
  sourceUrl: string;
  avatarUrl: string;
  style: string;
  createdAt: string;
}
