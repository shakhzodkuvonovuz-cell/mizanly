import { useEffect, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import { AppState } from 'react-native';
import { useStore } from '@/store';

/**
 * Finding #375: Clipboard link detection.
 * When user returns to the app, check if clipboard contains a Mizanly link.
 * If so, store it for the UI to show a "Open in app?" prompt.
 */
export function useClipboardLinkDetection() {
  const setLastDetectedLink = useStore(s => s.setLastDetectedLink);
  const lastDetectedLink = useStore(s => s.lastDetectedLink);

  const checkClipboard = useCallback(async () => {
    try {
      const hasString = await Clipboard.hasStringAsync();
      if (!hasString) return;

      const text = await Clipboard.getStringAsync();
      if (!text) return;

      // Check if it's a Mizanly link
      const mizanlyPatterns = [
        /mizanly\.app\/(post|reel|thread|video|user|profile)\//i,
        /mizanly\.app\/join\?ref=/i,
      ];

      const isMizanlyLink = mizanlyPatterns.some(p => p.test(text));
      if (isMizanlyLink && text !== lastDetectedLink) {
        setLastDetectedLink(text);
      }
    } catch {
      // Clipboard access may be denied — non-blocking
    }
  }, [setLastDetectedLink, lastDetectedLink]);

  useEffect(() => {
    // Check on app foreground
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkClipboard();
      }
    });

    // Initial check
    checkClipboard();

    return () => subscription.remove();
  }, [checkClipboard]);

  const dismissLink = useCallback(() => {
    setLastDetectedLink(null);
  }, [setLastDetectedLink]);

  return { detectedLink: lastDetectedLink, dismissLink };
}
