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

  validate: (data: ValidateTwoFactorDto) => api.post<{ valid: boolean; twoFactorEnabled: boolean; sessionVerified: boolean }>('/two-factor/validate', data),

  // Uses DELETE with body — backend expects @Delete with @Body. Works on most infra;
  // some proxies may strip DELETE bodies. If issues arise, change both client+server to POST.
  disable: (data: DisableTwoFactorDto) => api.delete('/two-factor/disable', data),

  status: () => api.get<TwoFactorStatus>('/two-factor/status'),

  backup: (data: BackupCodeDto) => api.post<{ success: boolean }>('/two-factor/backup', data),
};