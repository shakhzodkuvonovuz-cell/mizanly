import { useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DraftPersistenceOptions {
  /** Debounce delay in ms for debouncedSave (default: 2000) */
  debounceMs?: number;
}

interface DraftPersistenceResult<T> {
  /** Immediately persist draft to AsyncStorage */
  save: (data: T) => Promise<void>;
  /** Remove draft from AsyncStorage */
  clear: () => Promise<void>;
  /** Debounced save — resets timer on each call, fires after debounceMs of inactivity */
  debouncedSave: (data: T) => void;
}

/**
 * Shared hook for draft save/restore across create screens.
 * Loads saved draft on mount, provides save, clear, and debouncedSave functions.
 * Cleans up debounce timer on unmount.
 *
 * Usage:
 *   const { save, clear, debouncedSave } = useDraftPersistence('post-draft', (draft) => {
 *     setTitle(draft.title);
 *     setContent(draft.content);
 *   });
 *
 *   // In useEffect watching content changes:
 *   debouncedSave({ title, content });
 */
export function useDraftPersistence<T>(
  key: string,
  onRestore: (draft: T) => void,
  options?: DraftPersistenceOptions,
): DraftPersistenceResult<T> {
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const debounceMs = options?.debounceMs ?? 2000;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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

  const debouncedSave = useCallback(
    (data: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          await AsyncStorage.setItem(key, JSON.stringify(data));
        } catch {
          // Storage full — non-critical, skip silently
        }
      }, debounceMs);
    },
    [key, debounceMs],
  );

  return { save, clear, debouncedSave };
}
