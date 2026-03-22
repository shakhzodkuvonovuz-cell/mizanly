import type { User } from '@/types';
import type { PaginatedResponse } from '@/types';

export type AudioRoomStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type ParticipantRole = 'host' | 'speaker' | 'listener';

export interface AudioRoom {
  id: string;
  title: string;
  description?: string;
  hostId: string;
  host: User;
  status: AudioRoomStatus;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  maxSpeakers: number;
  isRecording: boolean;
  participants?: AudioRoomParticipant[];
  createdAt: string;
  _count?: {
    participants: number;
    speakers: number;
    listeners: number;
  };
}

export interface AudioRoomParticipant {
  id: string;
  roomId: string;
  userId: string;
  user: User;
  role: ParticipantRole;
  isMuted: boolean;
  handRaised: boolean;
  handRaisedAt?: string;
  isSpeaking?: boolean;
  joinedAt: string;
}

// DTOs
export interface CreateAudioRoomDto {
  title: string;
  description?: string;
  scheduledAt?: string;
  maxSpeakers?: number;
}

export interface UpdateParticipantRoleDto {
  userId: string;
  role: ParticipantRole;
}

export interface AudioRoomStats {
  totalRooms: number;
  totalParticipants: number;
  averageDuration: number;
  peakConcurrent: number;
}