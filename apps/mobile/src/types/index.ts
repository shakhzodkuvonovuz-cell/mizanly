// ── User ──
export interface User {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  coverPhotoUrl?: string;
  websiteUrl?: string;
  isVerified: boolean;
  isPrivate: boolean;
  createdAt: string;
  _count?: { followers: number; following: number; posts: number; threads: number };
  isFollowing?: boolean;
}

// ── Saf: Posts ──
export type PostType = 'IMAGE' | 'CAROUSEL' | 'TEXT' | 'SHARED_THREAD' | 'SHARED_REEL';
export type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'CIRCLE' | 'MENTIONED';
export type MediaType = 'IMAGE' | 'VIDEO' | 'GIF';

export interface PostMedia {
  id: string;
  url: string;
  type: MediaType;
  width?: number;
  height?: number;
  order: number;
}

export interface Post {
  id: string;
  type: PostType;
  caption?: string;
  visibility: Visibility;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  author: User;
  media: PostMedia[];
  circle?: Circle;
  isLiked?: boolean;
  isBookmarked?: boolean;
}

// ── Saf: Stories ──
export interface Story {
  id: string;
  mediaUrl: string;
  type: MediaType;
  duration: number;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
}

export interface StoryGroup {
  user: User;
  stories: Story[];
  hasUnseen?: boolean;
}

// ── Majlis: Threads ──
export interface ThreadMedia {
  id: string;
  url: string;
  type: MediaType;
  order: number;
}

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
  order: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  expiresAt: string;
  hasVoted?: boolean;
  votedOptionId?: string;
}

export interface Thread {
  id: string;
  content: string;
  visibility: Visibility;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  viewCount: number;
  isPinned: boolean;
  createdAt: string;
  author: User;
  media: ThreadMedia[];
  poll?: Poll;
  circle?: Circle;
  replyTo?: { id: string; content: string; author: { username: string } };
  isLiked?: boolean;
  isReposted?: boolean;
  isBookmarked?: boolean;
}

// ── Risalah: Messages ──
export type ConversationType = 'DM' | 'GROUP' | 'CHANNEL';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'DOCUMENT' | 'LOCATION' | 'CONTACT' | 'POLL' | 'SHARED_POST' | 'SHARED_THREAD' | 'SHARED_REEL' | 'SYSTEM';

export interface Message {
  id: string;
  type: MessageType;
  content?: string;
  mediaUrl?: string;
  isForwarded: boolean;
  createdAt: string;
  sender: User;
  replyTo?: { id: string; content: string; senderId: string };
  reactions?: { emoji: string; userId: string }[];
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatarUrl?: string;
  lastMessageAt?: string;
  members: { user: User; role: string }[];
  messages?: Message[];
  isMuted?: boolean;
  isPinned?: boolean;
  lastReadAt?: string;
  unreadCount?: number;
}

// ── Circles ──
export interface Circle {
  id: string;
  name: string;
  emoji?: string;
  _count?: { members: number };
}

// ── Comments ──
export interface Comment {
  id: string;
  content: string;
  likeCount: number;
  isPinned: boolean;
  createdAt: string;
  author: User;
  _count?: { replies: number };
}

// ── Notifications ──
export type NotificationType = 'FOLLOW' | 'LIKE_POST' | 'LIKE_THREAD' | 'LIKE_REEL' | 'LIKE_COMMENT' | 'COMMENT' | 'MENTION' | 'REPOST' | 'QUOTE' | 'MESSAGE_REQUEST' | 'LIVE' | 'SPACE' | 'SYSTEM';

export interface Notification {
  id: string;
  type: NotificationType;
  targetType?: string;
  targetId?: string;
  read: boolean;
  createdAt: string;
  actor: User;
}

// ── Search ──
export interface SearchResults {
  people?: User[];
  threads?: Thread[];
  posts?: Post[];
  hashtags?: { id: string; name: string; postCount: number }[];
}
