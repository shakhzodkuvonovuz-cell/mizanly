import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function isHapticAvailable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Contextual haptic feedback patterns for different action types.
 * Instagram/TikTok use different haptic intensities per action — this creates
 * a subconscious sense of richness and intentionality.
 *
 * Usage:
 *   const haptic = useContextualHaptic();
 *   haptic.like();      // double-tap heart, reaction
 *   haptic.follow();    // follow, subscribe
 *   haptic.save();      // bookmark, save to collection
 *   haptic.navigate();  // tab press, back, push
 *   haptic.tick();      // tab switch, picker scroll
 *   haptic.delete();    // destructive actions
 *   haptic.error();     // validation failure
 *   haptic.longPress(); // context menu trigger
 */
export function useContextualHaptic() {
  return useMemo(() => ({
    /** Like, heart, reaction — satisfying medium thud */
    like: () => {
      if (!isHapticAvailable()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },

    /** Follow, subscribe — success confirmation */
    follow: () => {
      if (!isHapticAvailable()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },

    /** Bookmark, save — light touch */
    save: () => {
      if (!isHapticAvailable()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },

    /** Tab press, back, navigate — light touch */
    navigate: () => {
      if (!isHapticAvailable()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },

    /** Tab switch, picker change — selection click */
    tick: () => {
      if (!isHapticAvailable()) return;
      Haptics.selectionAsync().catch(() => {});
    },

    /** Destructive action confirm — warning buzz */
    delete: () => {
      if (!isHapticAvailable()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    },

    /** Validation failure, error state — error buzz */
    error: () => {
      if (!isHapticAvailable()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    },

    /** Long-press context menu — heavy thud */
    longPress: () => {
      if (!isHapticAvailable()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    },

    /** Send message, post content — medium confirmation */
    send: () => {
      if (!isHapticAvailable()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },

    /** Success completion — success notification */
    success: () => {
      if (!isHapticAvailable()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
  }), []);
}
