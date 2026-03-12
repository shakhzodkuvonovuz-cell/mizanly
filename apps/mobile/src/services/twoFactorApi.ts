import { api } from './api';
import type {
  TwoFactorSetupResponse,
  TwoFactorStatus,
  VerifyTwoFactorDto,
  ValidateTwoFactorDto,
  DisableTwoFactorDto,
  BackupCodeDto,
} from '@/types/twoFactor';

export const twoFactorApi = {
  setup: () => api.post<TwoFactorSetupResponse>('/two-factor/setup'),

  verify: (data: VerifyTwoFactorDto) => api.post<TwoFactorStatus>('/two-factor/verify', data),

  validate: (data: ValidateTwoFactorDto) => api.post<{ valid: boolean }>('/two-factor/validate', data),

  disable: (data: DisableTwoFactorDto) => api.delete('/two-factor/disable', data),

  status: () => api.get<TwoFactorStatus>('/two-factor/status'),

  backup: (data: BackupCodeDto) => api.post<{ success: boolean }>('/two-factor/backup', data),
};