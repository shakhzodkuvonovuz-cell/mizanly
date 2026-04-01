/**
 * @deprecated REPLACED by src/services/signal/ (Signal Protocol E2E encryption).
 *
 * This stub provides backward-compatible exports so existing screens
 * (conversation/[id].tsx, verify-encryption.tsx) don't crash.
 * These screens will be updated to use the signal/ module.
 *
 * DO NOT add new code here. Use:
 *   import { ... } from '@/services/signal';
 */

class DeprecatedEncryptionService {
  initialized = false;

  async initialize(): Promise<void> {
    // No-op — Signal Protocol initialization happens via signalService.initialize()
  }

  hasConversationKey(_conversationId: string): boolean {
    return false; // Old encryption never worked (tweetnacl wasn't installed)
  }

  async encryptMessage(
    _conversationId: string,
    _content: string,
  ): Promise<{ ciphertext: string; nonce: string }> {
    throw new Error(
      'DeprecatedEncryptionService.encryptMessage() is disabled. Use signal service: import { signalService } from "@/services/signal"'
    );
  }

  async decryptMessage(
    _conversationId: string,
    _ciphertext: string,
    _nonce: string | null,
  ): Promise<string> {
    throw new Error(
      'DeprecatedEncryptionService.decryptMessage() is disabled. Use signal service: import { signalService } from "@/services/signal"'
    );
  }

  getFingerprint(): string {
    return '';
  }

  isInitialized(): boolean {
    return false;
  }

  async setupConversationEncryption(_conversationId: string, _memberIds?: string[]): Promise<boolean> {
    // No-op — Signal Protocol handles session establishment automatically
    return false;
  }

  getFingerprint2(): string {
    return '';
  }
}


export const encryptionService = new DeprecatedEncryptionService();
