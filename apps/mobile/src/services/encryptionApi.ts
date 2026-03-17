import { api } from './api';
import type { EncryptionKeyInfo, KeyEnvelope } from '@/types/encryption';

export const encryptionApi = {
  registerKey: (publicKey: string) =>
    api.post<EncryptionKeyInfo>('/encryption/keys', { publicKey }),

  getPublicKey: (userId: string) =>
    api.get<EncryptionKeyInfo>(`/encryption/keys/${userId}`),

  getBulkKeys: (userIds: string[]) =>
    api.get<EncryptionKeyInfo[]>(`/encryption/keys/bulk?userIds=${userIds.join(',')}`),

  storeEnvelope: (data: { conversationId: string; recipientId: string; encryptedKey: string; nonce: string }) =>
    api.post('/encryption/envelopes', data),

  getEnvelope: (conversationId: string) =>
    api.get<KeyEnvelope | null>(`/encryption/envelopes/${conversationId}`),

  rotateKey: (conversationId: string, envelopes: { userId: string; encryptedKey: string; nonce: string }[]) =>
    api.post(`/encryption/rotate/${conversationId}`, { envelopes }),
};
