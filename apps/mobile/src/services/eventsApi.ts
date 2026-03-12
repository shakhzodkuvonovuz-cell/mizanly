import { api } from './api';
import type {
  Event,
  EventWithCounts,
  CreateEventDto,
  UpdateEventDto,
  RsvpDto,
  EventRSVP,
  RsvpStatus,
} from '@/types/events';
import type { PaginatedResponse } from '@/types';
import type { User } from '@/types';

const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return s ? `?${s}` : '';
};

export const eventsApi = {
  create: (data: CreateEventDto) => api.post<Event>('/events', data),

  list: (cursor?: string, limit?: number) =>
    api.get<PaginatedResponse<EventWithCounts>>(`/events${qs({ cursor, limit })}`),

  getById: (id: string) => api.get<EventWithCounts>(`/events/${id}`),

  update: (id: string, data: UpdateEventDto) => api.patch<Event>(`/events/${id}`, data),

  delete: (id: string) => api.delete(`/events/${id}`),

  rsvp: (eventId: string, data: RsvpDto) => api.post<EventRSVP>(`/events/${eventId}/rsvp`, data),

  removeRsvp: (eventId: string) => api.delete(`/events/${eventId}/rsvp`),

  listAttendees: (eventId: string, cursor?: string, status?: RsvpStatus) =>
    api.get<PaginatedResponse<User>>(`/events/${eventId}/attendees${qs({ cursor, status })}`),
};