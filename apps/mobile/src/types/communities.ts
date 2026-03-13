import type { User } from '@/types';
import type { PaginatedResponse } from '@/types';

export interface Community {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverUrl?: string;
  avatarUrl?: string;
  emoji?: string;
  category?: string;
  privacy: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';
  rules?: string;
  memberCount: number;
  postsCount: number;
  isJoined: boolean;
  unreadCount?: number;
  owner?: User;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommunityMember {
  userId: string;
  user: User;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

// DTOs
export interface CreateCommunityDto {
  name: string;
  description?: string;
  coverUrl?: string;
  avatarUrl?: string;
  emoji?: string;
  category?: string;
  isPrivate?: boolean;
  rules?: string;
}

export type UpdateCommunityDto = Partial<CreateCommunityDto>;