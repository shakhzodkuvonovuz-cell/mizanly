import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function isHapticAvailable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function useHaptic() {
  const light = useCallback(() => {
    if (!isHapticAvailable()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const medium = useCallback(() => {
    if (!isHapticAvailable()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const heavy = useCallback(() => {
    if (!isHapticAvailable()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, []);

  const success = useCallback(() => {
    if (!isHapticAvailable()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const warning = useCallback(() => {
    if (!isHapticAvailable()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);

  const error = useCallback(() => {
    if (!isHapticAvailable()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, []);

  const selection = useCallback(() => {
    if (!isHapticAvailable()) return;
    Haptics.selectionAsync().catch(() => {});
  }, []);

  return { light, medium, heavy, success, warning, error, selection };
}
