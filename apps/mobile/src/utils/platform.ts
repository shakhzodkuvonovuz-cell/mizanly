import { Platform } from 'react-native';

/**
 * Platform detection constants and safe wrappers for native-only APIs.
 * Import these instead of calling Platform.OS directly throughout the app.
 */

/** True when running in a web browser (Expo Web / React Native Web) */
export const isWeb = Platform.OS === 'web';

/** True when running on iOS or Android (i.e., NOT web) */
export const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

/** True on iOS only */
export const isIOS = Platform.OS === 'ios';

/** True on Android only */
export const isAndroid = Platform.OS === 'android';

/**
 * Trigger a haptic impact. No-op on web.
 * Uses dynamic import so expo-haptics is never loaded on web.
 */
export async function hapticImpact(
  style: 'light' | 'medium' | 'heavy' = 'medium',
): Promise<void> {
  if (!isNative) return;
  try {
    const Haptics = await import('expo-haptics');
    const styleMap = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    } as const;
    await Haptics.impactAsync(styleMap[style]);
  } catch {
    // Haptics are non-critical — swallow errors silently
  }
}

/**
 * Trigger a haptic notification feedback. No-op on web.
 */
export async function hapticNotification(
  type: 'success' | 'warning' | 'error' = 'success',
): Promise<void> {
  if (!isNative) return;
  try {
    const Haptics = await import('expo-haptics');
    const typeMap = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    } as const;
    await Haptics.notificationAsync(typeMap[type]);
  } catch {
    // Haptics are non-critical
  }
}

/**
 * Trigger a haptic selection tap. No-op on web.
 */
export async function hapticSelection(): Promise<void> {
  if (!isNative) return;
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.selectionAsync();
  } catch {
    // Haptics are non-critical
  }
}

/**
 * Safe wrapper to get the Expo push token. Returns null on web.
 */
export async function getExpoPushToken(
  projectId: string | undefined,
): Promise<string | null> {
  if (!isNative) return null;
  try {
    const Notifications = await import('expo-notifications');
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch {
    return null;
  }
}

/**
 * Check if the current device is a physical device (not emulator/simulator).
 * Returns false on web.
 */
export async function isPhysicalDevice(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const Device = await import('expo-device');
    return Device.default.isDevice;
  } catch {
    return false;
  }
}
