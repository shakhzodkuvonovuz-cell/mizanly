export interface TwoFactorSecret {
  id: string;
  userId: string;
  secret: string;
  isEnabled: boolean;
  backupCodes: string[];
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qrDataUri: string;
  backupCodes: string[];
}

export interface VerifyTwoFactorDto {
  code: string;
}

export interface ValidateTwoFactorDto {
  code: string;
}

export interface DisableTwoFactorDto {
  code: string;
}

export interface BackupCodeDto {
  backupCode: string;
}

export interface TwoFactorStatus {
  isEnabled: boolean;
  verifiedAt?: string;
  backupCodesRemaining: number;
}