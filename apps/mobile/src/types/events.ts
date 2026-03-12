import type { User } from '@/types';
import type { PaginatedResponse } from '@/types';

export type EventPrivacy = 'public' | 'private' | 'community';
export type EventType = 'in_person' | 'virtual' | 'hybrid';
export type RsvpStatus = 'going' | 'maybe' | 'not_going';

export interface Event {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  startDate: string;
  endDate?: string;
  location?: string;
  locationUrl?: string;
  isOnline: boolean;
  onlineUrl?: string;
  eventType: EventType;
  privacy: EventPrivacy;
  userId: string;
  user: User;
  communityId?: string;
  rsvps?: EventRSVP[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    rsvps: number;
    goingCount: number;
    maybeCount: number;
    notGoingCount: number;
  };
}

export interface EventRSVP {
  id: string;
  eventId: string;
  userId: string;
  user: User;
  status: RsvpStatus;
  createdAt: string;
}

// DTOs
export interface CreateEventDto {
  title: string;
  description?: string;
  coverUrl?: string;
  startDate: string;
  endDate?: string;
  location?: string;
  isOnline: boolean;
  onlineUrl?: string;
  eventType: EventType;
  privacy: EventPrivacy;
  communityId?: string;
}

export type UpdateEventDto = Partial<CreateEventDto>;

export interface RsvpDto {
  status: RsvpStatus;
}

// Response types
export type EventWithCounts = Event & {
  _count: {
    rsvps: number;
    goingCount: number;
    maybeCount: number;
    notGoingCount: number;
  };
};