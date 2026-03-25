import { useCallback } from 'react';
import { useStore } from '@/store';

/**
 * Finding #414: Progressive disclosure for new users.
 * Tracks which features a user has discovered so the UI can show
 * contextual tooltips/coach marks for undiscovered features.
 *
 * Features are identified by string keys:
 * - 'create_post', 'create_story', 'create_reel', 'create_thread'
 * - 'search', 'explore', 'notifications', 'dms'
 * - 'profile_edit', 'follow_user', 'like_post', 'comment'
 * - 'save_post', 'share_post', 'report'
 * - 'double_tap_like', 'swipe_reply', 'long_press_options'
 * - 'prayer_times', 'quran', 'dhikr', 'zakat_calculator'
 * - 'stories_viewer', 'reels_scroll', 'thread_reply'
 */
export function useProgressiveDisclosure(featureKey: string) {
  const discoveredFeatures = useStore(s => s.discoveredFeatures);
  const addDiscoveredFeature = useStore(s => s.addDiscoveredFeature);

  const isDiscovered = discoveredFeatures.includes(featureKey);

  const markDiscovered = useCallback(() => {
    if (!isDiscovered) {
      addDiscoveredFeature(featureKey);
    }
  }, [featureKey, isDiscovered, addDiscoveredFeature]);

  // Show coach mark only if the user hasn't discovered this feature yet
  // and they've been using the app for at least a little while (> 5 features discovered)
  const shouldShowCoachMark = !isDiscovered;

  // Show advanced feature hints only after user has discovered basics
  const isAdvancedUser = discoveredFeatures.length >= 10;

  return {
    isDiscovered,
    markDiscovered,
    shouldShowCoachMark,
    isAdvancedUser,
    totalDiscovered: discoveredFeatures.length,
  };
}

/**
 * Returns the suggested features to highlight based on user's discovery progress.
 * Used on home screen to gradually reveal features.
 */
export function useFeatureGating() {
  const discoveredFeatures = useStore(s => s.discoveredFeatures);
  const count = discoveredFeatures.length;

  // Progressive unlock tiers
  const tier = count < 3 ? 'beginner' : count < 10 ? 'intermediate' : count < 20 ? 'advanced' : 'expert';

  // Features visible at each tier
  const visibleFeatures = {
    beginner: ['feed', 'profile', 'search', 'create_post'],
    intermediate: ['stories', 'reels', 'threads', 'dms', 'notifications', 'save', 'share'],
    advanced: ['live', 'channels', 'analytics', 'collections', 'create_video', 'voice_post'],
    expert: ['api_settings', 'data_export', 'advanced_privacy', 'creator_studio'],
  };

  const available = [
    ...visibleFeatures.beginner,
    ...(tier !== 'beginner' ? visibleFeatures.intermediate : []),
    ...(tier === 'advanced' || tier === 'expert' ? visibleFeatures.advanced : []),
    ...(tier === 'expert' ? visibleFeatures.expert : []),
  ];

  return { tier, available, count };
}
