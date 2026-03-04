import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function isHapticAvailable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function useHaptic() {
  const light = () => {
    if (!isHapticAvailable()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const medium = () => {
    if (!isHapticAvailable()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const heavy = () => {
    if (!isHapticAvailable()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  };

  const success = () => {
    if (!isHapticAvailable()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const warning = () => {
    if (!isHapticAvailable()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  };

  const error = () => {
    if (!isHapticAvailable()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  };

  const selection = () => {
    if (!isHapticAvailable()) return;
    Haptics.selectionAsync().catch(() => {});
  };

  return { light, medium, heavy, success, warning, error, selection };
}
