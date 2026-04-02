import { useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Shared hook for draft save/restore across create screens.
 * Loads saved draft on mount, provides save and clear functions.
 *
 * Usage:
 *   const { save, clear } = useDraftPersistence('post-draft', (draft) => {
 *     setTitle(draft.title);
 *     setContent(draft.content);
 *   });
 */
export function useDraftPersistence<T>(
  key: string,
  onRestore: (draft: T) => void,
): { save: (data: T) => Promise<void>; clear: () => Promise<void> } {
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((saved) => {
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as T;
            onRestoreRef.current(parsed);
          } catch {
            // Corrupted draft — clear it
            AsyncStorage.removeItem(key).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, [key]);

  const save = useCallback(
    async (data: T) => {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    },
    [key],
  );

  const clear = useCallback(async () => {
    await AsyncStorage.removeItem(key);
  }, [key]);

  return { save, clear };
}
