declare module 'expo-local-authentication' {
  export interface AuthenticateOptions {
    promptMessage?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
    fallbackLabel?: string;
  }

  export interface AuthenticateResult {
    success: boolean;
    error?: string;
    warning?: string;
  }

  export function hasHardwareAsync(): Promise<boolean>;
  export function isEnrolledAsync(): Promise<boolean>;
  export function authenticateAsync(options?: AuthenticateOptions): Promise<AuthenticateResult>;
  export function supportedAuthenticationTypesAsync(): Promise<number[]>;

  export enum AuthenticationType {
    FINGERPRINT = 1,
    FACIAL_RECOGNITION = 2,
    IRIS = 3,
  }
}
