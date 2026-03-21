import { api } from './api';

type StreamStatus = {
  uid: string;
  readyToStream: boolean;
  status?: { state: string; errorReasonCode?: string };
};

export const streamApi = {
  /** Handle stream webhook (server-side only, included for type completeness) */
  handleWebhook: (body: {
    uid: string;
    readyToStream?: boolean;
    status?: { state: string; errorReasonCode?: string };
  }) =>
    api.post<{ received: boolean }>('/stream/webhook', body),
};
