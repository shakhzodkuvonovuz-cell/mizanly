import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Registers global keyboard shortcuts on web only.
 * - Ctrl+K → navigate to search
 * - Ctrl+N → navigate to create post
 * - Esc → go back (close modal / navigate back)
 *
 * No-op on native platforms.
 */
export function useWebKeyboardShortcuts(): void {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl+K → search
      if (isCtrl && e.key === 'k') {
        e.preventDefault();
        router.push('/(screens)/search' as `/${string}`);
        return;
      }

      // Ctrl+N → new post
      if (isCtrl && e.key === 'n') {
        e.preventDefault();
        router.push('/(screens)/create-post' as `/${string}`);
        return;
      }

      // Esc → go back / close modal
      if (e.key === 'Escape') {
        e.preventDefault();
        if (router.canGoBack()) {
          router.back();
        }
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router]);
}
