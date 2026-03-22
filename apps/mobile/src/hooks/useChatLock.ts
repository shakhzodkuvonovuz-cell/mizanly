// Hook for managing per-conversation biometric lock
// Uses expo-secure-store to store locked conversation IDs
// Uses expo-local-authentication for Face ID / fingerprint

import { useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const LOCKED_CHATS_KEY = 'mizanly_locked_chats';

async function getLockedIds(): Promise<string[]> {
  const stored = await SecureStore.getItemAsync(LOCKED_CHATS_KEY);
  if (!stored) return [];
  try { return JSON.parse(stored) as string[]; }
  catch { await SecureStore.deleteItemAsync(LOCKED_CHATS_KEY); return []; }
}

async function saveLockedIds(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(LOCKED_CHATS_KEY, JSON.stringify(ids));
}

/** Authenticate with device biometrics (Face ID / fingerprint) */
async function authenticate(promptMessage: string): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false; // No biometrics hardware = deny access (don't bypass lock)

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) return false; // No biometrics enrolled = deny access (don't bypass lock)

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return result.success;
}

export function useChatLock() {
  /** Check if a conversation is locked */
  const isLocked = useCallback(async (conversationId: string): Promise<boolean> => {
    const lockedIds = await getLockedIds();
    return lockedIds.includes(conversationId);
  }, []);

  /** Lock a conversation (requires biometric auth first) */
  const lockConversation = useCallback(async (conversationId: string): Promise<boolean> => {
    const authed = await authenticate('Authenticate to lock this chat');
    if (!authed) return false;

    const lockedIds = await getLockedIds();
    if (!lockedIds.includes(conversationId)) {
      lockedIds.push(conversationId);
      await saveLockedIds(lockedIds);
    }
    return true;
  }, []);

  /** Unlock a conversation (requires biometric auth first) */
  const unlockConversation = useCallback(async (conversationId: string): Promise<boolean> => {
    const authed = await authenticate('Authenticate to unlock this chat');
    if (!authed) return false;

    const lockedIds = await getLockedIds();
    const filtered = lockedIds.filter((id) => id !== conversationId);
    await saveLockedIds(filtered);
    return true;
  }, []);

  /** Authenticate to view a locked chat */
  const authenticateForChat = useCallback(async (): Promise<boolean> => {
    return authenticate('Authenticate to access this chat');
  }, []);

  /** Check if device supports biometric authentication */
  const isBiometricAvailable = useCallback(async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  }, []);

  return {
    isLocked,
    lockConversation,
    unlockConversation,
    authenticateForChat,
    isBiometricAvailable,
  };
}
