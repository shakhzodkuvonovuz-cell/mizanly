import { api } from './api';

type ScholarQASession = {
  id: string;
  scholarId: string;
  title: string;
  description?: string;
  category: string;
  language?: string;
  scheduledAt: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  recordingUrl?: string;
  scholar?: { id: string; displayName: string; avatarUrl?: string };
  questions?: ScholarQuestion[];
};

type ScholarQuestion = {
  id: string;
  qaSessionId: string;
  userId: string;
  question: string;
  votes: number;
  isAnswered: boolean;
  createdAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

export const scholarQaApi = {
  schedule: (data: {
    title: string;
    description?: string;
    category: string;
    language?: string;
    scheduledAt: string;
  }) =>
    api.post<ScholarQASession>('/scholar-qa', data),

  getUpcoming: () =>
    api.get<ScholarQASession[]>('/scholar-qa/upcoming'),

  getRecordings: () =>
    api.get<ScholarQASession[]>('/scholar-qa/recordings'),

  getById: (id: string) =>
    api.get<ScholarQASession>(`/scholar-qa/${id}`),

  submitQuestion: (sessionId: string, question: string) =>
    api.post<ScholarQuestion>(`/scholar-qa/${sessionId}/questions`, { question }),

  voteQuestion: (sessionId: string, questionId: string) =>
    api.post<{ votes: number }>(`/scholar-qa/${sessionId}/questions/${questionId}/vote`, {}),

  startSession: (sessionId: string) =>
    api.put<ScholarQASession>(`/scholar-qa/${sessionId}/start`, {}),

  endSession: (sessionId: string) =>
    api.put<ScholarQASession>(`/scholar-qa/${sessionId}/end`, {}),

  markAnswered: (sessionId: string, questionId: string) =>
    api.put<ScholarQuestion>(`/scholar-qa/${sessionId}/questions/${questionId}/answered`, {}),
};
