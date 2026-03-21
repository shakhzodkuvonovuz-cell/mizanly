import { api } from './api';

type Checklist = {
  id: string;
  conversationId: string;
  creatorId: string;
  title: string;
  createdAt: string;
  items?: ChecklistItem[];
};

type ChecklistItem = {
  id: string;
  checklistId: string;
  text: string;
  isCompleted: boolean;
  completedBy?: string;
  createdAt: string;
};

export const checklistsApi = {
  create: (data: { conversationId: string; title: string }) =>
    api.post<Checklist>('/checklists', data),

  getByConversation: (conversationId: string) =>
    api.get<Checklist[]>(`/checklists/conversation/${conversationId}`),

  addItem: (checklistId: string, text: string) =>
    api.post<ChecklistItem>(`/checklists/${checklistId}/items`, { text }),

  toggleItem: (itemId: string) =>
    api.patch<ChecklistItem>(`/checklists/items/${itemId}/toggle`, {}),

  deleteItem: (itemId: string) =>
    api.delete<void>(`/checklists/items/${itemId}`),

  deleteChecklist: (checklistId: string) =>
    api.delete<void>(`/checklists/${checklistId}`),
};
